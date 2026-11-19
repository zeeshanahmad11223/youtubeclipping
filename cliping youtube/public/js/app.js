/* ============================================
   ClipForge — Main Application Logic
   ============================================ */

// --- YouTube Player ---
let player = null;
let playerReady = false;
let videoDuration = 0;
let clipDuration = 60;
let clipStartTime = 0;
let updateInterval = null;
let clips = [];
let isDraggingTimeline = false;

// YouTube IFrame API callback
function onYouTubeIframeAPIReady() {
    console.log('YouTube IFrame API Ready');
}

// --- DOM Elements ---
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const urlInput = $('#youtubeUrl');
const loadBtn = $('#loadVideoBtn');
const urlError = $('#urlError');
const editorPanel = $('#editorPanel');
const videoTitle = $('#videoTitle');
const videoChannel = $('#videoChannel');
const videoThumbnail = $('#videoThumbnail');
const videoDurationBadge = $('#videoDuration');
const playPauseBtn = $('#playPauseBtn');
const playOverlayBtn = $('#playOverlayBtn');
const playerOverlay = $('#playerOverlay');
const currentTimeEl = $('#currentTime');
const totalTimeEl = $('#totalTime');
const muteBtn = $('#muteBtn');
const volumeSlider = $('#volumeSlider');
const startMinInput = $('#startMin');
const startSecInput = $('#startSec');
const setCurrentTimeBtn = $('#setCurrentTimeBtn');
const rangeStart = $('#rangeStart');
const rangeEnd = $('#rangeEnd');
const previewClipBtn = $('#previewClipBtn');
const exportClipBtn = $('#exportClipBtn');
const timelineTrack = $('#timelineTrack');
const timelineProgress = $('#timelineProgress');
const timelineHandle = $('#timelineHandle');
const clipRegion = $('#clipRegion');
const timelineMarkers = $('#timelineMarkers');
const timelineContainer = $('#timelineContainer');
const exportModal = $('#exportModal');
const closeModal = $('#closeModal');
const downloadBtn = $('#downloadBtn');
const exportProgress = $('#exportProgress');
const progressFill = $('#progressFill');
const progressText = $('#progressText');
const queueList = $('#queueList');
const queueCount = $('#queueCount');
const toast = $('#toast');
const toastMessage = $('#toastMessage');

// --- Utility Functions ---
function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) seconds = 0;
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatTimeFull(seconds) {
    if (isNaN(seconds) || seconds < 0) seconds = 0;
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function extractVideoId(url) {
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
        /^([a-zA-Z0-9_-]{11})$/
    ];
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }
    return null;
}

function showToast(message, duration = 3000) {
    toastMessage.textContent = message;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), duration);
}

function animateCount(element, target, duration = 1500) {
    let start = 0;
    const increment = target / (duration / 16);
    const timer = setInterval(() => {
        start += increment;
        if (start >= target) {
            element.textContent = target.toLocaleString();
            clearInterval(timer);
        } else {
            element.textContent = Math.floor(start).toLocaleString();
        }
    }, 16);
}

// --- Initialize Video ---
function loadVideo(videoId) {
    if (player) {
        player.destroy();
    }

    // Set thumbnail
    videoThumbnail.innerHTML = `<img src="https://img.youtube.com/vi/${videoId}/mqdefault.jpg" alt="Thumbnail">`;

    // Create player
    player = new YT.Player('youtubePlayer', {
        videoId: videoId,
        playerVars: {
            autoplay: 0,
            controls: 0,
            modestbranding: 1,
            rel: 0,
            showinfo: 0,
            fs: 0,
            iv_load_policy: 3,
            disablekb: 1,
            playsinline: 1,
            origin: window.location.origin
        },
        events: {
            onReady: onPlayerReady,
            onStateChange: onPlayerStateChange,
            onError: onPlayerError
        }
    });
}

