document.addEventListener('DOMContentLoaded', () => {
    let audioCtx = null;
    let masterCompressor = null; // Protector de audio para múltiples toques

    const initAudio = () => {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
            
            // Limitador Maestro: Evita que el sonido sature al usar muchos dedos
            masterCompressor = audioCtx.createDynamicsCompressor();
            masterCompressor.threshold.setValueAtTime(-15, audioCtx.currentTime);
            masterCompressor.knee.setValueAtTime(10, audioCtx.currentTime);
            masterCompressor.ratio.setValueAtTime(12, audioCtx.currentTime);
            masterCompressor.attack.setValueAtTime(0, audioCtx.currentTime);
            masterCompressor.release.setValueAtTime(0.25, audioCtx.currentTime);
            masterCompressor.connect(audioCtx.destination);
        }
        if (audioCtx.state === 'suspended') audioCtx.resume();
    };

    document.body.addEventListener('pointerdown', initAudio, { once: true });

    /* =====================================================================
       1. DRON CENTRAL (Polifonía Multitáctil de Alto Rendimiento)
       ===================================================================== */
    const canvas = document.getElementById('dron-canvas');
    const ctx = canvas.getContext('2d');
    const statusDron = document.getElementById('dron-status');

    // Diccionario para almacenar múltiples dedos de forma independiente
    const activeTouches = new Map();

    const resize = () => {
        canvas.width = canvas.parentElement.clientWidth;
        canvas.height = canvas.parentElement.clientHeight;
    };
    window.addEventListener('resize', resize);
    resize();

    const drawLoop = () => {
        // Estela visual
        ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Dibujar cada dedo activo en la pantalla
        activeTouches.forEach(touch => {
            ctx.beginPath();
            ctx.arc(touch.x, touch.y, 40, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(57, 255, 20, 0.8)';
            ctx.fill();
        });
        
        requestAnimationFrame(drawLoop);
    };
    requestAnimationFrame(drawLoop);

    // Iniciar síntesis para un solo dedo
    const startDron = (pointerId, x, y) => {
        initAudio();
        
        const gainNode = audioCtx.createGain();
        gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
        // Volumen más bajo por dedo para compensar la polifonía
        gainNode.gain.linearRampToValueAtTime(0.3, audioCtx.currentTime + 4);
        gainNode.connect(masterCompressor);

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

        // Registrar este toque específico
        activeTouches.set(pointerId, { x, y, oscillators, gainNode });
        updateDronAudio(pointerId, x, y);
    };

    // Actualizar audio para un dedo en movimiento
    const updateDronAudio = (pointerId, x, y) => {
        const touch = activeTouches.get(pointerId);
        if (!touch) return;
        
        touch.x = x; 
        touch.y = y;

        const normX = x / canvas.width;
        const normY = 1 - (y / canvas.height);

        statusDron.innerText = `TOQUES ACTIVOS: ${activeTouches.size} // POLIFONÍA`;

        const time = audioCtx.currentTime;
        touch.oscillators.forEach((node, i) => {
            node.osc.frequency.setTargetAtTime(node.baseFreq + (normX * 10 * i), time, 0.1);
            node.filter.frequency.setTargetAtTime(200 + (normY * 2000), time, 0.1);
        });
    };

    // Detener y purgar un dedo específico
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
        
        // Eliminar el dedo del registro inmediatamente
        activeTouches.delete(pointerId);
        
        if (activeTouches.size === 0) {
            statusDron.innerText = `MODO ESPERA // FADE OUT ACTIVO`;
        } else {
            statusDron.innerText = `TOQUES ACTIVOS: ${activeTouches.size} // POLIFONÍA`;
        }
    };

    // PointerEvents: La clave del Multitouch
    canvas.addEventListener('pointerdown', (e) => {
        canvas.setPointerCapture(e.pointerId);
        startDron(e.pointerId, e.offsetX, e.offsetY);
    });
    
    canvas.addEventListener('pointermove', (e) => {
        if (activeTouches.has(e.pointerId)) {
            updateDronAudio(e.pointerId, e.offsetX, e.offsetY);
        }
    });
    
    canvas.addEventListener('pointerup', (e) => stopDron(e.pointerId));
    canvas.addEventListener('pointercancel', (e) => stopDron(e.pointerId));


    /* =====================================================================
       2. ENSAMBLE CUANTIZADO
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
            gain.connect(masterCompressor); // Conectar al limitador

            osc.onended = () => {
                gain.disconnect();
                osc.disconnect();
            };

            osc.start(audioCtx.currentTime);
            osc.stop(audioCtx.currentTime + 1.2);

            btn.classList.add('active-pad');
            setTimeout(() => btn.classList.remove('active-pad'), 100);
        };

        btn.addEventListener('pointerdown', playNota);
        padGrid.appendChild(btn);
    });


    /* =====================================================================
       3. PAISAJES EFÍMEROS
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
            containerBtns.style.display = 'grid';
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
        gainEfimero.connect(masterCompressor); // Conectar al limitador
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
            statusRam.innerText = `PAISAJE PURGADO. RAM LIBERADA.`;
        }
    });
});