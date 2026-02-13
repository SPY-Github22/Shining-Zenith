// ===== AI Honeypot Extension - Popup Logic =====
// Vanilla JS equivalent of ActiveCall.jsx + useVoice.js

// --- Persona data ---
const PERSONAS = {
    grandma: { id: 'grandma', name: 'Margaret', age: 68, emoji: '👵', description: 'Retired Teacher' },
    grandpa: { id: 'grandpa', name: 'Harold', age: 72, emoji: '👴', description: 'Retired Engineer' }
};

// --- State ---
let selectedPersona = 'grandma';
let sessionId = 'session_' + Date.now();
let messages = [];
let extractedData = {
    names: [], phoneNumbers: [], upiIds: [], bankAccounts: [],
    bankNames: [], links: [], suspiciousKeywords: [],
    claimedOrganization: [], employeeId: [], caseNumber: []
};
let isActive = false;
let isProcessing = false;

// --- Voice state ---
let recognition = null;
let synth = null;
let isListening = false;
let isSpeaking = false;
let transcript = '';
let interimTranscript = '';
let lastProcessed = '';
let lastTranscript = '';
let silenceTimeout = null;
const SILENCE_DURATION = 2500;

// --- DOM refs ---
const $ = (sel) => document.querySelector(sel);
const statusIndicator = $('#statusIndicator');
const apiWarning = $('#apiWarning');
const openOptionsLink = $('#openOptionsLink');
const personaSelector = $('#personaSelector');
const personaAvatar = $('#personaAvatar');
const personaNameDisplay = $('#personaNameDisplay');
const personaDescDisplay = $('#personaDescDisplay');
const startBtn = $('#startBtn');
const stopBtn = $('#stopBtn');
const interruptBtn = $('#interruptBtn');
const voiceStatus = $('#voiceStatus');
const voiceIndicator = $('#voiceIndicator');
const statusText = $('#statusText');
const liveTranscriptEl = $('#liveTranscript');
const liveTranscriptText = $('#liveTranscriptText');
const messagesContainer = $('#messagesContainer');
const capturedGrid = $('#capturedGrid');
const keywordTags = $('#keywordTags');

// ===== Init =====
(async function init() {
    // Check API key
    chrome.runtime.sendMessage({ type: 'CHECK_API_KEY' }, (res) => {
        if (!res?.hasKey) {
            apiWarning.style.display = 'block';
        }
    });

    // Setup speech
    setupSpeech();

    // Bind events
    bindEvents();
})();

// ===== Speech Setup (ported from useVoice.js) =====
function setupSpeech() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    synth = window.speechSynthesis;

    if (!SpeechRecognition || !synth) {
        startBtn.disabled = true;
        startBtn.innerHTML = '<span class="btn-icon">⚠️</span><span>Voice Not Supported</span>';
        return;
    }

    synth.getVoices();

    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
        console.log('🎤 Speech recognition started');
    };

    recognition.onresult = (event) => {
        // Ignore results while speaking
        if (isSpeaking) {
            console.log('🔇 Ignoring input while speaking');
            return;
        }

        let interim = '';
        let final = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            const text = result[0].transcript;
            if (result.isFinal) {
                final += text + ' ';
                console.log('✅ Final transcript:', text);
            } else {
                interim += text;
            }
        }

        if (final) {
            transcript += final;
        }
        interimTranscript = interim;

        updateVoiceUI();
        checkSilence();
    };

    recognition.onerror = (event) => {
        console.error('❌ Speech recognition error:', event.error);
        if ((event.error === 'no-speech' || event.error === 'aborted') && isListening && !isSpeaking) {
            setTimeout(() => { try { recognition.start(); } catch (e) { } }, 100);
        }
    };

    recognition.onend = () => {
        console.log('🔇 Speech recognition ended');
        if (isListening && !isSpeaking) {
            setTimeout(() => { try { recognition.start(); } catch (e) { } }, 100);
        }
    };
}

// ===== Silence Detection (ported from ActiveCall.jsx) =====
function checkSilence() {
    if (silenceTimeout) {
        clearTimeout(silenceTimeout);
        silenceTimeout = null;
    }

    if (!isActive || isProcessing || isSpeaking) return;

    const currentTranscript = (transcript + ' ' + interimTranscript).trim();
    if (currentTranscript !== lastTranscript) {
        lastTranscript = currentTranscript;
    }

    const finalTranscript = transcript.trim();
    if (finalTranscript && finalTranscript !== lastProcessed && finalTranscript.length > 2) {
        silenceTimeout = setTimeout(() => {
            const stillSame = transcript.trim() === finalTranscript;
            const noInterim = !interimTranscript || interimTranscript.trim().length === 0;

            if (stillSame && noInterim && finalTranscript !== lastProcessed) {
                handleUserMessage(finalTranscript);
                lastProcessed = finalTranscript;
            }
        }, SILENCE_DURATION);
    }
}