function onPlayerReady(event) {
    playerReady = true;
    videoDuration = player.getDuration();

    // Update UI
    totalTimeEl.textContent = formatTimeFull(videoDuration);
    videoDurationBadge.innerHTML = `<i class="fas fa-clock"></i> ${formatTimeFull(videoDuration)}`;

    // Fetch video info via oEmbed
    fetchVideoInfo(player.getVideoUrl());

    // Setup timeline markers
    setupTimelineMarkers();

    // Update clip region
    updateClipRegion();

    // Start update loop
    if (updateInterval) clearInterval(updateInterval);
    updateInterval = setInterval(updatePlayerUI, 100);

    // Set volume
    player.setVolume(parseInt(volumeSlider.value));

    showToast('Video loaded successfully!');
}

function onPlayerStateChange(event) {
    const state = event.data;
    if (state === YT.PlayerState.PLAYING) {
        playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
        playerOverlay.style.opacity = '0';
        playerOverlay.style.pointerEvents = 'none';
    } else if (state === YT.PlayerState.PAUSED || state === YT.PlayerState.ENDED) {
        playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
        playerOverlay.style.pointerEvents = 'auto';
    }
}

function onPlayerError(event) {
    console.error('YouTube Player Error:', event.data);
    showToast('Error loading video. Please try another URL.');
}

