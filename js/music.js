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

        // Set audio preload to ensure file is buffered
        audio.preload = 'auto';

        // Set initial volume
        audio.volume = Storage.getVolume() / 100;
        if (els.volumeSlider) els.volumeSlider.value = Storage.getVolume();

        // Events
        audio.addEventListener('loadedmetadata', updateDuration);
        audio.addEventListener('timeupdate', updateProgress);
        audio.addEventListener('ended', onTrackEnd);
        audio.addEventListener('canplay', () => {
            console.log('Music: track ready to play');
        });
        audio.addEventListener('error', (e) => {
            const errorCodes = {
                1: 'MEDIA_ERR_ABORTED',
                2: 'MEDIA_ERR_NETWORK',
                3: 'MEDIA_ERR_DECODE',
                4: 'MEDIA_ERR_SRC_NOT_SUPPORTED',
            };
            const code = audio.error ? (errorCodes[audio.error.code] || audio.error.code) : 'unknown';
            console.warn('Music: audio error —', code, '— skipping track');
            // Skip to next track on error
            const wasPlaying = isPlaying;
            next();
            if (wasPlaying && currentIndex !== 0) play();
        });

        if (els.btnPlay) els.btnPlay.addEventListener('click', togglePlay);
        if (els.btnPrev) els.btnPrev.addEventListener('click', prev);
        if (els.btnNext) els.btnNext.addEventListener('click', next);
        if (els.volumeSlider) els.volumeSlider.addEventListener('input', onVolumeChange);
        if (els.progressTrack) els.progressTrack.addEventListener('click', seek);

        // Build playlist UI
        renderPlaylist();

        // Set waveform bar heights and delays dynamically (replaces 20 nth-child CSS rules)
        initWaveform();

        // Load first track (don't autoplay — browser policy)
        loadTrack(0);
    }

    function initWaveform() {
        const waveform = document.querySelector('.music-waveform');
        if (!waveform) return;
        const bars = waveform.querySelectorAll('span');
        const heights = [35, 60, 45, 80, 30, 55, 40, 70, 25, 50, 65, 35, 75, 45, 60, 30, 55, 40, 70, 50];
        bars.forEach((bar, i) => {
            bar.style.height = heights[i % heights.length] + '%';
            bar.style.animationDelay = (i * 0.05 % 0.3).toFixed(2) + 's';
        });
    }

    function renderPlaylist() {
        if (!els.playlist) return;
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
        if (!els.playlist) return;
        els.playlist.querySelectorAll('.playlist-item').forEach((item, i) => {
            item.classList.toggle('active', i === currentIndex);
        });
    }

    function loadTrack(index) {
        if (index < 0) index = playlist.length - 1;
        if (index >= playlist.length) index = 0;
        currentIndex = index;

        const track = playlist[currentIndex];
        if (!track) return;

        // Pause before changing source to avoid transition glitches
        audio.pause();
        isPlaying = false;
        updatePlayIcon();

        audio.src = track.file;
        audio.load();

        const displayName = TRACK_DISPLAY[track.name] || track.name;
        if (els.title) els.title.textContent = displayName;
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
        // If no source set yet, load the current track
        if (!audio.src || audio.src === window.location.href) {
            loadTrack(currentIndex);
        }

        const playPromise = audio.play();
        if (playPromise !== undefined) {
            playPromise.then(() => {
                isPlaying = true;
                updatePlayIcon();
            }).catch(e => {
                console.warn('Music: playback failed —', e.message);
                // Browser may require user gesture — button click should satisfy this
                isPlaying = false;
                updatePlayIcon();
            });
        }
    }

    function pause() {
        audio.pause();
        isPlaying = false;
        updatePlayIcon();
    }

    function prev() {
        loadTrack(currentIndex - 1);
        play();
    }

    function next() {
        loadTrack(currentIndex + 1);
        play();
    }

    function onTrackEnd() {
        next();
    }

    function updatePlayIcon() {
        if (!els.iconPlay || !els.iconPause) return;
        if (isPlaying) {
            els.iconPlay.classList.add('hidden');
            els.iconPause.classList.remove('hidden');
        } else {
            els.iconPlay.classList.remove('hidden');
            els.iconPause.classList.add('hidden');
        }
    }

    function updateDuration() {
        if (els.duration) els.duration.textContent = formatTime(audio.duration);
    }

    function updateProgress() {
        if (isNaN(audio.duration)) return;
        const pct = (audio.currentTime / audio.duration) * 100;
        if (els.progressFill) els.progressFill.style.width = pct + '%';
        if (els.currentTime) els.currentTime.textContent = formatTime(audio.currentTime);
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