// ===== Voice Controls =====
function startListeningVoice() {
    if (recognition && !isListening) {
        transcript = '';
        interimTranscript = '';
        isListening = true;
        try { recognition.start(); } catch (e) { }
    }
}

function stopListeningVoice() {
    isListening = false;
    if (recognition) {
        try { recognition.stop(); } catch (e) { }
    }
}

function pauseListening() {
    if (recognition && isListening) {
        try { recognition.stop(); console.log('⏸️ Paused listening'); } catch (e) { }
    }
}

function resumeListening() {
    if (recognition && isListening && !isSpeaking) {
        interimTranscript = '';
        try { recognition.start(); console.log('▶️ Resumed listening'); } catch (e) {
            if (!e.message?.includes('already started')) console.log('Could not resume:', e);
        }
    }
}

function clearTranscript() {
    transcript = '';
    interimTranscript = '';
}

function speakText(text, onEnd, persona = 'grandma') {
    if (!synth) return;
    synth.cancel();
    pauseListening();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';

    const voices = synth.getVoices();
    if (persona === 'grandpa') {
        utterance.rate = 0.85;
        utterance.pitch = 0.8;
        const maleVoice = voices.find(v =>
            v.name.includes('Male') || v.name.includes('David') ||
            v.name.includes('Mark') || v.name.includes('Daniel')
        );
        if (maleVoice) utterance.voice = maleVoice;
    } else {
        utterance.rate = 0.9;
        utterance.pitch = 1.1;
        const femaleVoice = voices.find(v =>
            v.name.includes('Female') || v.name.includes('Samantha') ||
            v.name.includes('Zira') || v.name.includes('Susan')
        );
        if (femaleVoice) utterance.voice = femaleVoice;
    }

    utterance.onstart = () => {
        isSpeaking = true;
        updateVoiceUI();
    };

    utterance.onend = () => {
        isSpeaking = false;
        setTimeout(() => {
            resumeListening();
            updateVoiceUI();
            if (onEnd) onEnd();
        }, 300);
    };

    utterance.onerror = () => {
        isSpeaking = false;
        resumeListening();
        updateVoiceUI();
    };

    synth.speak(utterance);
}

function stopSpeakingVoice() {
    if (synth) {
        synth.cancel();
        isSpeaking = false;
        interimTranscript = '';
        resumeListening();
        updateVoiceUI();
    }
}

// ===== Chat Logic (ported from ActiveCall.jsx) =====
async function handleUserMessage(text) {
    isProcessing = true;
    updateVoiceUI();

    const userMsg = { role: 'user', content: text, timestamp: Date.now() };
    messages.push(userMsg);
    renderMessages();
    clearTranscript();
    lastTranscript = '';

    try {
        const data = await chrome.runtime.sendMessage({
            type: 'CHAT',
            sessionId,
            message: text,
            persona: selectedPersona,
            gatheredInfo: extractedData
        });

        if (data.error) {
            const errMsg = { role: 'system', content: data.error, timestamp: Date.now() };
            messages.push(errMsg);
            renderMessages();
            isProcessing = false;
            updateVoiceUI();
            return;
        }

        const aiMsg = { role: 'assistant', content: data.response, timestamp: Date.now() };
        messages.push(aiMsg);
        renderMessages();

        if (data.extractedInfo) {
            mergeExtractedData(data.extractedInfo);
            renderIntelligence();
        }

        speakText(data.response, () => {
            isProcessing = false;
            lastProcessed = '';
            updateVoiceUI();
        }, selectedPersona);

    } catch (error) {
        console.error('Error sending message:', error);
        const errorMsg = { role: 'system', content: 'Connection error. Check if API key is configured.', timestamp: Date.now() };
        messages.push(errorMsg);
        renderMessages();
        isProcessing = false;
        updateVoiceUI();
    }
}

function mergeExtractedData(info) {
    const fields = ['names', 'phoneNumbers', 'upiIds', 'bankAccounts', 'bankNames',
        'links', 'suspiciousKeywords', 'claimedOrganization', 'employeeId', 'caseNumber'];
    fields.forEach(field => {
        extractedData[field] = [...new Set([...extractedData[field], ...(info[field] || [])])];
    });
}

// ===== Honeypot Controls =====
function startHoneypot() {
    isActive = true;
    lastProcessed = '';
    lastTranscript = '';
    startListeningVoice();

    const persona = PERSONAS[selectedPersona];
    const greeting = selectedPersona === 'grandpa' ? "Hello? Who's calling?" : "Hello? Who is this?";
    messages = [{ role: 'assistant', content: greeting, timestamp: Date.now() }];
    renderMessages();
    speakText(greeting, () => { }, selectedPersona);

    // Update UI
    personaSelector.style.display = 'none';
    startBtn.style.display = 'none';
    stopBtn.style.display = 'flex';
    voiceStatus.style.display = 'flex';
    statusIndicator.style.display = 'flex';
    apiWarning.style.display = 'none';
    updateVoiceUI();
}

