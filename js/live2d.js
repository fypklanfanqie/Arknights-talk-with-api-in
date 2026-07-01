/* ============================================================
   live2d.js — Live2D model manager using PIXI + pixi-live2d-display
   ============================================================ */

const Live2DManager = (() => {
    let app = null;
    let model = null;
    let isInitialized = false;
    let currentChar = 'amiya';
    let mouseX = 0.5;
    let mouseY = 0.5;
    let targetMouseX = 0.5;
    let targetMouseY = 0.5;
    let animationId = null;

    // Model paths — only Amiya has a Live2D model
    const MODEL_PATHS = {
        'amiya': 'live2d/阿米娅(1).model3.json',
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

    // --- DOM helpers (always query fresh to avoid stale refs) ---
    function getCanvas() { return document.getElementById('live2d-canvas'); }
    function getViewport() { return document.getElementById('live2d-viewport'); }
    function getFallbackEl() { return document.getElementById('live2d-fallback'); }
    function getFallbackImg() { return document.getElementById('live2d-fallback-img'); }
    function getModelNameEl() { return document.getElementById('live2d-model-name'); }

    // --- Show static fallback image ---
    function showFallback(characterId) {
        // Safely destroy any existing model
        if (model) {
            try {
                if (app && app.stage) app.stage.removeChild(model);
                model.destroy();
            } catch (e) { /* ignore */ }
            model = null;
        }

        // Hide canvas
        const canvas = getCanvas();
        if (canvas) canvas.style.display = 'none';

        // Show fallback image
        const fallbackEl = getFallbackEl();
        const fallbackImg = getFallbackImg();
        if (fallbackEl) fallbackEl.classList.remove('hidden');
        if (fallbackImg) {
            const src = FALLBACK_IMAGES[characterId] || FALLBACK_IMAGES['amiya'];
            fallbackImg.src = src;
        }

        // Update model name
        const nameEl = getModelNameEl();
        if (nameEl) nameEl.textContent = MODEL_NAMES[characterId] || characterId.toUpperCase();
    }

    // --- Main init ---
    async function init() {
        const canvas = getCanvas();
        const viewportEl = getViewport();

        // If containers don't exist, show fallback and exit
        if (!canvas || !viewportEl) {
            showFallback('amiya');
            return;
        }

        // If PIXI or Live2D plugin not loaded, show fallback
        if (typeof PIXI === 'undefined' || !PIXI.Live2DModel) {
            showFallback('amiya');
            return;
        }

        // Try to set up PIXI and load Amiya model
        try {
            const rect = viewportEl.getBoundingClientRect();
            const w = Math.max(rect.width, 100);
            const h = Math.max(rect.height, 100);

            app = new PIXI.Application({
                view: canvas,
                width: w,
                height: h,
                backgroundAlpha: 0,
                antialias: true,
                resolution: window.devicePixelRatio || 1,
                autoDensity: true,
            });

            if (!app || !app.renderer) {
                throw new Error('WebGL not available');
            }

            // Mouse tracking
            viewportEl.addEventListener('mousemove', function (e) {
                const r = viewportEl.getBoundingClientRect();
                targetMouseX = (e.clientX - r.left) / r.width;
                targetMouseY = (e.clientY - r.top) / r.height;
            });
            viewportEl.addEventListener('mouseleave', function () {
                targetMouseX = 0.5;
                targetMouseY = 0.5;
            });

            // Resize observer
            new ResizeObserver(function () {
                if (!app || !app.renderer) return;
                const r = viewportEl.getBoundingClientRect();
                if (r.width <= 0 || r.height <= 0) return;
                app.renderer.resize(r.width, r.height);
                if (model) {
                    model.x = r.width / 2;
                    model.y = r.height * 0.55;
                    model.scale.set(Math.min(r.width / 800, r.height / 900) * 0.95);
                }
            }).observe(viewportEl);

            isInitialized = true;

            // Load Amiya model
            await loadModel('amiya');

        } catch (e) {
            console.warn('Live2D init failed, using fallback:', e.message || e);
            showFallback('amiya');
        }
    }

    async function loadModel(characterId) {
        if (!isInitialized) {
            showFallback(characterId);
            return;
        }

        currentChar = characterId;

        // If this character has no Live2D model, show fallback
        const modelPath = MODEL_PATHS[characterId];
        if (!modelPath) {
            showFallback(characterId);
            return;
        }

        // Remove old model
        if (model) {
            try {
                if (app && app.stage) app.stage.removeChild(model);
                model.destroy();
            } catch (e) { /* ignore */ }
            model = null;
        }

        // Show canvas, hide fallback
        const canvas = getCanvas();
        const fallbackEl = getFallbackEl();
        if (fallbackEl) fallbackEl.classList.add('hidden');
        if (canvas) canvas.style.display = 'block';

        try {
            model = await PIXI.Live2DModel.from(modelPath);
            if (!model) throw new Error('Model is null');

            const viewportEl = getViewport();
            const rect = viewportEl ? viewportEl.getBoundingClientRect() : { width: 400, height: 500 };
            model.x = rect.width / 2;
            model.y = rect.height * 0.55;
            model.scale.set(Math.min(rect.width / 800, rect.height / 900) * 0.95);
            model.on('hit', function () {});

            app.stage.addChild(model);

            const nameEl = getModelNameEl();
            if (nameEl) nameEl.textContent = MODEL_NAMES[characterId] || characterId.toUpperCase();

            startAnimationLoop();

        } catch (e) {
            console.warn('Failed to load Live2D model:', e.message || e);
            showFallback(characterId);
        }
    }

    function startAnimationLoop() {
        if (animationId) cancelAnimationFrame(animationId);
        function animate() {
            mouseX += (targetMouseX - mouseX) * 0.08;
            mouseY += (targetMouseY - mouseY) * 0.08;

            if (model && model.internalModel && model.internalModel.coreModel) {
                try {
                    const core = model.internalModel.coreModel;
                    core.setParamFloat('ParamAngleX', (mouseY - 0.5) * 30);
                    core.setParamFloat('ParamAngleY', (mouseX - 0.5) * 30);
                    core.setParamFloat('ParamAngleZ', (mouseX - 0.5) * -10);
                    core.setParamFloat('ParamBreath', Math.sin(Date.now() / 2000) * 0.5 + 0.5);
                } catch (e) { /* ignore */ }
            }
            animationId = requestAnimationFrame(animate);
        }
        animate();
    }

    function switchCharacter(characterId) {
        if (!characterId) return;
        loadModel(characterId);
    }

    return { init, switchCharacter };
})();
