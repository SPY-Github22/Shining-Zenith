// ===== AI HONEYPOT V3 — Extension Popup Logic =====

let state = {
    selectedPersona: 'grandma',
    isActive: false,
    sessionId: '',
    messages: [],
    extractedData: {},
    scamType: 'Unknown',
    escalationLevel: 'cooperative',
    callDuration: 0,
    callStartTime: null,
    personas: [],
    pastSessions: [],
    totalTimeWasted: 0
};

let recognition = null;
let timerInterval = null;
let isListeningRef = false;
let processingRef = false;

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
    checkApiKey();
    loadPersonas();
    loadSessions();
    initSpeechRecognition();
    bindEvents();
});

function checkApiKey() {
    chrome.storage.sync.get(['groqApiKey'], (result) => {
        const warn = document.getElementById('apiWarning');
        if (!result.groqApiKey) {
            warn.style.display = 'block';
            document.getElementById('startBtn').disabled = true;
        } else {
            warn.style.display = 'none';
            document.getElementById('startBtn').disabled = false;
        }
    });
}

function loadPersonas() {
    chrome.runtime.sendMessage({ type: 'GET_PERSONAS' }, (response) => {
        if (response?.personas) {
            state.personas = response.personas;
            renderPersonaGrid();
        }
    });
}

function loadSessions() {
    chrome.storage.local.get(['sessions', 'totalTimeWasted'], (result) => {
        state.pastSessions = result.sessions || [];
        state.totalTimeWasted = result.totalTimeWasted || 0;
        if (state.totalTimeWasted > 0) {
            const el = document.getElementById('totalTime');
            el.textContent = `⏱️ ${formatTime(state.totalTimeWasted)} wasted`;
            el.style.display = 'block';
        }
    });
}

function bindEvents() {
    document.getElementById('startBtn').addEventListener('click', startHoneypot);
    document.getElementById('endBtn').addEventListener('click', endHoneypot);
    document.getElementById('skipBtn').addEventListener('click', skipSpeech);
    document.getElementById('exportBtn').addEventListener('click', exportReport);
    document.getElementById('historyBtn').addEventListener('click', toggleHistory);
    document.getElementById('openOptions')?.addEventListener('click', (e) => {
        e.preventDefault();
        chrome.runtime.openOptionsPage();
    });
}

// ===== PERSONAS =====
function renderPersonaGrid() {
    const grid = document.getElementById('personaGrid');
    grid.innerHTML = state.personas.map(p => `
        <div class="persona-card ${state.selectedPersona === p.id ? 'selected' : ''}"
             data-id="${p.id}">
            <span class="persona-emoji">${p.emoji}</span>
            <div>
                <span class="persona-name">${p.name}</span>
                <span class="persona-desc">${p.description}</span>
            </div>
        </div>
    `).join('');

    grid.querySelectorAll('.persona-card').forEach(card => {
        card.addEventListener('click', () => {
            state.selectedPersona = card.dataset.id;
            renderPersonaGrid();
        });
    });
}

// ===== SPEECH RECOGNITION =====
function initSpeechRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
        document.getElementById('startBtn').disabled = true;
        return;
    }

    recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    let silenceTimer = null;

    recognition.onresult = (event) => {
        let interim = '', final = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const t = event.results[i][0].transcript;
            if (event.results[i].isFinal) final += t;
            else interim += t;
        }
        if (final) {
            processTranscript(final.trim());
        } else {
            showInterim(interim);
            clearTimeout(silenceTimer);
            silenceTimer = setTimeout(() => {
                if (interim && isListeningRef) processTranscript(interim.trim());
            }, 2000);
        }
    };

    recognition.onerror = (e) => {
        if (e.error !== 'no-speech' && e.error !== 'aborted') console.error('SR error:', e.error);
    };

    recognition.onend = () => {
        if (isListeningRef) try { recognition.start(); } catch (e) { }
    };
}

function startListening() {
    isListeningRef = true;
    try { recognition?.start(); } catch (e) { }
    updateVoiceStatus('listening');
}

