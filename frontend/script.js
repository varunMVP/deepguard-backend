const API_URL    = 'https://exsufflicate-rudolph-squamate.ngrok-free.dev';
let selectedFile = null;
let currentTab   = 'video';

const EMOTION_CONFIG = {
    angry:   { color: '#f43f5e', label: 'Angry'    },
    fear:    { color: '#f97316', label: 'Fear'      },
    disgust: { color: '#a855f7', label: 'Disgust'   },
    sad:     { color: '#6366f1', label: 'Sad'       },
    neutral: { color: '#00f5c4', label: 'Neutral'   },
    happy:   { color: '#22c55e', label: 'Happy'     },
    surprise:{ color: '#0ea5e9', label: 'Surprise'  }
};

// ── AUTH CHECK ON PAGE LOAD ───────────────────────────────────
document.addEventListener('DOMContentLoaded', async function() {
    const user = await requireAuth();
    if (!user) return;
    document.getElementById('navUserEmail').textContent = user.email;
    document.getElementById('signOutBtn').style.display = 'block';
});

// ── TAB SWITCHING ─────────────────────────────────────────────
function switchTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`tab-${tab}`).classList.add('active');
    const config = {
        video: { accept: 'video/*', emoji: '📹', hint: 'Supports MP4, AVI, MOV — max 500MB' },
        image: { accept: 'image/*', emoji: '🖼️', hint: 'Supports JPG, PNG, WEBP, BMP'       }
    };
    const c = config[tab];
    document.getElementById('fileInput').accept        = c.accept;
    document.getElementById('uploadEmoji').textContent = c.emoji;
    document.getElementById('uploadHint').textContent  = c.hint;
    resetUpload();
}

// ── DRAG AND DROP ─────────────────────────────────────────────
const uploadZone = document.getElementById('uploadZone');
const fileInput  = document.getElementById('fileInput');

uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('dragover'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
});
uploadZone.addEventListener('click', (e) => {
    if (e.target.classList.contains('upload-btn') || e.target === fileInput) return;
    fileInput.click();
});
fileInput.addEventListener('change', (e) => { if (e.target.files[0]) handleFile(e.target.files[0]); });

// ── HANDLE FILE ───────────────────────────────────────────────
function handleFile(file) {
    selectedFile = file;
    const sizeMB = (file.size / 1024 / 1024).toFixed(2);

    uploadZone.style.display = 'none';
    document.getElementById('previewZone').style.display  = 'flex';
    document.getElementById('resultsZone').style.display  = 'none';

    const previewVideo = document.getElementById('previewVideo');
    const previewImage = document.getElementById('previewImage');
    previewVideo.style.display = 'none';
    previewImage.style.display = 'none';
    previewVideo.src = '';
    previewImage.src = '';

    const url = URL.createObjectURL(file);

    if (currentTab === 'video') {
        previewVideo.style.display   = 'block';
        previewVideo.style.width     = '100%';
        previewVideo.style.maxHeight = '300px';
        previewVideo.src             = url;
    } else {
        previewImage.style.display   = 'block';
        previewImage.style.width     = '100%';
        previewImage.style.maxHeight = '300px';
        previewImage.style.objectFit = 'cover';
        previewImage.src             = url;
    }

    document.getElementById('fileChip').textContent = `${file.name}  ·  ${sizeMB} MB`;
}

// ── ANALYZE ───────────────────────────────────────────────────
async function analyzeFile() {
    if (!selectedFile) return;

    const btn = document.getElementById('analyzeBtn');
    btn.disabled = true;
    btn.querySelector('.btn-text').textContent = 'Analyzing...';

    const msgs = {
        video: 'Running deepfake detection and emotion analysis...',
        image: 'Scanning image for AI manipulation...'
    };
    document.getElementById('loadingMsg').textContent = msgs[currentTab];

    document.getElementById('resultsZone').style.display  = 'block';
    document.getElementById('loadingState').style.display = 'flex';
    document.getElementById('verdictZone').style.display  = 'none';
    document.getElementById('resultsZone').scrollIntoView({ behavior: 'smooth' });

    const steps = ['ls1','ls2','ls3','ls4'];
    let si = 0;
    const stepTimer = setInterval(() => {
        if (si < steps.length) {
            document.getElementById(steps[si]).classList.add('done');
            si++;
        } else clearInterval(stepTimer);
    }, 800);

    try {
        const formData = new FormData();
        formData.append('file', selectedFile);

        const resp = await fetch(`${API_URL}/analyze/${currentTab}`, {
            method : 'POST',
            body   : formData,
            headers: { 'ngrok-skip-browser-warning': 'true' }
        });
        const data = await resp.json();
        clearInterval(stepTimer);
        steps.forEach(s => document.getElementById(s).classList.add('done'));
        setTimeout(() => displayResults(data), 400);

    } catch (err) {
        clearInterval(stepTimer);
        displayError(err.message);
    }

    btn.disabled = false;
    btn.querySelector('.btn-text').textContent = 'Run Analysis';
}

