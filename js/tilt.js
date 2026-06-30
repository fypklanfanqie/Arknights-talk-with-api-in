/* ============================================================
   tilt.js — Mouse-tracking 3D parallax tilt for illustrations
   ============================================================ */

const TiltEffect = (() => {
    let cards = [];
    let enabled = true;

    const MAX_TILT = 18; // degrees
    const PERSPECTIVE = 1000; // px

    function init() {
        cards = document.querySelectorAll('.character-illustration');
        bindEvents();
    }

    function bindEvents() {
        cards.forEach(card => {
            card.addEventListener('mousemove', onMouseMove);
            card.addEventListener('mouseleave', onMouseLeave);
        });
    }

    function onMouseMove(e) {
        if (!enabled) return;

        const card = e.currentTarget;
        const rect = card.getBoundingClientRect();

        // Mouse position relative to card center (normalized -1 to 1)
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        const offsetX = (e.clientX - centerX) / (rect.width / 2);
        const offsetY = (e.clientY - centerY) / (rect.height / 2);

        // Calculate rotation: vertical mouse movement → rotateX, horizontal → rotateY
        // Inverted: moving mouse up tilts the card up (negative rotateX), moving right tilts right
        const rotateY = offsetX * MAX_TILT;
        const rotateX = -offsetY * MAX_TILT;

        // Apply transform
        card.style.transform = `perspective(${PERSPECTIVE}px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;

        // Adjust the images slightly for a parallax feel
        const imgs = card.querySelectorAll('.character-img');
        imgs.forEach(img => {
            const moveX = offsetX * 4;
            const moveY = offsetY * 4;
            img.style.transform = `translate(${moveX}px, ${moveY}px) scale(1.08)`;
        });
    }

    function onMouseLeave(e) {
        const card = e.currentTarget;
        card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';

        const imgs = card.querySelectorAll('.character-img');
        imgs.forEach(img => {
            img.style.transform = 'translate(0px, 0px) scale(1)';
        });
    }

    /** Refresh bindings after DOM changes */
    function refresh() {
        cards = document.querySelectorAll('.character-illustration');
        // Remove old listeners by cloning (simplest way)
        cards.forEach(card => {
            const clone = card.cloneNode(true);
            card.parentNode.replaceChild(clone, card);
        });
        cards = document.querySelectorAll('.character-illustration');
        bindEvents();
    }

    function setEnabled(val) {
        enabled = val;
    }

    return { init, refresh, setEnabled };
})();
