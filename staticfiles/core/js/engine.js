document.addEventListener('DOMContentLoaded', () => {
    let audioCtx = null;

    // Patrón de inicialización estricto
    const initAudio = () => {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
        }
        if (audioCtx.state === 'suspended') audioCtx.resume();
    };

    document.body.addEventListener('pointerdown', initAudio, { once: true });

    /* =====================================================================
       1. DRON CENTRAL (Puntero unificado + RequestAnimationFrame)
       ===================================================================== */
    const canvas = document.getElementById('dron-canvas');
    const ctx = canvas.getContext('2d');
    const statusDron = document.getElementById('dron-status');

    let isDrawing = false;
    let targetX = 0, targetY = 0;
    let dronOscillators = [];
    let masterGain = null;

    const resize = () => {
        canvas.width = canvas.parentElement.clientWidth;
        canvas.height = canvas.parentElement.clientHeight;
    };
    window.addEventListener('resize', resize);
    resize();

    // Loop visual desacoplado del audio para mantener 60fps
    const drawLoop = () => {
        if (isDrawing) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.2)'; // Efecto estela de alta velocidad
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            ctx.beginPath();
            ctx.arc(targetX, targetY, 40, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(57, 255, 20, 0.8)';
            ctx.fill();
        } else {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        requestAnimationFrame(drawLoop);
    };
    requestAnimationFrame(drawLoop);

    const startDron = (x, y) => {
        initAudio();
        if (isDrawing) return;
        isDrawing = true;
        targetX = x; targetY = y;

        masterGain = audioCtx.createGain();
        masterGain.gain.setValueAtTime(0, audioCtx.currentTime);
        // Ataque largo y fluido (4s)
        masterGain.gain.linearRampToValueAtTime(0.7, audioCtx.currentTime + 4);
        masterGain.connect(audioCtx.destination);

        const freqs = [55, 110, 165, 220]; // Textura espectral
        
        dronOscillators = freqs.map((f, i) => {
            const osc = audioCtx.createOscillator();
            const filter = audioCtx.createBiquadFilter();
            
            osc.type = i % 2 === 0 ? 'sine' : 'sawtooth';
            osc.frequency.setValueAtTime(f, audioCtx.currentTime);
            
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(400, audioCtx.currentTime);

            osc.connect(filter);
            filter.connect(masterGain);
            osc.start();
            return { osc, filter, baseFreq: f };
        });
        updateDronAudio(x, y);
    };

    const updateDronAudio = (x, y) => {
        targetX = x; targetY = y;
        const normX = x / canvas.width;
        const normY = 1 - (y / canvas.height);

        statusDron.innerText = `X: ${normX.toFixed(2)} | Y: ${normY.toFixed(2)}`;

        // Modulación fluida sin colapsar el hilo de audio
        const time = audioCtx.currentTime;
        dronOscillators.forEach((node, i) => {
            node.osc.frequency.setTargetAtTime(node.baseFreq + (normX * 10 * i), time, 0.1);
            node.filter.frequency.setTargetAtTime(200 + (normY * 2000), time, 0.1);
        });
    };

    const stopDron = () => {
        if (!isDrawing) return;
        isDrawing = false;
        statusDron.innerText = `MODO ESPERA // FADE OUT ACTIVO`;

        if (masterGain) {
            masterGain.gain.cancelScheduledValues(audioCtx.currentTime);
            masterGain.gain.setValueAtTime(masterGain.gain.value, audioCtx.currentTime);
            // Relajación muy larga y fluida (6s)
            masterGain.gain.linearRampToValueAtTime(0.0001, audioCtx.currentTime + 6);

            const nodesToKill = dronOscillators;
            const gainToKill = masterGain;

            // Purga estricta tras la envolvente
            setTimeout(() => {
                nodesToKill.forEach(n => { n.osc.stop(); n.osc.disconnect(); n.filter.disconnect(); });
                gainToKill.disconnect();
            }, 6100);
        }
        dronOscillators = [];
        masterGain = null;
    };

    // POINTER EVENTS: Velocidad pura, reemplaza mouse y touch.
    canvas.addEventListener('pointerdown', (e) => {
        canvas.setPointerCapture(e.pointerId);
        startDron(e.offsetX, e.offsetY);
    });
    canvas.addEventListener('pointermove', (e) => {
        if (isDrawing) updateDronAudio(e.offsetX, e.offsetY);
    });
    canvas.addEventListener('pointerup', stopDron);
    canvas.addEventListener('pointercancel', stopDron);


    /* =====================================================================
       2. ENSAMBLE CUANTIZADO (Gestión de Memoria Autónoma)
       ===================================================================== */
    const padGrid = document.getElementById('pad-grid');
    const pentatonica = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25];

    pentatonica.forEach((freq, idx) => {
        const btn = document.createElement('button');
        btn.classList.add('pad');
        btn.innerText = `PAD_0${idx + 1}`;
        // Prevenir context menu en móviles al mantener pulsado
        btn.oncontextmenu = (e) => e.preventDefault(); 

        const playNota = (e) => {
            e.preventDefault(); // Evitar doble disparo
            initAudio();
            
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();

            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

            gain.gain.setValueAtTime(0, audioCtx.currentTime);
            gain.gain.linearRampToValueAtTime(0.5, audioCtx.currentTime + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1.2);

            osc.connect(gain);
            gain.connect(audioCtx.destination);

            // Destrucción nativa y automática del nodo. (Purga perfecta).
            osc.onended = () => {
                gain.disconnect();
                osc.disconnect();
            };

            osc.start(audioCtx.currentTime);
            osc.stop(audioCtx.currentTime + 1.2);

            btn.classList.add('active-pad');
            setTimeout(() => btn.classList.remove('active-pad'), 100);
        };

        // PointerEvents para los pads
        btn.addEventListener('pointerdown', playNota);
        padGrid.appendChild(btn);
    });


    /* =====================================================================
       3. PAISAJES EFÍMEROS (Inyección Directa en RAM)
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
        fileInput.value = ''; // Limpiar input
    });

    playEfimeroBtn.addEventListener('pointerdown', () => {
        if (!bufferRam) return;
        
        // Si hay uno sonando, detenerlo antes de relanzar
        if (sourceNode) {
            try { sourceNode.stop(); sourceNode.disconnect(); } catch(e){}
        }

        sourceNode = audioCtx.createBufferSource();
        sourceNode.buffer = bufferRam;
        sourceNode.loop = true;

        gainEfimero = audioCtx.createGain();
        gainEfimero.gain.value = 0.6;

        sourceNode.connect(gainEfimero);
        gainEfimero.connect(audioCtx.destination);
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