function stopListening() {
    isListeningRef = false;
    try { recognition?.stop(); } catch (e) { }
}

function pauseListening() {
    try { recognition?.stop(); } catch (e) { }
}

function resumeListening() {
    if (isListeningRef) try { recognition?.start(); } catch (e) { }
}

// ===== MAIN FLOW =====
function startHoneypot() {
    state.sessionId = 'ext_' + Date.now();
    state.messages = [];
    state.extractedData = {};
    state.scamType = 'Unknown';
    state.escalationLevel = 'cooperative';
    state.callDuration = 0;
    state.callStartTime = new Date().toISOString();
    state.isActive = true;

    // UI
    document.getElementById('personaSection').style.display = 'none';
    document.getElementById('startBtn').style.display = 'none';
    document.getElementById('activeControls').style.display = 'flex';
    document.getElementById('timerBar').style.display = 'flex';
    document.getElementById('voiceStatus').style.display = 'block';
    document.getElementById('transcriptBox').style.display = 'block';
    document.getElementById('transcriptBox').innerHTML = '';

    // Timer
    timerInterval = setInterval(() => {
        state.callDuration++;
        document.getElementById('callTimer').textContent = formatTime(state.callDuration);
    }, 1000);

    // Greeting
    const greetings = {
        grandma: "Hello? Who's calling please?",
        grandpa: "Yeah, hello? Who is this?",
        priya: "Hello? Haan, who is this?",
        uncle_bob: "Hello hello! Bob here, what can I do ya for?"
    };
    const greeting = greetings[state.selectedPersona] || "Hello?";
    addMessage('assistant', greeting);
    speakText(greeting);
    startListening();
}

function endHoneypot() {
    stopListening();
    window.speechSynthesis?.cancel();
    clearInterval(timerInterval);
    state.isActive = false;

    // Save session
    const session = {
        id: state.sessionId,
        persona: state.selectedPersona,
        duration: state.callDuration,
        scamType: state.scamType,
        extractedInfo: state.extractedData,
        transcript: state.messages,
        startTime: state.callStartTime,
        endTime: new Date().toISOString()
    };

    state.pastSessions.push(session);
    state.totalTimeWasted += state.callDuration;

    chrome.storage.local.set({
        sessions: state.pastSessions,
        totalTimeWasted: state.totalTimeWasted
    });

    chrome.runtime.sendMessage({ type: 'CLEAR_SESSION', sessionId: state.sessionId });

    // UI reset
    document.getElementById('personaSection').style.display = 'block';
    document.getElementById('startBtn').style.display = 'block';
    document.getElementById('activeControls').style.display = 'none';
    document.getElementById('timerBar').style.display = 'none';
    document.getElementById('voiceStatus').style.display = 'none';

    // Update total time
    const el = document.getElementById('totalTime');
    el.textContent = `⏱️ ${formatTime(state.totalTimeWasted)} wasted`;
    el.style.display = 'block';
}

function skipSpeech() {
    window.speechSynthesis?.cancel();
    resumeListening();
    updateVoiceStatus('listening');
}

// ===== TRANSCRIPT PROCESSING =====
async function processTranscript(text) {
    if (!text.trim() || processingRef) return;
    processingRef = true;

    addMessage('user', text);
    updateVoiceStatus('waiting');

    try {
        const response = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
                type: 'CHAT',
                sessionId: state.sessionId,
                message: text,
                persona: state.selectedPersona,
                gatheredInfo: state.extractedData
            }, (res) => {
                if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
                else if (res?.error) reject(new Error(res.error));
                else resolve(res);
            });
        });

        addMessage('assistant', response.response);

        if (response.extractedInfo) {
            state.extractedData = response.extractedInfo;
            renderIntel();
        }

        if (response.scamType) {
            state.scamType = response.scamType;
            updateScamBadge();
        }

        if (response.escalationLevel) {
            state.escalationLevel = response.escalationLevel;
            updateEscalationBadge();
        }

        speakText(response.response);
    } catch (error) {
        console.error('Chat error:', error);
        addMessage('system', `⚠️ ${error.message}`);
        updateVoiceStatus('listening');
    }

    processingRef = false;
}