// ── DISPLAY RESULTS ───────────────────────────────────────────
function displayResults(data) {
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('verdictZone').style.display  = 'block';

    const card  = document.getElementById('verdictCard');
    const badge = document.getElementById('verdictBadge');
    card.className = 'verdict-card';

    if (data.status === 'AUTHENTICATED') {
        card.classList.add('authenticated');
        badge.textContent = '✅';
        document.getElementById('verdictStatus').textContent = 'AUTHENTICATED';
    } else if (data.status === 'SUSPICIOUS') {
        card.classList.add('suspicious');
        badge.textContent = '⚠️';
        document.getElementById('verdictStatus').textContent = 'SUSPICIOUS';
    } else if (data.status === 'REJECTED') {
        card.classList.add('rejected');
        badge.textContent = '❌';
        document.getElementById('verdictStatus').textContent = 'REJECTED';
    } else {
        card.classList.add('rejected');
        badge.textContent = '⚠️';
        document.getElementById('verdictStatus').textContent = 'ERROR';
    }

    document.getElementById('verdictDetail').textContent = data.final_verdict || data.message || '';
    document.getElementById('verdictMeta').textContent   = data.processing_time
        ? `⏱ Processed in ${data.processing_time}s  ·  Input: ${(data.input_type||'').toUpperCase()}`
        : `Input: ${(data.input_type||'').toUpperCase()}`;

    // Trust ring
    const trustScore = data.trust_score || 0;
    document.getElementById('trustNum').textContent = `${Math.round(trustScore)}%`;
    setTimeout(() => {
        const circle = document.getElementById('trustCircle');
        const offset = 201 - (trustScore / 100) * 201;
        circle.style.strokeDashoffset = offset;
        circle.style.transition = 'stroke-dashoffset 1.2s ease';
        circle.style.stroke = trustScore >= 70 ? '#10b981'
                            : trustScore >= 45 ? '#f59e0b' : '#f43f5e';
    }, 100);

    // Layer 1
    const df     = data.deepfake;
    const l1Card = document.getElementById('layer1Card');
    if (df && df.result !== 'ERROR') {
        l1Card.style.opacity = '1';
        const color = df.result === 'REAL' ? 'var(--success)' : 'var(--danger)';
        document.getElementById('l1Result').innerHTML =
            `<span style="color:${color}">${df.result}</span>`;
        document.getElementById('l1Fill').style.width  = `${df.confidence}%`;
        document.getElementById('l1Conf').textContent  = `${df.confidence}%`;
        document.getElementById('l1Stats').textContent = df.total_frames
            ? `${df.real_frames} real / ${df.fake_frames} fake out of ${df.total_frames} frames`
            : `Real: ${df.real_prob}%  ·  Fake: ${df.fake_prob}%`;
    } else {
        l1Card.style.opacity = '0.3';
        document.getElementById('l1Result').textContent = 'N/A';
        document.getElementById('l1Stats').textContent  = 'Skipped';
    }

    // Layer 2
    const beh    = data.behavior;
    const l2Card = document.getElementById('layer2Card');
    if (beh && beh.result !== 'ERROR') {
        l2Card.style.opacity = '1';
        const color = beh.result === 'TRUTHFUL' ? 'var(--success)' : 'var(--warn)';
        document.getElementById('l2Result').innerHTML =
            `<span style="color:${color}">${beh.result}</span>`;
        document.getElementById('l2Fill').style.width  = `${beh.confidence}%`;
        document.getElementById('l2Conf').textContent  = `${beh.confidence}%`;
        document.getElementById('l2Stats').textContent =
            `Truthful: ${beh.truthful_prob}%  ·  Deceptive: ${beh.deceptive_prob}%`;
    } else {
        l2Card.style.opacity = '0.3';
        document.getElementById('l2Result').textContent = 'N/A';
        document.getElementById('l2Stats').textContent  =
            data.status === 'REJECTED' ? 'Skipped — Deepfake detected at Layer 1'
            : currentTab === 'image'   ? 'Not applicable for image input' : 'Skipped';
    }

    // Emotion breakdown
    const emo = beh?.emotion_summary;
    if (emo) {
        document.getElementById('emotionSection').style.display = 'block';
        renderEmotionBreakdown(emo);
    } else {
        document.getElementById('emotionSection').style.display = 'none';
    }

    // Frame analysis
    const frames = data.deepfake?.frame_details;
    if (frames && frames.length > 0) {
        document.getElementById('frameAnalysis').style.display = 'block';
        document.getElementById('faSummary').textContent =
            `${frames.filter(f => f.result === 'REAL').length}/${frames.length} frames authentic`;
        document.getElementById('framesRow').innerHTML = frames.map(f =>
            `<div class="frame-chip ${f.result.toLowerCase()}">
                F${f.frame} · ${f.result} · ${f.confidence}%
            </div>`
        ).join('');
    } else {
        document.getElementById('frameAnalysis').style.display = 'none';
    }

    if (data.processing_time) {
        document.getElementById('processTime').textContent =
            `⏱ ${data.processing_time}s processing time`;
    }

    // Save to Supabase history
    if (selectedFile) {
        saveAnalysis({
            filename: selectedFile.name,
            ...data
        });
    }
}

