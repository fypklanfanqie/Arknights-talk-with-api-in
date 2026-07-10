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
    let resizeObserver = null;

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
        // 小程序新增角色
        'magallan': 'picture/立绘_麦哲伦_skin1.png',
        'shu': 'picture/立绘_黍_skin1.png',
        'surtr': 'picture/立绘_史尔特尔_skin3.png',
        'xinoge': 'picture/立绘_晓歌_skin2.png',
        'lin': 'picture/立绘_林_skin1.png',
        'lappland': 'picture/立绘_拉普兰德_skin1.png',
        'executor': 'picture/立绘_送葬人_skin1.png',
        'mon3tr': 'picture/立绘_Mon3tr_skin1.png',
        'xingyuan': 'picture/立绘_星源_skin1.png',
        'texas': 'picture/立绘_德克萨斯_skin1.png',
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
        'magallan': 'Magallan',
        'shu': 'Shu',
        'surtr': 'Surtr',
        'xinoge': 'Cantabile',
        'lin': 'Lin',
        'lappland': 'Lappland',
        'executor': 'Executor',
        'mon3tr': 'Mon3tr',
        'xingyuan': 'Astgenne',
        'texas': 'Texas',
    };

    // --- Resolve the Live2DModel class from whichever namespace it landed in ---
    function getLive2DModelClass() {
        // pixi-live2d-display@0.4.0 registers on PIXI.live2d (primary)
        if (typeof PIXI !== 'undefined' && PIXI.live2d && PIXI.live2d.Live2DModel) {
            return PIXI.live2d.Live2DModel;
        }
        // Some builds / older versions may put it directly on PIXI
        if (typeof PIXI !== 'undefined' && PIXI.Live2DModel) {
            return PIXI.Live2DModel;
        }
        // Fallback: global window
        if (typeof window !== 'undefined' && window.Live2DModel) {
            return window.Live2DModel;
        }
        return null;
    }

    // --- DOM helpers (always query fresh to avoid stale refs) ---
    function getCanvas() { return document.getElementById('live2d-canvas'); }
    function getViewport() { return document.getElementById('live2d-viewport'); }
    function getFallbackEl() { return document.getElementById('live2d-fallback'); }
    function getFallbackImg() { return document.getElementById('live2d-fallback-img'); }
    function getModelNameEl() { return document.getElementById('live2d-model-name'); }

    // --- Cleanup helpers ---
    function destroyModel() {
        if (model) {
            try {
                if (app && app.stage) app.stage.removeChild(model);
                model.destroy();
            } catch (e) { /* ignore */ }
            model = null;
        }
        if (animationId) {
            cancelAnimationFrame(animationId);
            animationId = null;
        }
    }

    function destroyApp() {
        destroyModel();
        if (app) {
            try {
                if (app.renderer) app.renderer.destroy(true);
                app.destroy(true, { children: true, texture: true });
            } catch (e) { /* ignore */ }
            app = null;
        }
        if (resizeObserver) {
            resizeObserver.disconnect();
            resizeObserver = null;
        }
        isInitialized = false;
    }

    // --- Show static fallback image ---
    function showFallback(characterId) {
        destroyModel();

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
            console.warn('Live2D: viewport or canvas not found, using fallback');
            showFallback('amiya');
            return;
        }

        // Check PIXI availability
        if (typeof PIXI === 'undefined') {
            console.warn('Live2D: PIXI not loaded, using fallback');
            showFallback('amiya');
            return;
        }

        // Check CubismCore availability (should be global after script loads)
        if (typeof Live2DCubismCore === 'undefined' && typeof window !== 'undefined' && !window.Live2DCubismCore) {
            console.warn('Live2D: CubismCore not loaded, using fallback');
            showFallback('amiya');
            return;
        }

        // Check Live2DModel class
        const Live2DModelClass = getLive2DModelClass();
        if (!Live2DModelClass) {
            console.warn('Live2D: Live2DModel class not found, using fallback');
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

            // Mouse tracking (with cleanup reference stored via closure)
            const onMouseMove = function (e) {
                const r = viewportEl.getBoundingClientRect();
                targetMouseX = (e.clientX - r.left) / r.width;
                targetMouseY = (e.clientY - r.top) / r.height;
            };
            const onMouseLeave = function () {
                targetMouseX = 0.5;
                targetMouseY = 0.5;
            };
            viewportEl.addEventListener('mousemove', onMouseMove);
            viewportEl.addEventListener('mouseleave', onMouseLeave);

            // Resize observer (store ref for cleanup)
            resizeObserver = new ResizeObserver(function () {
                if (!app || !app.renderer) return;
                const r = viewportEl.getBoundingClientRect();
                if (r.width <= 0 || r.height <= 0) return;
                app.renderer.resize(r.width, r.height);
                if (model) {
                    model.x = r.width / 2;
                    model.y = r.height * 0.55;
                    model.scale.set(Math.min(r.width / 800, r.height / 900) * 0.95);
                }
            });
            resizeObserver.observe(viewportEl);

            isInitialized = true;
            console.log('Live2D: initialized successfully');

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
        destroyModel();

        // Show canvas, hide fallback
        const canvas = getCanvas();
        const fallbackEl = getFallbackEl();
        if (fallbackEl) fallbackEl.classList.add('hidden');
        if (canvas) canvas.style.display = 'block';

        const Live2DModelClass = getLive2DModelClass();
        if (!Live2DModelClass) {
            showFallback(characterId);
            return;
        }

        try {
            // URL-encode the model path to handle Chinese characters safely
            const encodedPath = modelPath.split('/').map(encodeURIComponent).join('/');
            console.log('Live2D: loading model from', encodedPath);

            model = await Live2DModelClass.from(encodedPath, {
                autoUpdate: true,
                crossOrigin: 'anonymous',
            });

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

            console.log('Live2D: model loaded successfully');
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
