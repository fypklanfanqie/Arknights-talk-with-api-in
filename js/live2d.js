/* ============================================================
   live2d.js — Live2D model manager using PIXI + pixi-live2d-display
   ============================================================ */

const Live2DManager = (() => {
    let app = null;
    let model = null;
    let canvas = null;
    let viewportEl = null;
    let fallbackEl = null;
    let isInitialized = false;
    let currentChar = 'amiya';
    let mouseX = 0.5;
    let mouseY = 0.5;
    let targetMouseX = 0.5;
    let targetMouseY = 0.5;
    let animationId = null;

    // Model paths
    const MODEL_PATHS = {
        'amiya': 'live2d/阿米娅(1).model3.json',
        'la-pluma': null, // No Live2D for La Pluma
    };

    const FALLBACK_IMAGES = {
        'amiya': 'picture/立绘_阿米娅(近卫)_skin2.webp',
        'eyjafjalla': 'picture/立绘_艾雅法拉_skin1.webp',
        'goldenglow': 'picture/立绘_澄闪_skin3.webp',
        'mudrock': 'picture/立绘_泥岩_skin1.webp',
        'la-pluma': 'picture/立绘_羽毛笔_2.webp',
        'logos': 'picture/立绘_逻各斯_skin1.webp',
        'honeyberry': 'picture/立绘_蜜莓_skin1.webp',
        'haruka': 'picture/立绘_遥_2.webp',
        'wisdel': 'picture/立绘_维什戴尔_2.webp',
        'zuole': 'picture/立绘_左乐_skin2.webp',
    };

    const MODEL_NAMES = {
        'amiya': 'AMiya',
        'eyjafjalla': 'Eyjafjalla',
        'goldenglow': 'Goldenglow',
        'mudrock': 'Mudrock',
        'la-pluma': 'La Pluma',
        'logos': 'Logos',
        'honeyberry': 'Honeyberry',
        'haruka': 'Haruka',
        'wisdel': "Wis'adel",
        'zuole': 'Zuo Le',
    };

    async function init() {
        canvas = document.getElementById('live2d-canvas');
        viewportEl = document.getElementById('live2d-viewport');
        fallbackEl = document.getElementById('live2d-fallback');

        // Check if PIXI and Live2D are available
        if (typeof PIXI === 'undefined') {
            console.warn('PIXI.js not loaded, Live2D disabled');
            showFallback('amiya');
            return;
        }

        if (!PIXI.Live2DModel) {
            console.warn('pixi-live2d-display not loaded, Live2D disabled');
            showFallback('amiya');
            return;
        }

        try {
            await setupPIXI();
            bindMouseTracking();
            isInitialized = true;
            await loadModel('amiya');
        } catch (e) {
            console.error('Live2D init failed:', e);
            showFallback('amiya');
        }
    }

    async function setupPIXI() {
        const rect = viewportEl.getBoundingClientRect();
        const width = rect.width || 400;
        const height = rect.height || 500;

        app = new PIXI.Application({
            view: canvas,
            width: width,
            height: height,
            backgroundAlpha: 0,
            antialias: true,
            resolution: window.devicePixelRatio || 1,
            autoDensity: true,
        });

        // Handle resize
        const observer = new ResizeObserver(() => {
            if (!app) return;
            const r = viewportEl.getBoundingClientRect();
            app.renderer.resize(r.width, r.height);
            if (model) {
                model.x = r.width / 2;
                model.y = r.height * 0.55;
                const scale = Math.min(r.width / 800, r.height / 900) * 0.95;
                model.scale.set(scale);
            }
        });
        observer.observe(viewportEl);
    }

    async function loadModel(characterId) {
        if (!isInitialized) {
            showFallback(characterId);
            return;
        }

        currentChar = characterId;

        // Check if this character has a Live2D model
        const modelPath = MODEL_PATHS[characterId];
        if (!modelPath) {
            showFallback(characterId);
            return;
        }

        // Remove old model
        if (model) {
            app.stage.removeChild(model);
            model.destroy();
            model = null;
        }

        // Hide fallback
        fallbackEl.classList.add('hidden');
        canvas.style.display = 'block';

        try {
            // Load model
            model = await PIXI.Live2DModel.from(modelPath);

            if (!model) throw new Error('Model loaded but is null');

            const rect = viewportEl.getBoundingClientRect();
            model.x = rect.width / 2;
            model.y = rect.height * 0.55;
            const scale = Math.min(rect.width / 800, rect.height / 900) * 0.95;
            model.scale.set(scale);

            // Enable mouse tracking via internal model parameters
            model.on('hit', () => {});

            app.stage.addChild(model);

            // Update model name display
            const modelNameEl = document.getElementById('live2d-model-name');
            if (modelNameEl) {
                modelNameEl.textContent = MODEL_NAMES[characterId] || characterId.toUpperCase();
            }

            // Start animation loop for smooth mouse tracking
            startAnimationLoop();

        } catch (e) {
            console.error('Failed to load Live2D model:', e);
            showFallback(characterId);
        }
    }

    function showFallback(characterId) {
        if (model) {
            app.stage.removeChild(model);
            model.destroy();
            model = null;
        }
        if (canvas) canvas.style.display = 'none';
        if (fallbackEl) {
            fallbackEl.classList.remove('hidden');
            const img = document.getElementById('live2d-fallback-img');
            if (img) img.src = FALLBACK_IMAGES[characterId] || FALLBACK_IMAGES['amiya'];
        }
        const modelNameEl = document.getElementById('live2d-model-name');
        if (modelNameEl) {
            modelNameEl.textContent = MODEL_NAMES[characterId] || characterId.toUpperCase();
        }
    }

    function bindMouseTracking() {
        viewportEl.addEventListener('mousemove', (e) => {
            const rect = viewportEl.getBoundingClientRect();
            targetMouseX = (e.clientX - rect.left) / rect.width;
            targetMouseY = (e.clientY - rect.top) / rect.height;
        });

        viewportEl.addEventListener('mouseleave', () => {
            targetMouseX = 0.5;
            targetMouseY = 0.5;
        });
    }

    function startAnimationLoop() {
        if (animationId) return;

        function animate() {
            // Smooth follow
            mouseX += (targetMouseX - mouseX) * 0.08;
            mouseY += (targetMouseY - mouseY) * 0.08;

            if (model && model.internalModel && model.internalModel.coreModel) {
                try {
                    // Map mouse position to head angle parameters
                    // ParamAngleX: vertical head rotation (-30 to 30)
                    // ParamAngleY: horizontal head rotation (-30 to 30)
                    // ParamAngleZ: head tilt (-30 to 30)
                    const angleX = (mouseY - 0.5) * 30;
                    const angleY = (mouseX - 0.5) * 30;
                    const angleZ = (mouseX - 0.5) * -10;

                    const core = model.internalModel.coreModel;
                    core.setParamFloat('ParamAngleX', angleX);
                    core.setParamFloat('ParamAngleY', angleY);
                    core.setParamFloat('ParamAngleZ', angleZ);

                    // Breath parameter (idle breathing)
                    const breath = Math.sin(Date.now() / 2000) * 0.5 + 0.5;
                    core.setParamFloat('ParamBreath', breath);
                } catch (e) {
                    // Parameter might not exist on all models
                }
            }

            animationId = requestAnimationFrame(animate);
        }
        animate();
    }

    function switchCharacter(characterId) {
        loadModel(characterId);
    }

    function resize() {
        if (!app || !viewportEl) return;
        const rect = viewportEl.getBoundingClientRect();
        app.renderer.resize(rect.width, rect.height);
        if (model) {
            model.x = rect.width / 2;
            model.y = rect.height * 0.55;
            const scale = Math.min(rect.width / 800, rect.height / 900) * 0.95;
            model.scale.set(scale);
        }
    }

    window.addEventListener('resize', resize);

    return { init, switchCharacter, resize };
})();