// ── EMOTION BREAKDOWN ─────────────────────────────────────────
function renderEmotionBreakdown(emo) {
    document.getElementById('emotionSub').textContent =
        `Based on ${emo.dominant_emotions.length} frames analyzed`;

    document.getElementById('emotionFrameSummary').innerHTML =
        `<span style="color:var(--danger)">${emo.deceptive_frames} deceptive frames</span><br>
         <span style="color:var(--success)">${emo.truthful_frames} truthful frames</span>`;

    const emotionData = [
        { key: 'angry',   val: emo.avg_angry   || 0 },
        { key: 'fear',    val: emo.avg_fear     || 0 },
        { key: 'sad',     val: emo.avg_sad      || 0 },
        { key: 'neutral', val: emo.avg_neutral  || 0 },
        { key: 'happy',   val: emo.avg_happy    || 0 },
    ].sort((a, b) => b.val - a.val);

    document.getElementById('emotionBars').innerHTML = emotionData.map(e => {
        const cfg = EMOTION_CONFIG[e.key];
        return `
        <div class="emotion-bar-row">
            <div class="emotion-bar-label">${cfg.label}</div>
            <div class="emotion-bar-track">
                <div class="emotion-bar-fill"
                     style="width:0%;background:${cfg.color}"
                     data-target="${Math.min(e.val, 100)}">
                </div>
            </div>
            <div class="emotion-bar-val">${e.val.toFixed(1)}%</div>
        </div>`;
    }).join('');

    setTimeout(() => {
        document.querySelectorAll('.emotion-bar-fill').forEach(el => {
            el.style.transition = 'width 1s ease';
            el.style.width = el.dataset.target + '%';
        });
    }, 100);

    if (emo.dominant_emotions && emo.dominant_emotions.length > 0) {
        document.getElementById('emotionTimeline').innerHTML =
            emo.dominant_emotions.map((emotion, i) => {
                const cfg = EMOTION_CONFIG[emotion] || { color: '#64748b', label: emotion };
                return `<div class="emotion-frame-dot"
                     style="background:${cfg.color}22;
                            border:1px solid ${cfg.color}55;
                            color:${cfg.color}"
                     title="Frame ${i+1}: ${cfg.label}">
                    ${emotion.substring(0,3).toUpperCase()}
                </div>`;
            }).join('');
    }
}

// ── ERROR ─────────────────────────────────────────────────────
function displayError(message) {
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('verdictZone').style.display  = 'block';
    const card = document.getElementById('verdictCard');
    card.className = 'verdict-card rejected';
    document.getElementById('verdictBadge').textContent  = '⚠️';
    document.getElementById('verdictStatus').textContent = 'ERROR';
    document.getElementById('verdictDetail').textContent =
        `Cannot connect to backend: ${message}`;
}

// ── RESET ─────────────────────────────────────────────────────
function resetUpload() {
    selectedFile = null;
    uploadZone.style.display = 'block';
    document.getElementById('previewZone').style.display  = 'none';
    document.getElementById('resultsZone').style.display  = 'none';
    document.getElementById('fileInput').value            = '';
    document.getElementById('previewVideo').src = '';
    document.getElementById('previewImage').src = '';
    ['ls1','ls2','ls3','ls4'].forEach(id =>
        document.getElementById(id).classList.remove('done')
    );
}

function resetAll() {
    resetUpload();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── LAYER ANIMATION ───────────────────────────────────────────
setInterval(() => {
    const items = document.querySelectorAll('.layer-item');
    items.forEach(i => i.classList.remove('active'));
    const active = Math.floor(Date.now() / 1500) % items.length;
    if (items[active]) items[active].classList.add('active');
}, 1500);