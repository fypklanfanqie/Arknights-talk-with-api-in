/* ============================================================
   music.js — Custom music player with playlist
   ============================================================ */

const MusicPlayer = (() => {
    const audio = new Audio();
    let playlist = [];
    let currentIndex = 0;
    let isPlaying = false;

    // DOM refs
    let els = {};

    // Track name mapping for display
    const TRACK_DISPLAY = {
        'm_sys_title_combine': 'Rhodes Island (2nd Edition)',
        'm_sys_void_combine': '生命流',
        'm_sys_science_combine': '泛用型自动化解决方案0.3.2.9f2',
        'm_sys_shop_combine': '休憩',
    };

    function init() {
        // Build playlist
        playlist = [
            { file: 'music/m_sys_title_combine.mp3', name: 'm_sys_title_combine' },
            { file: 'music/m_sys_void_combine.mp3', name: 'm_sys_void_combine' },
            { file: 'music/m_sys_science_combine.mp3', name: 'm_sys_science_combine' },
            { file: 'music/m_sys_shop_combine.mp3', name: 'm_sys_shop_combine' },
        ];

        // Cache DOM refs
        els = {
            title: document.getElementById('music-title'),
            currentTime: document.getElementById('music-current-time'),
            duration: document.getElementById('music-duration'),
            progressTrack: document.getElementById('music-progress-track'),
            progressFill: document.getElementById('music-progress-fill'),
            btnPlay: document.getElementById('btn-play'),
            btnPrev: document.getElementById('btn-prev'),
            btnNext: document.getElementById('btn-next'),
            iconPlay: document.getElementById('icon-play'),
            iconPause: document.getElementById('icon-pause'),
            volumeSlider: document.getElementById('volume-slider'),
            playlist: document.getElementById('music-playlist'),
        };

        // Set initial volume
        audio.volume = Storage.getVolume() / 100;
        els.volumeSlider.value = Storage.getVolume();

        // Events
        audio.addEventListener('loadedmetadata', updateDuration);
        audio.addEventListener('timeupdate', updateProgress);
        audio.addEventListener('ended', onTrackEnd);
        audio.addEventListener('error', () => {
            console.warn('Audio error, skipping track');
            next();
        });

        els.btnPlay.addEventListener('click', togglePlay);
        els.btnPrev.addEventListener('click', prev);
        els.btnNext.addEventListener('click', next);
        els.volumeSlider.addEventListener('input', onVolumeChange);
        els.progressTrack.addEventListener('click', seek);

        // Build playlist UI
        renderPlaylist();

        // Load first track (don't autoplay)
        loadTrack(0);
    }

    function renderPlaylist() {
        els.playlist.innerHTML = playlist.map((track, i) => {
            const shortName = TRACK_DISPLAY[track.name] || track.name;
            return `<span class="playlist-item${i === 0 ? ' active' : ''}" data-index="${i}">${shortName}</span>`;
        }).join('');

        els.playlist.querySelectorAll('.playlist-item').forEach(item => {
            item.addEventListener('click', () => {
                const idx = parseInt(item.dataset.index);
                loadTrack(idx);
                play();
            });
        });
    }

    function updatePlaylistActive() {
        els.playlist.querySelectorAll('.playlist-item').forEach((item, i) => {
            item.classList.toggle('active', i === currentIndex);
        });
    }

    function loadTrack(index) {
        if (index < 0) index = playlist.length - 1;
        if (index >= playlist.length) index = 0;
        currentIndex = index;

        const track = playlist[currentIndex];
        audio.src = track.file;
        audio.load();

        const displayName = TRACK_DISPLAY[track.name] || track.name;
        els.title.textContent = displayName;
        updatePlaylistActive();
    }

    function togglePlay() {
        if (isPlaying) {
            pause();
        } else {
            play();
        }
    }

    function play() {
        audio.play().then(() => {
            isPlaying = true;
            updatePlayIcon();
        }).catch(e => {
            console.warn('Playback failed (may need user interaction):', e.message);
        });
    }

    function pause() {
        audio.pause();
        isPlaying = false;
        updatePlayIcon();
    }

    function prev() {
        loadTrack(currentIndex - 1);
        if (isPlaying) play();
    }

    function next() {
        loadTrack(currentIndex + 1);
        if (isPlaying) play();
    }

    function onTrackEnd() {
        next();
        if (!isPlaying) play();
    }

    function updatePlayIcon() {
        if (isPlaying) {
            els.iconPlay.classList.add('hidden');
            els.iconPause.classList.remove('hidden');
        } else {
            els.iconPlay.classList.remove('hidden');
            els.iconPause.classList.add('hidden');
        }
    }

    function updateDuration() {
        els.duration.textContent = formatTime(audio.duration);
    }

    function updateProgress() {
        if (isNaN(audio.duration)) return;
        const pct = (audio.currentTime / audio.duration) * 100;
        els.progressFill.style.width = pct + '%';
        els.currentTime.textContent = formatTime(audio.currentTime);
    }

    function seek(e) {
        if (isNaN(audio.duration)) return;
        const rect = els.progressTrack.getBoundingClientRect();
        const pct = (e.clientX - rect.left) / rect.width;
        audio.currentTime = pct * audio.duration;
    }

    function onVolumeChange() {
        const vol = parseInt(els.volumeSlider.value) / 100;
        audio.volume = vol;
        Storage.setVolume(els.volumeSlider.value);
    }

    function formatTime(seconds) {
        if (isNaN(seconds)) return '00:00';
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    }

    return { init, play, pause, togglePlay, prev, next };
})();
