document.addEventListener('DOMContentLoaded', () => {
    let audioCtx = null;
    let masterCompressor = null;
    let masterInput = null; // El nuevo bus maestro donde llega todo el audio

    // Nodos de control de ganancia de los efectos (Sends)
    let reverbSend, delaySend, chorusSend;

    // Función matemática para generar una respuesta a impulsos de Reverb en RAM (Cero dependencias)
    const buildImpulse = (ctx, duration, decay) => {
        const sampleRate = ctx.sampleRate;
        const length = sampleRate * duration;
        const impulse = ctx.createBuffer(2, length, sampleRate);
        const left = impulse.getChannelData(0);
        const right = impulse.getChannelData(1);
        for (let i = 0; i < length; i++) {
            const n = 1 - (i / length);
            left[i] = (Math.random() * 2 - 1) * Math.pow(n, decay);
            right[i] = (Math.random() * 2 - 1) * Math.pow(n, decay);
        }
        return impulse;
    };

    const initAudio = () => {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
            
            // 1. LIMITADOR MAESTRO (Salida Final)
            masterCompressor = audioCtx.createDynamicsCompressor();
            masterCompressor.threshold.setValueAtTime(-12, audioCtx.currentTime);
            masterCompressor.knee.setValueAtTime(10, audioCtx.currentTime);
            masterCompressor.ratio.setValueAtTime(12, audioCtx.currentTime);
            masterCompressor.attack.setValueAtTime(0, audioCtx.currentTime);
            masterCompressor.release.setValueAtTime(0.25, audioCtx.currentTime);
            masterCompressor.connect(audioCtx.destination);

            // 2. BUS MAESTRO DE ENTRADA (Aquí llega el Dron, Pads y RAM)
            masterInput = audioCtx.createGain();
            
            // Ruta Seca (Dry): Directo al compresor
            masterInput.connect(masterCompressor);

            // 3. RUTA FX: REVERB (Sala grande, 3s decay)
            reverbSend = audioCtx.createGain();
            reverbSend.gain.value = 0;
            const convolver = audioCtx.createConvolver();
            convolver.buffer = buildImpulse(audioCtx, 3.0, 2.0);
            masterInput.connect(reverbSend);
            reverbSend.connect(convolver);
            convolver.connect(masterCompressor);

            // 4. RUTA FX: DELAY (Ping-Pong 3/8)
            delaySend = audioCtx.createGain();
            delaySend.gain.value = 0;
            const delayNode = audioCtx.createDelay(1.0);
            delayNode.delayTime.value = 0.375; 
            const feedbackGain = audioCtx.createGain();
            feedbackGain.gain.value = 0.5; // Cantidad de repeticiones
            
            masterInput.connect(delaySend);
            delaySend.connect(delayNode);
            delayNode.connect(feedbackGain);
            feedbackGain.connect(delayNode);
            delayNode.connect(masterCompressor);

            // 5. RUTA FX: CHORUS (Retraso modulado corto)
            chorusSend = audioCtx.createGain();
            chorusSend.gain.value = 0;
            const chorusDelay = audioCtx.createDelay();
            chorusDelay.delayTime.value = 0.03;
            const lfo = audioCtx.createOscillator();
            lfo.type = 'sine';
            lfo.frequency.value = 1.5; // Velocidad del chorus
            const lfoGain = audioCtx.createGain();
            lfoGain.gain.value = 0.005; // Profundidad del chorus
            
            lfo.connect(lfoGain);
            lfoGain.connect(chorusDelay.delayTime);
            lfo.start();
            
            masterInput.connect(chorusSend);
            chorusSend.connect(chorusDelay);
            chorusDelay.connect(masterCompressor);
        }
        if (audioCtx.state === 'suspended') audioCtx.resume();
    };

    document.body.addEventListener('pointerdown', initAudio, { once: true });

    /* =====================================================================
       0. CONTROLES DE LA INTERFAZ FX
       ===================================================================== */
    const fxReverb = document.getElementById('fx-reverb');
    const fxDelay = document.getElementById('fx-delay');
    const fxChorus = document.getElementById('fx-chorus');
    
    const updateFX = (input, sendNode, labelId) => {
        const val = input.value;
        document.getElementById(labelId).innerText = `${val}%`;
        if (sendNode) {
            // Curva exponencial sutil para que los efectos suban suavemente
            sendNode.gain.setTargetAtTime(val / 100, audioCtx.currentTime, 0.05);
        }
    };

    fxReverb.addEventListener('input', (e) => updateFX(e.target, reverbSend, 'val-rev'));
    fxDelay.addEventListener('input', (e) => updateFX(e.target, delaySend, 'val-del'));
    fxChorus.addEventListener('input', (e) => updateFX(e.target, chorusSend, 'val-cho'));

    /* =====================================================================
       1. DRON CENTRAL (Multitouch Polifónico)
       ===================================================================== */
    const canvas = document.getElementById('dron-canvas');
    const ctx = canvas.getContext('2d');
    const statusDron = document.getElementById('dron-status');
    const activeTouches = new Map();

    const resize = () => {
        canvas.width = canvas.parentElement.clientWidth;
        canvas.height = canvas.parentElement.clientHeight;
    };
    window.addEventListener('resize', resize);
    resize();

    const drawLoop = () => {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        activeTouches.forEach(touch => {
            ctx.beginPath();
            ctx.arc(touch.x, touch.y, 40, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(57, 255, 20, 0.8)';
            ctx.fill();
        });
        requestAnimationFrame(drawLoop);
    };
    requestAnimationFrame(drawLoop);

    const startDron = (pointerId, x, y) => {
        initAudio();
        const gainNode = audioCtx.createGain();
        gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.3, audioCtx.currentTime + 4);
        
        // CONECTADO AL BUS MAESTRO (Para pasar por los FX)
        gainNode.connect(masterInput);

        const freqs = [55, 110, 165, 220];
        const oscillators = freqs.map((f, i) => {
            const osc = audioCtx.createOscillator();
            const filter = audioCtx.createBiquadFilter();
            osc.type = i % 2 === 0 ? 'sine' : 'sawtooth';
            osc.frequency.setValueAtTime(f, audioCtx.currentTime);
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(400, audioCtx.currentTime);
            osc.connect(filter);
            filter.connect(gainNode);
            osc.start();
            return { osc, filter, baseFreq: f };
        });

        activeTouches.set(pointerId, { x, y, oscillators, gainNode });
        updateDronAudio(pointerId, x, y);
    };

    const updateDronAudio = (pointerId, x, y) => {
        const touch = activeTouches.get(pointerId);
        if (!touch) return;
        
        touch.x = x; touch.y = y;
        const normX = x / canvas.width;
        const normY = 1 - (y / canvas.height);

        statusDron.innerText = `TOQUES: ${activeTouches.size} // FX ACTIVO`;
        const time = audioCtx.currentTime;
        touch.oscillators.forEach((node, i) => {
            node.osc.frequency.setTargetAtTime(node.baseFreq + (normX * 10 * i), time, 0.1);
            node.filter.frequency.setTargetAtTime(200 + (normY * 2000), time, 0.1);
        });
    };

    const stopDron = (pointerId) => {
        const touch = activeTouches.get(pointerId);
        if (!touch) return;

        if (touch.gainNode) {
            touch.gainNode.gain.cancelScheduledValues(audioCtx.currentTime);
            touch.gainNode.gain.setValueAtTime(touch.gainNode.gain.value, audioCtx.currentTime);
            touch.gainNode.gain.linearRampToValueAtTime(0.0001, audioCtx.currentTime + 6);
            const nodesToKill = touch.oscillators;
            const gainToKill = touch.gainNode;
            setTimeout(() => {
                nodesToKill.forEach(n => { n.osc.stop(); n.osc.disconnect(); n.filter.disconnect(); });
                gainToKill.disconnect();
            }, 6100);
        }
        
        activeTouches.delete(pointerId);
        if (activeTouches.size === 0) statusDron.innerText = `MODO ESPERA`;
    };

    canvas.addEventListener('pointerdown', (e) => {
        canvas.setPointerCapture(e.pointerId);
        startDron(e.pointerId, e.offsetX, e.offsetY);
    });
    canvas.addEventListener('pointermove', (e) => {
        if (activeTouches.has(e.pointerId)) updateDronAudio(e.pointerId, e.offsetX, e.offsetY);
    });
    canvas.addEventListener('pointerup', (e) => stopDron(e.pointerId));
    canvas.addEventListener('pointercancel', (e) => stopDron(e.pointerId));

    /* =====================================================================
       2. ENSAMBLE CUANTIZADO (Conectado a FX Master)
       ===================================================================== */
    const padGrid = document.getElementById('pad-grid');
    const pentatonica = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25];

    pentatonica.forEach((freq, idx) => {
        const btn = document.createElement('button');
        btn.classList.add('pad');
        btn.innerText = `PAD_0${idx + 1}`;
        btn.oncontextmenu = (e) => e.preventDefault(); 

        const playNota = (e) => {
            e.preventDefault(); 
            initAudio();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();

            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
            gain.gain.setValueAtTime(0, audioCtx.currentTime);
            gain.gain.linearRampToValueAtTime(0.5, audioCtx.currentTime + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1.2);

            osc.connect(gain);
            
            // CONECTADO AL BUS MAESTRO
            gain.connect(masterInput); 

            osc.onended = () => { gain.disconnect(); osc.disconnect(); };
            osc.start(audioCtx.currentTime);
            osc.stop(audioCtx.currentTime + 1.2);

            btn.classList.add('active-pad');
            setTimeout(() => btn.classList.remove('active-pad'), 100);
        };
        btn.addEventListener('pointerdown', playNota);
        padGrid.appendChild(btn);
    });

    /* =====================================================================
       3. PAISAJES EFÍMEROS (Conectado a FX Master)
       ===================================================================== */
    const fileInput = document.getElementById('audio-upload');
    const playEfimeroBtn = document.getElementById('play-efimero');
    const stopEfimeroBtn = document.getElementById('stop-efimero');
    const statusRam = document.getElementById('file-status');
    const containerBtns = document.getElementById('playback-buttons');

    let bufferRam = null;
    let sourceNode = null;
    let gainEfimero = null;

    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        initAudio();
        statusRam.innerText = `DECODIFICANDO A RAM...`;
        const arrayBuffer = await file.arrayBuffer();
        try {
            bufferRam = await audioCtx.decodeAudioData(arrayBuffer);
            statusRam.innerText = `RAM OK: ${file.name.toUpperCase()}`;
            containerBtns.style.display = 'flex';
        } catch (err) {
            statusRam.innerText = `ERROR DE LECTURA.`;
        }
        fileInput.value = ''; 
    });

    playEfimeroBtn.addEventListener('pointerdown', () => {
        if (!bufferRam) return;
        if (sourceNode) {
            try { sourceNode.stop(); sourceNode.disconnect(); } catch(e){}
        }
        sourceNode = audioCtx.createBufferSource();
        sourceNode.buffer = bufferRam;
        sourceNode.loop = true;

        gainEfimero = audioCtx.createGain();
        gainEfimero.gain.value = 0.6;

        sourceNode.connect(gainEfimero);
        
        // CONECTADO AL BUS MAESTRO
        gainEfimero.connect(masterInput);
        
        sourceNode.start();
        playEfimeroBtn.style.color = 'var(--bg-pure)';
        playEfimeroBtn.style.backgroundColor = 'var(--phosphor-green)';
    });

    stopEfimeroBtn.addEventListener('pointerdown', () => {
        if (sourceNode) {
            sourceNode.stop();
            sourceNode.disconnect();
            gainEfimero.disconnect();
            sourceNode = null;
            playEfimeroBtn.style.color = 'var(--phosphor-green)';
            playEfimeroBtn.style.backgroundColor = 'transparent';
            statusRam.innerText = `PAISAJE PURGADO.`;
        }
    });
});