async function fetchVideoInfo(url) {
    try {
        const videoId = extractVideoId(url);
        // Use noembed as a lightweight alternative
        const response = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`);
        const data = await response.json();
        if (data.title) {
            videoTitle.textContent = data.title;
            videoChannel.textContent = data.author_name || 'Unknown Channel';
        }
    } catch (err) {
        videoTitle.textContent = 'YouTube Video';
        videoChannel.textContent = 'Unknown Channel';
    }
}

// --- Player UI Updates ---
function updatePlayerUI() {
    if (!playerReady || !player || typeof player.getCurrentTime !== 'function') return;

    const currentTime = player.getCurrentTime();
    currentTimeEl.textContent = formatTimeFull(currentTime);

    // Update timeline progress
    if (!isDraggingTimeline) {
        const progress = (currentTime / videoDuration) * 100;
        timelineProgress.style.width = `${progress}%`;
        timelineHandle.style.left = `${progress}%`;
    }

    // Check if we've passed the clip end during preview
    if (isPreviewingClip && currentTime >= clipStartTime + clipDuration) {
        player.pauseVideo();
        isPreviewingClip = false;
        showToast('Clip preview ended');
    }
}

let isPreviewingClip = false;

// --- Timeline ---
function setupTimelineMarkers() {
    timelineMarkers.innerHTML = '';
    const markerCount = Math.min(10, Math.floor(videoDuration / 30));
    const interval = videoDuration / markerCount;

    for (let i = 0; i <= markerCount; i++) {
        const span = document.createElement('span');
        span.textContent = formatTimeFull(i * interval);
        timelineMarkers.appendChild(span);
    }
}

function updateClipRegion() {
    if (videoDuration <= 0) return;

    const startPercent = (clipStartTime / videoDuration) * 100;
    const durationPercent = (clipDuration / videoDuration) * 100;

    // Clamp to 100%
    const clampedDuration = Math.min(durationPercent, 100 - startPercent);

    clipRegion.style.left = `${startPercent}%`;
    clipRegion.style.width = `${clampedDuration}%`;

    // Update range display
    rangeStart.textContent = formatTimeFull(clipStartTime);
    const endTime = Math.min(clipStartTime + clipDuration, videoDuration);
    rangeEnd.textContent = formatTimeFull(endTime);

    // Update start time inputs
    startMinInput.value = Math.floor(clipStartTime / 60);
    startSecInput.value = Math.floor(clipStartTime % 60);
}

// Timeline click/drag handler
function handleTimelineInteraction(e) {
    const rect = timelineTrack.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const percent = x / rect.width;
    const time = percent * videoDuration;

    clipStartTime = Math.max(0, Math.min(time, videoDuration - clipDuration));
    updateClipRegion();

    if (playerReady && player) {
        player.seekTo(clipStartTime, true);
    }
}

timelineTrack.addEventListener('mousedown', (e) => {
    isDraggingTimeline = true;
    handleTimelineInteraction(e);
});

document.addEventListener('mousemove', (e) => {
    if (isDraggingTimeline) handleTimelineInteraction(e);
});

document.addEventListener('mouseup', () => {
    isDraggingTimeline = false;
});

// Touch support
timelineTrack.addEventListener('touchstart', (e) => {
    isDraggingTimeline = true;
    const touch = e.touches[0];
    handleTimelineInteraction(touch);
});

document.addEventListener('touchmove', (e) => {
    if (isDraggingTimeline) {
        const touch = e.touches[0];
        handleTimelineInteraction(touch);
    }
});

document.addEventListener('touchend', () => {
    isDraggingTimeline = false;
});

// --- Event Listeners ---

// Load video button
loadBtn.addEventListener('click', () => {
    const url = urlInput.value.trim();
    const videoId = extractVideoId(url);

    if (!videoId) {
        urlError.classList.remove('hidden');
        urlInput.focus();
        return;
    }

    urlError.classList.add('hidden');
    editorPanel.classList.remove('hidden');

    // Scroll to editor
    setTimeout(() => {
        editorPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);

    loadVideo(videoId);
});

// Enter key on URL input
urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loadBtn.click();
});

// Clear error on input
urlInput.addEventListener('input', () => {
    urlError.classList.add('hidden');
});

// Play/Pause
playPauseBtn.addEventListener('click', () => {
    if (!playerReady) return;
    const state = player.getPlayerState();
    if (state === YT.PlayerState.PLAYING) {
        player.pauseVideo();
    } else {
        player.playVideo();
    }
});

playOverlayBtn.addEventListener('click', () => {
    if (!playerReady) return;
    player.playVideo();
});

// Mute
muteBtn.addEventListener('click', () => {
    if (!playerReady) return;
    if (player.isMuted()) {
        player.unMute();
        muteBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
    } else {
        player.mute();
        muteBtn.innerHTML = '<i class="fas fa-volume-mute"></i>';
    }
});

// Volume
volumeSlider.addEventListener('input', () => {
    if (!playerReady) return;
    player.setVolume(parseInt(volumeSlider.value));
    if (parseInt(volumeSlider.value) === 0) {
        muteBtn.innerHTML = '<i class="fas fa-volume-mute"></i>';
    } else {
        muteBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
    }
});

// Duration buttons
$$('.duration-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        $$('.duration-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        clipDuration = parseInt(btn.dataset.duration);

        // Clamp start time if needed
        if (clipStartTime + clipDuration > videoDuration) {
            clipStartTime = Math.max(0, videoDuration - clipDuration);
        }

        updateClipRegion();
    });
});

// Start time inputs
function handleStartTimeChange() {
    const mins = parseInt(startMinInput.value) || 0;
    const secs = parseInt(startSecInput.value) || 0;
    clipStartTime = Math.max(0, Math.min(mins * 60 + secs, videoDuration - clipDuration));
    updateClipRegion();

    if (playerReady && player) {
        player.seekTo(clipStartTime, true);
    }
}

startMinInput.addEventListener('change', handleStartTimeChange);
startSecInput.addEventListener('change', handleStartTimeChange);

// Set current time button
setCurrentTimeBtn.addEventListener('click', () => {
    if (!playerReady) return;
    clipStartTime = Math.max(0, Math.min(player.getCurrentTime(), videoDuration - clipDuration));
    updateClipRegion();
    showToast('Start time set to current position');
});

// Preview clip
previewClipBtn.addEventListener('click', () => {
    if (!playerReady) return;
    player.seekTo(clipStartTime, true);
    player.playVideo();
    isPreviewingClip = true;
    showToast(`Previewing ${clipDuration}s clip from ${formatTimeFull(clipStartTime)}`);
});

// Export clip
exportClipBtn.addEventListener('click', () => {
    if (!playerReady) return;

    // Add to clips queue
    const clip = {
        id: Date.now(),
        videoId: extractVideoId(urlInput.value),
        title: videoTitle.textContent,
        startTime: clipStartTime,
        duration: clipDuration,
        endTime: Math.min(clipStartTime + clipDuration, videoDuration)
    };

    clips.push(clip);
    updateClipsQueue();

    // Show export modal
    $('#exportVideoTitle').textContent = videoTitle.textContent;
    $('#exportRange').textContent = `${formatTimeFull(clip.startTime)} → ${formatTimeFull(clip.endTime)}`;
    $('#exportDuration').textContent = `${clip.duration}s`;
    exportModal.classList.remove('hidden');
});

// Close modal
closeModal.addEventListener('click', () => {
    exportModal.classList.add('hidden');
    exportProgress.classList.add('hidden');
    progressFill.style.width = '0%';
});

exportModal.addEventListener('click', (e) => {
    if (e.target === exportModal) {
        exportModal.classList.add('hidden');
        exportProgress.classList.add('hidden');
        progressFill.style.width = '0%';
    }
});

// Quality buttons
$$('.quality-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        $$('.quality-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    });
});

// Download button
downloadBtn.addEventListener('click', () => {
    exportProgress.classList.remove('hidden');
    downloadBtn.disabled = true;
    downloadBtn.style.opacity = '0.5';

    // Simulate download progress
    let progress = 0;
    const progressInterval = setInterval(() => {
        progress += Math.random() * 15;
        if (progress >= 100) {
            progress = 100;
            clearInterval(progressInterval);

            progressFill.style.width = '100%';
            progressText.textContent = 'Complete! Preparing download...';

            setTimeout(() => {
                // Create download info
                const clip = clips[clips.length - 1];
                const info = {
                    source: clip.title,
                    videoId: clip.videoId,
                    startTime: formatTimeFull(clip.startTime),
                    endTime: formatTimeFull(clip.endTime),
                    duration: `${clip.duration}s`,
                    quality: document.querySelector('.quality-btn.active')?.dataset.quality || '1080',
                    format: document.querySelector('input[name="format"]:checked')?.value || 'mp4',
                    clipUrl: `https://www.youtube.com/watch?v=${clip.videoId}&t=${Math.floor(clip.startTime)}`
                };

                // Generate a text file with clip info
                const blob = new Blob([
                    `ClipForge — Clip Export Info\n`,
                    `${'='.repeat(40)}\n\n`,
                    `Video: ${info.source}\n`,
                    `Video ID: ${info.videoId}\n`,
                    `Clip Start: ${info.startTime}\n`,
                    `Clip End: ${info.endTime}\n`,
                    `Duration: ${info.duration}\n`,
                    `Quality: ${info.quality}p\n`,
                    `Format: ${info.format.toUpperCase()}\n\n`,
                    `YouTube Link (at start time):\n${info.clipUrl}\n\n`,
                    `${'='.repeat(40)}\n`,
                    `To download the actual clip, use yt-dlp:\n`,
                    `yt-dlp "${info.clipUrl}" --download-sections "*${formatTimeFull(clip.startTime)}-${formatTimeFull(clip.endTime)}" -f "bestvideo[height<=${info.quality}]+bestaudio" -o "clip_%(title)s.%(ext)s"\n`
                ], { type: 'text/plain' });

                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = `clip_${info.videoId}_${Math.floor(clip.startTime)}s.txt`;
                link.click();
                URL.revokeObjectURL(link.href);

                showToast('Clip info downloaded! Use yt-dlp command to get the video.');

                downloadBtn.disabled = false;
                downloadBtn.style.opacity = '1';

                setTimeout(() => {
                    exportModal.classList.add('hidden');
                    exportProgress.classList.add('hidden');
                    progressFill.style.width = '0%';
                }, 1500);

            }, 500);
        }

        progressFill.style.width = `${progress}%`;
        progressText.textContent = `Processing... ${Math.floor(progress)}%`;
    }, 200);
});