// ===== TTS (Browser-based for extension) =====
function speakText(text) {
    if (!text || !window.speechSynthesis) return;

    pauseListening();
    updateVoiceStatus('speaking');

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 1.0;

    // Try to pick a voice
    const voices = window.speechSynthesis.getVoices();
    const persona = state.personas.find(p => p.id === state.selectedPersona);
    if (persona) {
        const preferred = state.selectedPersona === 'priya' ? 'female' :
            state.selectedPersona === 'grandma' ? 'female' : 'male';
        const voice = voices.find(v => v.lang.startsWith('en') &&
            v.name.toLowerCase().includes(preferred));
        if (voice) utterance.voice = voice;
    }

    utterance.onend = () => {
        updateVoiceStatus('listening');
        setTimeout(() => resumeListening(), 300);
    };

    window.speechSynthesis.speak(utterance);
}

// ===== UI HELPERS =====
function addMessage(role, content) {
    state.messages.push({ role, content, timestamp: Date.now() });

    const box = document.getElementById('transcriptBox');
    const persona = state.personas.find(p => p.id === state.selectedPersona);
    const labels = {
        user: '🔴 Scammer',
        assistant: `🟢 ${persona?.name || 'AI'}`,
        system: '⚠️ System'
    };

    const div = document.createElement('div');
    div.className = `message ${role}`;
    div.innerHTML = `<span class="msg-label">${labels[role]}</span><p>${content}</p>`;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
}

function updateVoiceStatus(status) {
    const el = document.getElementById('statusInner');
    const persona = state.personas.find(p => p.id === state.selectedPersona);

    if (status === 'speaking') {
        el.className = 'status speaking';
        el.innerHTML = `<div class="wave-bars"><span></span><span></span><span></span><span></span><span></span></div>
            <span>${persona?.name || 'AI'} is speaking...</span>`;
    } else if (status === 'listening') {
        el.className = 'status listening';
        el.innerHTML = `<span class="pulse-dot"></span> 🎙️ Listening...`;
    } else {
        el.className = 'status waiting';
        el.innerHTML = 'Processing...';
    }
}

function showInterim(text) {
    const el = document.getElementById('statusInner');
    if (el.className.includes('listening') && text) {
        el.innerHTML = `<span class="pulse-dot"></span> 🎙️ Listening...<p class="interim">${text}</p>`;
    }
}

function updateScamBadge() {
    const badge = document.getElementById('scamBadge');
    if (state.scamType && state.scamType !== 'Unknown') {
        badge.textContent = `🎯 ${state.scamType}`;
        badge.style.display = 'inline-block';
    }
}

function updateEscalationBadge() {
    const badge = document.getElementById('escalationBadge');
    const colors = { cooperative: '#10b981', curious: '#f59e0b', probing: '#f97316', bold: '#ef4444' };
    badge.textContent = state.escalationLevel.toUpperCase();
    badge.style.color = colors[state.escalationLevel] || '#94a3b8';
}

function renderIntel() {
    const data = state.extractedData;
    const fields = [
        ['names', '👤 Names'], ['phoneNumbers', '📞 Phone'],
        ['upiIds', '💳 UPI'], ['bankAccounts', '🏦 Accounts'],
        ['bankNames', '🏛️ Banks'], ['claimedOrganization', '🏢 Org'],
        ['employeeId', '🪪 Emp ID'], ['caseNumber', '📋 Case #'],
        ['locations', '📍 Location'], ['amounts', '💰 Amounts'],
        ['links', '🔗 URLs']
    ];

    let count = 0;
    let html = '';

    fields.forEach(([key, label]) => {
        const val = data[key];
        if (val && val.length > 0) {
            count += val.length;
            html += `<div class="intel-item"><span class="intel-label">${label}</span>
                <span class="intel-value">${val.join(', ')}</span></div>`;
        }
    });

    if (data.tactics?.length > 0) {
        count += data.tactics.length;
        html += `<div class="intel-item full-width"><span class="intel-label">⚠️ Tactics</span>
            <span class="intel-value">${data.tactics.join(', ')}</span></div>`;
    }

    if (data.suspiciousKeywords?.length > 0) {
        count += data.suspiciousKeywords.length;
        html += `<div class="intel-item full-width"><span class="intel-label">🚩 Keywords</span>
            <div class="keyword-tags">${data.suspiciousKeywords.map(k =>
            `<span class="keyword-tag">${k}</span>`).join('')}</div></div>`;
    }

    if (count > 0) {
        document.getElementById('intelPanel').style.display = 'block';
        document.getElementById('intelCount').textContent = count;
        document.getElementById('intelGrid').innerHTML = html;
    }
}

