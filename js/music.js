/* ============================================================
   music.js — Music player streaming via NetEase Cloud Music
   All tracks use NetEase external player URLs.
   ============================================================ */

const MusicPlayer = (() => {
    const audio = new Audio();

    // State
    let currentTrackId = null;       // id in MUSIC_LIBRARY
    let isPlaying = false;
    let activeEp = null;             // null = "All"
    let searchQuery = '';
    let favorites = new Set();       // Set of track ids
    let showFavoritesOnly = false;
    let consecutiveErrors = 0;
    const MAX_CONSECUTIVE_ERRORS = 3;

    // DOM refs cache
    let els = {};

    /* ================================================================
       INIT
       ================================================================ */
    function init() {
        cacheDom();
        loadFavorites();

        audio.preload = 'auto';
        audio.volume = Storage.getVolume() / 100;
        if (els.volumeSlider) els.volumeSlider.value = Storage.getVolume();

        // Audio events
        audio.addEventListener('loadedmetadata', updateDuration);
        audio.addEventListener('timeupdate', updateProgress);
        audio.addEventListener('ended', onTrackEnd);
        audio.addEventListener('error', (e) => {
            consecutiveErrors++;
            if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                console.warn('Music: too many consecutive errors — stopping');
                pause();
                consecutiveErrors = 0;
                showToast('Streaming failed. Check network connection.');
                return;
            }
            console.warn('Music: stream error — trying next track');
            // Auto-advance to next on error
            skipToNextAvailable();
        });
        audio.addEventListener('canplay', () => {
            consecutiveErrors = 0;
        });
        audio.addEventListener('loadstart', () => {
            // Show loading state
            if (els.title && currentTrackId) {
                const track = MUSIC_LIBRARY.byId[currentTrackId];
                if (track) els.title.textContent = track.title + ' …';
            }
        });

        // Button bindings
        if (els.btnPlay)  els.btnPlay.addEventListener('click', togglePlay);
        if (els.btnPrev)  els.btnPrev.addEventListener('click', prev);
        if (els.btnNext)  els.btnNext.addEventListener('click', next);
        if (els.btnFav)   els.btnFav.addEventListener('click', toggleFavorite);
        if (els.volumeSlider) els.volumeSlider.addEventListener('input', onVolumeChange);
        if (els.progressTrack) els.progressTrack.addEventListener('click', seek);
        if (els.searchInput) {
            els.searchInput.addEventListener('input', () => {
                searchQuery = els.searchInput.value;
                renderLibrary();
            });
        }
        if (els.btnFavFilter) {
            els.btnFavFilter.addEventListener('click', () => {
                showFavoritesOnly = !showFavoritesOnly;
                els.btnFavFilter.classList.toggle('active', showFavoritesOnly);
                renderLibrary();
            });
        }

        initWaveform();
        renderEpTabs();
        renderLibrary();

        // Load first available track
        const firstAvailable = MUSIC_LIBRARY.tracks.find(t => t.neteaseId || t.url);
        if (firstAvailable) {
            loadTrack(firstAvailable);
        }
    }

    function cacheDom() {
        els = {
            title:    document.getElementById('music-title'),
            artist:   document.getElementById('music-artist'),
            currentTime:  document.getElementById('music-current-time'),
            duration:     document.getElementById('music-duration'),
            progressTrack: document.getElementById('music-progress-track'),
            progressFill:  document.getElementById('music-progress-fill'),
            btnPlay:   document.getElementById('btn-play'),
            btnPrev:   document.getElementById('btn-prev'),
            btnNext:   document.getElementById('btn-next'),
            btnFav:    document.getElementById('btn-fav'),
            iconPlay:  document.getElementById('icon-play'),
            iconPause: document.getElementById('icon-pause'),
            iconFav:   document.getElementById('icon-fav'),
            iconFavSolid: document.getElementById('icon-fav-solid'),
            volumeSlider: document.getElementById('volume-slider'),
            epTabs:    document.getElementById('music-ep-tabs'),
            library:   document.getElementById('music-library'),
            searchInput: document.getElementById('music-search'),
            btnFavFilter: document.getElementById('btn-fav-filter'),
            trackCount: document.getElementById('music-track-count'),
        };
    }

    /* ================================================================
       FAVORITES (localStorage)
       ================================================================ */
    function loadFavorites() {
        try {
            const raw = localStorage.getItem('arknights_chat_music_favs');
            if (raw) {
                favorites = new Set(JSON.parse(raw));
            }
        } catch { favorites = new Set(); }
    }

    function saveFavorites() {
        try {
            localStorage.setItem('arknights_chat_music_favs', JSON.stringify([...favorites]));
        } catch {}
    }

    function toggleFavorite() {
        if (!currentTrackId) return;
        if (favorites.has(currentTrackId)) {
            favorites.delete(currentTrackId);
        } else {
            favorites.add(currentTrackId);
        }
        saveFavorites();
        updateFavIcon();
        renderLibrary();
    }

    function updateFavIcon() {
        if (!els.iconFav || !els.iconFavSolid) return;
        const isFav = currentTrackId && favorites.has(currentTrackId);
        if (isFav) {
            els.iconFav.classList.add('hidden');
            els.iconFavSolid.classList.remove('hidden');
        } else {
            els.iconFav.classList.remove('hidden');
            els.iconFavSolid.classList.add('hidden');
        }
    }

    /* ================================================================
       EP TABS
       ================================================================ */
    function renderEpTabs() {
        if (!els.epTabs) return;
        const tabs = [
            { ep: null, label: 'ALL' },
            ...MUSIC_LIBRARY.EP_ORDER.map(ep => ({ ep, label: MUSIC_LIBRARY.EP_LABELS[ep] || ep })),
        ];
        els.epTabs.innerHTML = tabs.map(t =>
            `<span class="ep-tab${activeEp === t.ep ? ' active' : ''}" data-ep="${t.ep || ''}">${escapeHtml(t.label)}</span>`
        ).join('');

        els.epTabs.querySelectorAll('.ep-tab').forEach(el => {
            el.addEventListener('click', () => {
                activeEp = el.dataset.ep || null;
                renderEpTabs();
                renderLibrary();
            });
        });
    }

    /* ================================================================
       LIBRARY RENDERING
       ================================================================ */
    function renderLibrary() {
        if (!els.library) return;

        let tracks;
        if (showFavoritesOnly) {
            tracks = MUSIC_LIBRARY.tracks.filter(t => favorites.has(t.id));
        } else if (activeEp) {
            tracks = MUSIC_LIBRARY.getByEp(activeEp);
        } else {
            tracks = MUSIC_LIBRARY.tracks;
        }

        if (searchQuery && searchQuery.trim()) {
            const q = searchQuery.trim().toLowerCase();
            tracks = tracks.filter(t =>
                (t.title && t.title.toLowerCase().includes(q)) ||
                (t.titleEn && t.titleEn.toLowerCase().includes(q)) ||
                (t.titleCn && t.titleCn.toLowerCase().includes(q))
            );
        }

        if (showFavoritesOnly && activeEp) {
            tracks = tracks.filter(t => t.ep === activeEp);
        }

        if (els.trackCount) {
            els.trackCount.textContent = tracks.length + ' / ' + MUSIC_LIBRARY.tracks.length;
        }

        els.library.innerHTML = tracks.map(t => {
            const isActive = currentTrackId === t.id;
            const isFav = favorites.has(t.id);
            const subtitle = t.titleCn || t.titleEn || '';
            const displayTitle = t.title;
            const hasAudio = !!(t.neteaseId || t.url);

            return `
            <div class="lib-track${isActive ? ' active' : ''}${!hasAudio ? ' unavailable' : ''}" data-id="${t.id}">
                <span class="lib-track-star${isFav ? ' fav' : ''}" data-id="${t.id}" title="${isFav ? 'Remove from favorites' : 'Add to favorites'}">
                    ${isFav ? '★' : '☆'}
                </span>
                <span class="lib-track-info">
                    <span class="lib-track-title">${escapeHtml(displayTitle)}${!hasAudio ? ' <small>(N/A)</small>' : ''}</span>
                    ${subtitle && subtitle !== displayTitle ? `<span class="lib-track-sub">${escapeHtml(subtitle)}</span>` : ''}
                </span>
                <span class="lib-track-ep">${MUSIC_LIBRARY.EP_LABELS[t.ep] || t.ep}</span>
            </div>`;
        }).join('');

        if (tracks.length === 0) {
            els.library.innerHTML = '<div class="lib-empty">No tracks found</div>';
        }

        els.library.querySelectorAll('.lib-track').forEach(el => {
            el.addEventListener('click', (e) => {
                if (e.target.closest('.lib-track-star')) return;
                const id = el.dataset.id;
                const track = MUSIC_LIBRARY.byId[id];
                if (track) {
                    playLibraryTrack(track);
                }
            });
        });

        els.library.querySelectorAll('.lib-track-star').forEach(star => {
            star.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = star.dataset.id;
                if (favorites.has(id)) {
                    favorites.delete(id);
                } else {
                    favorites.add(id);
                }
                saveFavorites();
                if (id === currentTrackId) updateFavIcon();
                renderLibrary();
            });
        });
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    /* ================================================================
       PLAYBACK — NetEase Cloud Music streaming
       ================================================================ */
    function playLibraryTrack(track) {
        if (!track.neteaseId && !track.url) {
            showToast('「' + track.title + '」暂无在线音频');
            return;
        }

        loadTrack(track);
        play();
        renderLibrary();

        const activeEl = els.library ? els.library.querySelector('.lib-track.active') : null;
        if (activeEl) activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    /** Load a track without auto-playing */
    function loadTrack(track) {
        currentTrackId = track.id;
        consecutiveErrors = 0;

        const audioUrl = MUSIC_LIBRARY.getAudioUrl(track);
        if (!audioUrl) return;

        audio.pause();
        isPlaying = false;
        updatePlayIcon();

        audio.src = audioUrl;
        audio.load();

        if (els.title)  els.title.textContent = track.title;
        if (els.artist) {
            els.artist.textContent = (track.titleCn && track.titleEn)
                ? track.titleEn
                : 'Arknights OST';
        }
        updateFavIcon();
    }

    /** Skip to the next available track (used on error) */
    function skipToNextAvailable() {
        const tracks = getVisibleTracks();
        if (tracks.length === 0) return;

        const idx = tracks.findIndex(t => t.id === currentTrackId);
        // Try next few tracks
        for (let i = 1; i <= tracks.length; i++) {
            const nextIdx = (idx + i) % tracks.length;
            const track = tracks[nextIdx];
            if (track && (track.neteaseId || track.url)) {
                loadTrack(track);
                play();
                renderLibrary();
                return;
            }
        }
        // No available track found
        pause();
        showToast('No playable tracks in current selection.');
    }

    /* ================================================================
       PLAYBACK CONTROLS
       ================================================================ */
    function togglePlay() {
        if (isPlaying) { pause(); }
        else           { play(); }
    }

    function play() {
        if (!audio.src || audio.src === window.location.href) {
            // No source loaded — try current track or first available
            if (currentTrackId) {
                const track = MUSIC_LIBRARY.byId[currentTrackId];
                if (track) loadTrack(track);
            } else {
                const first = MUSIC_LIBRARY.tracks.find(t => t.neteaseId || t.url);
                if (first) loadTrack(first);
            }
        }

        const playPromise = audio.play();
        if (playPromise !== undefined) {
            playPromise.then(() => {
                isPlaying = true;
                updatePlayIcon();
            }).catch(e => {
                console.warn('Music: playback failed —', e.message);
                isPlaying = false;
                updatePlayIcon();
                // Browser may block autoplay — show a hint
                if (e.name === 'NotAllowedError') {
                    showToast('Click play to start (autoplay blocked by browser).');
                }
            });
        }
    }

    function pause() {
        audio.pause();
        isPlaying = false;
        updatePlayIcon();
    }

    function prev() {
        if (currentTrackId) {
            const tracks = getVisibleTracks();
            const idx = tracks.findIndex(t => t.id === currentTrackId);
            // Search backwards for a track with audio source
            for (let i = idx - 1; i >= 0; i--) {
                if (tracks[i] && (tracks[i].neteaseId || tracks[i].url)) {
                    playLibraryTrack(tracks[i]);
                    return;
                }
            }
            // Wrap around from the end
            for (let i = tracks.length - 1; i > idx; i--) {
                if (tracks[i] && (tracks[i].neteaseId || tracks[i].url)) {
                    playLibraryTrack(tracks[i]);
                    return;
                }
            }
        }
    }

    function next() {
        skipToNextAvailable();
    }

    function getVisibleTracks() {
        let tracks;
        if (showFavoritesOnly) {
            tracks = MUSIC_LIBRARY.tracks.filter(t => favorites.has(t.id));
        } else if (activeEp) {
            tracks = MUSIC_LIBRARY.getByEp(activeEp);
        } else {
            tracks = MUSIC_LIBRARY.tracks;
        }

        if (searchQuery && searchQuery.trim()) {
            const q = searchQuery.trim().toLowerCase();
            tracks = tracks.filter(t =>
                (t.title && t.title.toLowerCase().includes(q)) ||
                (t.titleEn && t.titleEn.toLowerCase().includes(q)) ||
                (t.titleCn && t.titleCn.toLowerCase().includes(q))
            );
        }

        if (showFavoritesOnly && activeEp) {
            tracks = tracks.filter(t => t.ep === activeEp);
        }

        return tracks;
    }

    function onTrackEnd() {
        next();
    }

    /* ================================================================
       UI UPDATES
       ================================================================ */
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

    /* ================================================================
       WAVEFORM
       ================================================================ */
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

    /* ================================================================
       TOAST
       ================================================================ */
    function showToast(msg) {
        try {
            if (typeof App !== 'undefined' && App.showToast) {
                App.showToast(msg);
                return;
            }
        } catch {}
        console.log('[Music]', msg);
    }

    /* ================================================================
       PUBLIC API
       ================================================================ */
    return {
        init,
        play,
        pause,
        togglePlay,
        prev,
        next,
        getCurrentTrackId: () => currentTrackId,
        isFavorite: (id) => favorites.has(id),
        refreshLibrary: renderLibrary,
    };
})();