// --- Clips Queue ---
function updateClipsQueue() {
    queueCount.textContent = `${clips.length} clip${clips.length !== 1 ? 's' : ''}`;

    if (clips.length === 0) {
        queueList.innerHTML = `
            <div class="queue-empty">
                <i class="fas fa-film"></i>
                <p>No clips yet. Create your first clip above!</p>
            </div>
        `;
        return;
    }

    queueList.innerHTML = clips.map((clip, index) => `
        <div class="clip-item" data-id="${clip.id}">
            <div class="clip-item-icon">
                <i class="fas fa-cut"></i>
            </div>
            <div class="clip-item-info">
                <div class="clip-item-name">Clip ${index + 1} — ${clip.duration}s</div>
                <div class="clip-item-meta">${formatTimeFull(clip.startTime)} → ${formatTimeFull(clip.endTime)}</div>
            </div>
            <div class="clip-item-actions">
                <button class="clip-action-btn preview-clip" data-index="${index}" title="Preview">
                    <i class="fas fa-play"></i>
                </button>
                <button class="clip-action-btn delete" data-index="${index}" title="Delete">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `).join('');

    // Bind clip action buttons
    queueList.querySelectorAll('.preview-clip').forEach(btn => {
        btn.addEventListener('click', () => {
            const index = parseInt(btn.dataset.index);
            const clip = clips[index];
            if (clip && playerReady) {
                clipStartTime = clip.startTime;
                clipDuration = clip.duration;
                updateClipRegion();

                // Update duration button UI
                $$('.duration-btn').forEach(b => {
                    b.classList.toggle('active', parseInt(b.dataset.duration) === clip.duration);
                });

                player.seekTo(clip.startTime, true);
                player.playVideo();
                isPreviewingClip = true;
                showToast(`Previewing Clip ${index + 1}`);
            }
        });
    });

    queueList.querySelectorAll('.delete').forEach(btn => {
        btn.addEventListener('click', () => {
            const index = parseInt(btn.dataset.index);
            clips.splice(index, 1);
            updateClipsQueue();
            showToast('Clip removed');
        });
    });
}