// ===== SESSION HISTORY =====
function toggleHistory() {
    const panel = document.getElementById('historyPanel');
    if (panel.style.display === 'none') {
        panel.style.display = 'block';
        let html = '<h3>📜 Past Sessions</h3>';
        if (state.pastSessions.length === 0) {
            html += '<p style="color:#64748b;font-size:0.75rem;text-align:center">No sessions yet</p>';
        } else {
            state.pastSessions.slice().reverse().forEach(s => {
                html += `<div class="history-item">
                    <div class="history-item-header">
                        <span>${s.persona}</span>
                        <span class="scam-badge-sm">${s.scamType || 'Unknown'}</span>
                    </div>
                    <div class="history-item-detail">${formatTime(s.duration)} · ${new Date(s.startTime).toLocaleDateString()}</div>
                </div>`;
            });
        }
        panel.innerHTML = html;
    } else {
        panel.style.display = 'none';
    }
}

// ===== REPORT EXPORT =====
function exportReport() {
    const persona = state.personas.find(p => p.id === state.selectedPersona);
    let r = `═══════════════════════════════════════\n`;
    r += `   🍯 AI HONEYPOT — SCAM INTEL REPORT\n`;
    r += `═══════════════════════════════════════\n\n`;
    r += `Date: ${new Date().toLocaleString()}\n`;
    r += `Persona: ${persona?.emoji || ''} ${persona?.name || state.selectedPersona}\n`;
    r += `Duration: ${formatTime(state.callDuration)}\n`;
    r += `Scam Type: ${state.scamType}\n`;
    r += `Escalation: ${state.escalationLevel}\n\n`;

    r += `───── EXTRACTED DATA ─────\n\n`;
    const fields = [
        ['names', '👤 Names'], ['phoneNumbers', '📞 Phone'], ['upiIds', '💳 UPI'],
        ['bankAccounts', '🏦 Accounts'], ['bankNames', '🏛️ Banks'],
        ['claimedOrganization', '🏢 Org'], ['employeeId', '🪪 Employee ID'],
        ['caseNumber', '📋 Case #'], ['locations', '📍 Location'],
        ['amounts', '💰 Amounts'], ['links', '🔗 URLs'],
        ['tactics', '⚠️ Tactics'], ['suspiciousKeywords', '🚩 Keywords']
    ];
    fields.forEach(([key, label]) => {
        const val = state.extractedData[key];
        if (val?.length > 0) {
            r += `${label}:\n`;
            val.forEach(v => { r += `  • ${v}\n`; });
            r += '\n';
        }
    });

    r += `───── TRANSCRIPT ─────\n\n`;
    state.messages.forEach(m => {
        const who = m.role === 'user' ? '🔴 SCAMMER' : '🟢 AI';
        r += `[${new Date(m.timestamp).toLocaleTimeString()}] ${who}:\n${m.content}\n\n`;
    });
    r += `═══════════════════════════════════════\nGenerated by Shining Zenith AI Honeypot V3\n`;

    navigator.clipboard.writeText(r).then(() => {
        alert('📋 Report copied to clipboard!');
    }).catch(() => {
        // Fallback download
        const blob = new Blob([r], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `honeypot-report-${state.sessionId}.txt`;
        a.click(); URL.revokeObjectURL(url);
    });
}

function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}