function stopHoneypot() {
    isActive = false;
    isProcessing = false;
    stopListeningVoice();
    stopSpeakingVoice();
    if (silenceTimeout) clearTimeout(silenceTimeout);

    // Update UI
    personaSelector.style.display = 'block';
    startBtn.style.display = 'flex';
    stopBtn.style.display = 'none';
    interruptBtn.style.display = 'none';
    voiceStatus.style.display = 'none';
    statusIndicator.style.display = 'none';
}

function handleInterrupt() {
    stopSpeakingVoice();
    isProcessing = false;
    lastProcessed = transcript.trim();
    updateVoiceUI();
}

// ===== UI Rendering =====
function updateVoiceUI() {
    // Voice indicator classes
    voiceIndicator.className = 'voice-indicator';
    if (isListening && !isSpeaking) voiceIndicator.classList.add('listening');
    if (isSpeaking) voiceIndicator.classList.add('speaking');

    // Status text
    const persona = PERSONAS[selectedPersona];
    if (isProcessing) {
        statusText.textContent = '⏳ Thinking...';
    } else if (isSpeaking) {
        statusText.textContent = `🗣️ ${persona.name} is speaking...`;
    } else if (isListening) {
        statusText.textContent = '👂 Listening...';
    } else {
        statusText.textContent = '⏸️ Idle';
    }

    // Interrupt button
    interruptBtn.style.display = isSpeaking ? 'flex' : 'none';

    // Live transcript
    const displayText = (transcript + ' ' + interimTranscript).trim();
    if (displayText && !isSpeaking && isActive) {
        liveTranscriptEl.style.display = 'block';
        liveTranscriptText.textContent = displayText;
    } else {
        liveTranscriptEl.style.display = 'none';
    }
}

function renderMessages() {
    const persona = PERSONAS[selectedPersona];
    messagesContainer.innerHTML = messages.map(msg => {
        let label = '';
        if (msg.role === 'user') label = '🎭 Scammer';
        else if (msg.role === 'assistant') label = `${persona.emoji} ${persona.name}`;
        else label = '⚙️ System';

        return `<div class="message ${msg.role}">
      <span class="message-label">${label}:</span>
      <span class="message-content">${escapeHtml(msg.content)}</span>
    </div>`;
    }).join('');

    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function renderIntelligence() {
    const hasInfo = extractedData.names.length > 0 ||
        extractedData.phoneNumbers.length > 0 ||
        extractedData.upiIds.length > 0 ||
        extractedData.bankAccounts.length > 0 ||
        extractedData.bankNames.length > 0 ||
        extractedData.claimedOrganization.length > 0 ||
        extractedData.employeeId.length > 0 ||
        extractedData.caseNumber.length > 0;

    if (!hasInfo) {
        capturedGrid.innerHTML = '<p class="empty-state">No scammer information captured yet. Keep them talking!</p>';
    } else {
        let html = '';
        const items = [
            ['👤 Name:', extractedData.names, ''],
            ['📞 Phone:', extractedData.phoneNumbers, ''],
            ['🏢 Claimed Org:', extractedData.claimedOrganization, ''],
            ['🪪 Employee ID:', extractedData.employeeId, ''],
            ['📋 Case/Ref #:', extractedData.caseNumber, ''],
            ['🏦 Bank:', extractedData.bankNames, ''],
            ['💳 Account:', extractedData.bankAccounts, 'danger'],
            ['💸 UPI ID:', extractedData.upiIds, 'danger'],
            ['🔗 Link:', extractedData.links, 'warning'],
        ];
        items.forEach(([label, values, cls]) => {
            if (values.length > 0) {
                html += `<div class="captured-item">
          <span class="captured-label">${label}</span>
          <span class="captured-value ${cls}">${escapeHtml(values.join(', '))}</span>
        </div>`;
            }
        });
        capturedGrid.innerHTML = html;
    }

    // Keywords
    if (extractedData.suspiciousKeywords.length > 0) {
        keywordTags.innerHTML = extractedData.suspiciousKeywords
            .map(k => `<span class="keyword-tag">${escapeHtml(k)}</span>`).join('');
    } else {
        keywordTags.innerHTML = '<p class="empty-state">No keywords detected yet</p>';
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ===== Event Binding =====
function bindEvents() {
    // Persona selection
    document.querySelectorAll('.persona-option').forEach(btn => {
        btn.addEventListener('click', () => {
            selectedPersona = btn.dataset.persona;
            document.querySelectorAll('.persona-option').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            updatePersonaCard();
        });
    });

    // Controls
    startBtn.addEventListener('click', startHoneypot);
    stopBtn.addEventListener('click', stopHoneypot);
    interruptBtn.addEventListener('click', handleInterrupt);

    // Options link
    openOptionsLink.addEventListener('click', (e) => {
        e.preventDefault();
        chrome.runtime.openOptionsPage();
    });
}

function updatePersonaCard() {
    const p = PERSONAS[selectedPersona];
    personaAvatar.textContent = p.emoji;
    personaNameDisplay.textContent = p.name;
    personaDescDisplay.textContent = `${p.age} years old · ${p.description}`;
}