// --- Animated Counters ---
function initCounters() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const counters = entry.target.querySelectorAll('.stat-number');
                counters.forEach(counter => {
                    const target = parseInt(counter.dataset.count);
                    animateCount(counter, target);
                });
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.5 });

    const heroStats = document.querySelector('.hero-stats');
    if (heroStats) observer.observe(heroStats);
}

// --- Smooth Scroll for Nav Links ---
$$('a[href^="#"]').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const target = document.querySelector(link.getAttribute('href'));
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });
});

// --- Navbar scroll effect ---
window.addEventListener('scroll', () => {
    const navbar = document.querySelector('.navbar');
    if (window.scrollY > 50) {
        navbar.style.padding = '10px 0';
        navbar.style.background = 'rgba(10, 10, 15, 0.95)';
    } else {
        navbar.style.padding = '16px 0';
        navbar.style.background = 'rgba(10, 10, 15, 0.8)';
    }
});

// --- Keyboard shortcuts ---
document.addEventListener('keydown', (e) => {
    if (!playerReady) return;
    if (document.activeElement.tagName === 'INPUT') return;

    switch (e.key) {
        case ' ':
            e.preventDefault();
            playPauseBtn.click();
            break;
        case 'ArrowLeft':
            e.preventDefault();
            player.seekTo(Math.max(0, player.getCurrentTime() - 5), true);
            break;
        case 'ArrowRight':
            e.preventDefault();
            player.seekTo(Math.min(videoDuration, player.getCurrentTime() + 5), true);
            break;
        case 'm':
        case 'M':
            muteBtn.click();
            break;
    }
});

// --- Initialize ---
document.addEventListener('DOMContentLoaded', () => {
    initCounters();
});
