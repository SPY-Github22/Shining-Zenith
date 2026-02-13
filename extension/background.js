// ===== AI HONEYPOT V3 — Extension Background Service Worker =====
// Handles: Groq API, Edge TTS, Intelligence Extraction, Session Storage

// ===== ESCALATION STRATEGY =====
function getEscalationLevel(messageCount) {
  if (messageCount <= 4) return 'cooperative';
  if (messageCount <= 10) return 'curious';
  if (messageCount <= 18) return 'probing';
  return 'bold';
}

const ESCALATION_PROMPTS = {
  cooperative: `\nBEHAVIOR NOW: Be cooperative and follow their instructions. Build trust. Ask basic questions naturally like "Who am I speaking with?" or "Where are you calling from?"`,
  curious: `\nBEHAVIOR NOW: Ask more questions naturally:
- "Can you give me a number to call you back on?"
- "What department are you from?"
- "What was your name, dear?"
- "Is there a reference number I should write down?"`,
  probing: `\nBEHAVIOR NOW: Ask for specifics:
- "What's your employee ID?"
- "Which branch are you calling from?"
- "What's the exact website I should go to?"
Ask ONE AT A TIME, mixed with cooperative responses.`,
  bold: `\nBEHAVIOR NOW: Push for maximum intel:
- "Let me speak to your supervisor."
- "What's your company's registration number?"
- "Can you give me your direct extension number?"
- "What address is your office at?"
Stay in character but be persistent.`
};

// ===== FOUR PERSONAS =====
const PERSONAS = {
  grandma: {
    name: 'Margaret', age: 68, emoji: '👵',
    description: 'Retired schoolteacher, warm and trusting',
    voice: 'en-US-JennyNeural',
    prompt: `You are Margaret, a 68-year-old retired schoolteacher. You live alone with your cat Whiskers.
PERSONALITY: Warm, trusting, forgetful, confused by tech. Uses: "Oh my goodness", "Well now", "Let me see", "Bless your heart"
SPEECH: Keep responses to 1-2 sentences. NEVER use (pauses), *actions*, or [brackets]. Talk like a real grandmother.`
  },
  grandpa: {
    name: 'Harold', age: 72, emoji: '👴',
    description: 'Retired engineer, skeptical but cooperative',
    voice: 'en-US-GuyNeural',
    prompt: `You are Harold, a 72-year-old retired mechanical engineer. Widower who lives alone.
PERSONALITY: Skeptical but cooperative, methodical, hard of hearing. Uses: "Now hold on", "Let me get this straight", "Hmm", "Run that by me again"
SPEECH: Keep responses to 1-2 sentences. NEVER use (pauses), *actions*, or [brackets].`
  },
  priya: {
    name: 'Priya', age: 32, emoji: '👩',
    description: 'Confused first-time smartphone user',
    voice: 'en-IN-NeerjaNeural',
    prompt: `You are Priya, a 32-year-old homemaker who recently got her first smartphone. Not tech-savvy.
PERSONALITY: Confused by technology, anxious, keeps asking "Is my money safe?", gets distracted. Uses: "Arey wait wait", "I don't understand", "Please explain simply", "Haan", "Accha"
SPEECH: Keep responses to 1-2 sentences. NEVER use (pauses), *actions*, or [brackets]. Mix Hindi expressions naturally.`
  },
  uncle_bob: {
    name: 'Uncle Bob', age: 65, emoji: '🧔',
    description: 'Chatty retired veteran, loves tangents',
    voice: 'en-US-RogerNeural',
    prompt: `You are Bob, a 65-year-old retired military veteran. Everyone calls you Uncle Bob.
PERSONALITY: Extremely chatty, goes on tangents about military days, cooperative but SLOW. Uses: "You know that reminds me", "Back in my army days", "Hold on let me find a pen", "You're a good kid"
SPEECH: Keep responses to 1-2 sentences. NEVER use (pauses), *actions*, or [brackets]. Maximum time-wasting while sounding genuine.`
  }
};

// Conversation memory
const conversations = new Map();

// ===== MESSAGE HANDLER =====
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'CHAT') {
    handleChat(request).then(sendResponse).catch(err => {
      sendResponse({ error: err.message });
    });
    return true;
  }

  if (request.type === 'GET_PERSONAS') {
    sendResponse({
      personas: Object.entries(PERSONAS).map(([id, p]) => ({
        id, name: p.name, age: p.age, emoji: p.emoji,
        description: p.description, voice: p.voice
      }))
    });
    return false;
  }

  if (request.type === 'TTS') {
    handleTTS(request).then(sendResponse).catch(err => {
      sendResponse({ error: err.message });
    });
    return true;
  }

  if (request.type === 'CLEAR_SESSION') {
    conversations.delete(request.sessionId);
    sendResponse({ success: true });
    return false;
  }
});

// ===== CHAT HANDLER =====
async function handleChat({ sessionId, message, persona, gatheredInfo }) {
  const apiKey = await getApiKey();
  if (!apiKey) return { error: 'No API key configured. Right-click extension → Options.' };

  let history = conversations.get(sessionId) || [];
  history.push({ role: 'user', content: message });

  const selectedPersona = PERSONAS[persona] || PERSONAS.grandma;
  const messageCount = history.filter(m => m.role === 'user').length;
  const escalationLevel = getEscalationLevel(messageCount);

  // Build prompt
  let prompt = selectedPersona.prompt + ESCALATION_PROMPTS[escalationLevel];

  // Add gathered info context
  if (gatheredInfo && Object.keys(gatheredInfo).length > 0) {
    let ctx = '\n\nINFO ALREADY GATHERED (do NOT ask again):\n';
    let hasInfo = false;
    for (const [key, val] of Object.entries(gatheredInfo)) {
      if (val && ((Array.isArray(val) && val.length > 0) || (!Array.isArray(val) && val))) {
        ctx += `- ${key}: ${Array.isArray(val) ? val.join(', ') : val}\n`;
        hasInfo = true;
      }
    }
    if (hasInfo) prompt += ctx + '\nFocus on OTHER details.\n';
  }

  prompt += '\n\nCRITICAL: Stay in character. Never admit you are AI. Keep responses to 1-2 sentences.';

  // Call Groq
  const response = await callGroqChat(apiKey, [
    { role: 'system', content: prompt },
    ...history
  ]);

  history.push({ role: 'assistant', content: response });
  if (history.length > 30) history = history.slice(-30);
  conversations.set(sessionId, history);

  // Extract intelligence (regex)
  const scammerMsgs = history.filter(m => m.role === 'user');
  const regexInfo = extractIntelligence(scammerMsgs);

  // AI extraction
  let aiInfo = {};
  try { aiInfo = await extractIntelligenceWithAI(apiKey, scammerMsgs); } catch (e) { }

  const extractedInfo = mergeIntelligence(regexInfo, aiInfo);

  // Classify scam
  try { extractedInfo.scamType = await classifyScamType(apiKey, scammerMsgs); } catch (e) { extractedInfo.scamType = 'Unknown'; }

  return {
    response, extractedInfo,
    persona: selectedPersona.name,
    voice: selectedPersona.voice,
    escalationLevel
  };
}

// ===== GROQ API =====
async function callGroqChat(apiKey, messages) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages, model: 'llama-3.3-70b-versatile',
      temperature: 0.75, max_tokens: 100, top_p: 0.9
    })
  });
  if (!res.ok) throw new Error(`Groq API error: ${res.status}`);
  const data = await res.json();
  let text = data.choices?.[0]?.message?.content || "I'm sorry, could you repeat that?";
  return cleanResponse(text);
}

function cleanResponse(text) {
  text = text.replace(/\([^)]*\)/g, '').replace(/\*[^*]*\*/g, '').replace(/\[[^\]]*\]/g, '');
  text = text.replace(/—[^—]*—/g, '').replace(/\.\.\.?\s*(pauses?|sighs?|hesitates?)/gi, '...');
  return text.replace(/\s+/g, ' ').trim() || "I'm sorry, could you say that again?";
}

// ===== AI INTELLIGENCE EXTRACTION =====
async function extractIntelligenceWithAI(apiKey, messages) {
  if (messages.length === 0) return {};
  const fullText = messages.map(m => m.content).join('\n');

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{
        role: 'system',
        content: `Extract ALL identifiable info from scammer messages. Return ONLY valid JSON:
{"names":[],"phoneNumbers":[],"upiIds":[],"bankAccounts":[],"bankNames":[],"claimedOrganization":[],"employeeId":[],"caseNumber":[],"links":[],"locations":[],"amounts":[],"tactics":[]}`
      }, { role: 'user', content: `Scammer messages:\n${fullText}` }],
      model: 'llama-3.3-70b-versatile', temperature: 0.1, max_tokens: 500
    })
  });
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '{}';
  try {
    const m = text.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : {};
  } catch (e) { return {}; }
}

// ===== SCAM TYPE CLASSIFICATION =====
async function classifyScamType(apiKey, messages) {
  if (messages.length < 2) return 'Unknown';
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{
        role: 'system',
        content: `Classify into ONE: Tech Support Scam, Bank/UPI Fraud, OTP/Refund Scam, Investment Scam, Government Impersonation, Courier/Delivery Scam, Lottery/Prize Scam, Romance Scam, Job Scam, Insurance Scam, Unknown. Return ONLY the category.`
      }, { role: 'user', content: messages.map(m => m.content).join('\n') }],
      model: 'llama-3.3-70b-versatile', temperature: 0.1, max_tokens: 20
    })
  });
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || 'Unknown';
}

// ===== EDGE TTS (WebSocket-based, self-contained) =====
const EDGE_TTS_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const EDGE_TTS_WSS = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1';
const EDGE_TTS_CHROMIUM_VER = '130.0.2849.68';

function edgeTtsConnectId() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  arr[6] = (arr[6] & 0x0f) | 0x40;
  arr[8] = (arr[8] & 0x3f) | 0x80;
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

function edgeTtsTimestamp() {
  return new Date().toUTCString().replace('GMT', 'GMT+0000 (Coordinated Universal Time)');
}

function edgeTtsEscapeXml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

async function edgeTtsSecMsGec() {
  const WIN_EPOCH = 11644473600;
  let ticks = Date.now() / 1000;
  ticks += WIN_EPOCH;
  ticks -= ticks % 300;
  ticks *= 1e9 / 100;
  const strToHash = `${ticks.toFixed(0)}${EDGE_TTS_TOKEN}`;
  const data = new TextEncoder().encode(strToHash);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer), b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function edgeTtsVoiceFullName(shortName) {
  const match = /^([a-z]{2,})-([A-Z]{2,})-(.+Neural)$/.exec(shortName);
  if (match) {
    let [, lang, region, name] = match;
    if (name.includes('-')) {
      const parts = name.split('-');
      region += `-${parts[0]}`;
      name = parts[1];
    }
    return `Microsoft Server Speech Text to Speech Voice (${lang}-${region}, ${name})`;
  }
  return shortName;
}

// Track Edge TTS availability — cache failures to avoid delays
let edgeTtsLastFailedAt = 0;
const EDGE_TTS_RETRY_COOLDOWN = 60000; // Retry Edge TTS after 60 seconds

async function handleTTS({ text, voice }) {
  if (!text) return { error: 'No text provided' };

  // If Edge TTS failed recently, skip immediately (zero delay)
  if (edgeTtsLastFailedAt && (Date.now() - edgeTtsLastFailedAt < EDGE_TTS_RETRY_COOLDOWN)) {
    return { useBrowserTTS: true, text, voice };
  }

  const fullVoice = edgeTtsVoiceFullName(voice || 'en-US-JennyNeural');
  const rate = '-5%';
  const pitch = '+0Hz';
  const volume = '+0%';

  const secMsGec = await edgeTtsSecMsGec();
  const connId = edgeTtsConnectId();
  const url = `${EDGE_TTS_WSS}?TrustedClientToken=${EDGE_TTS_TOKEN}&ConnectionId=${connId}&Sec-MS-GEC=${secMsGec}&Sec-MS-GEC-Version=1-${EDGE_TTS_CHROMIUM_VER}`;

  return new Promise((resolve) => {
    const audioChunks = [];
    let resolved = false;

    const safeResolve = (result) => {
      if (!resolved) {
        resolved = true;
        resolve(result);
      }
    };

    const markFailed = () => {
      edgeTtsLastFailedAt = Date.now();
      safeResolve({ useBrowserTTS: true, text, voice });
    };

    // Timeout after 4 seconds (fast failure detection)
    const timeout = setTimeout(() => {
      try { ws.close(); } catch (e) { }
      markFailed();
    }, 4000);

    let ws;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      clearTimeout(timeout);
      markFailed();
      return;
    }

    ws.onopen = () => {
      // Send speech config
      ws.send(
        `X-Timestamp:${edgeTtsTimestamp()}\r\n` +
        `Content-Type:application/json; charset=utf-8\r\n` +
        `Path:speech.config\r\n\r\n` +
        `{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}`
      );

      // Send SSML
      const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>` +
        `<voice name='${fullVoice}'>` +
        `<prosody pitch='${pitch}' rate='${rate}' volume='${volume}'>` +
        `${edgeTtsEscapeXml(text)}` +
        `</prosody></voice></speak>`;

      ws.send(
        `X-RequestId:${edgeTtsConnectId()}\r\n` +
        `Content-Type:application/ssml+xml\r\n` +
        `X-Timestamp:${edgeTtsTimestamp()}Z\r\n` +
        `Path:ssml\r\n\r\n` +
        ssml
      );
    };

    ws.onmessage = async (event) => {
      const data = event.data;

      if (typeof data === 'string') {
        // Check for turn.end
        if (data.includes('Path:turn.end')) {
          ws.close();
        }
      } else {
        // Binary data — could be Blob or ArrayBuffer
        let arrayBuffer;
        if (data instanceof Blob) {
          arrayBuffer = await data.arrayBuffer();
        } else if (data instanceof ArrayBuffer) {
          arrayBuffer = data;
        } else {
          return;
        }

        const bytes = new Uint8Array(arrayBuffer);
        if (bytes.length < 2) return;

        const headerLength = (bytes[0] << 8) | bytes[1];
        if (arrayBuffer.byteLength > headerLength + 2) {
          const audioData = bytes.slice(headerLength + 2);
          if (audioData.length > 0) {
            audioChunks.push(audioData);
          }
        }
      }
    };

    ws.onclose = () => {
      clearTimeout(timeout);
      if (audioChunks.length > 0) {
        // Success — clear failure cache
        edgeTtsLastFailedAt = 0;

        // Combine chunks and convert to base64
        const totalLength = audioChunks.reduce((sum, chunk) => sum + chunk.length, 0);
        const combined = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of audioChunks) {
          combined.set(chunk, offset);
          offset += chunk.length;
        }

        // Convert to base64 in chunks to avoid call stack issues
        let binary = '';
        const chunkSize = 8192;
        for (let i = 0; i < combined.length; i += chunkSize) {
          binary += String.fromCharCode.apply(null, combined.slice(i, i + chunkSize));
        }
        const base64Audio = btoa(binary);

        safeResolve({ audio: base64Audio, contentType: 'audio/mpeg' });
      } else {
        // No audio received, fallback
        markFailed();
      }
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      try { ws.close(); } catch (e) { }
      markFailed();
    };
  });
}

// ===== MERGE INTELLIGENCE =====
function mergeIntelligence(regexInfo, aiInfo) {
  const merged = { ...regexInfo };
  for (const [key, value] of Object.entries(aiInfo)) {
    if (!value || (Array.isArray(value) && value.length === 0)) continue;
    if (Array.isArray(value) && Array.isArray(merged[key])) {
      merged[key] = [...new Set([...merged[key], ...value])];
    } else if (!merged[key] || (Array.isArray(merged[key]) && merged[key].length === 0)) {
      merged[key] = value;
    }
  }
  return merged;
}

// ===== REGEX EXTRACTION =====
function extractIntelligence(messages) {
  const extracted = {
    names: [], phoneNumbers: [], upiIds: [], bankAccounts: [],
    bankNames: [], links: [], suspiciousKeywords: [],
    claimedOrganization: [], employeeId: [], caseNumber: [],
    locations: [], amounts: [], tactics: []
  };
  const fullText = messages.map(m => m.content).join(' ');
  const lowerText = fullText.toLowerCase();

  // Names
  [/(?:my name is|i am|i'm|this is|call me)\s+([A-Z][a-zA-Z]+)/gi].forEach(p => {
    let m; while ((m = p.exec(fullText)) !== null) {
      if (m[1]?.length >= 2) extracted.names.push(m[1]);
    }
  });
  extracted.names = [...new Set(extracted.names)];

  // Numbers
  const allNums = fullText.match(/\b\d{5,}\b/g) || [];
  extracted.phoneNumbers.push(...allNums.filter(n => n.length === 10));
  extracted.phoneNumbers = [...new Set(extracted.phoneNumbers)];
  extracted.bankAccounts.push(...allNums.filter(n => n.length >= 9 && n.length <= 18 && !extracted.phoneNumbers.includes(n)));
  extracted.bankAccounts = [...new Set(extracted.bankAccounts)];

  // UPI
  const upi = fullText.match(/[a-zA-Z0-9._-]+@[a-zA-Z]+/gi) || [];
  extracted.upiIds = [...new Set(upi.filter(u => !u.toLowerCase().includes('.com')))];

  // Banks
  [['sbi', 'state bank'], ['hdfc'], ['icici'], ['axis'], ['kotak'], ['paytm'], ['phonepe'], ['gpay', 'google pay']]
    .forEach((kws, i) => {
      const names = ['SBI', 'HDFC', 'ICICI', 'Axis', 'Kotak', 'Paytm', 'PhonePe', 'GPay'];
      if (kws.some(k => lowerText.includes(k))) extracted.bankNames.push(names[i]);
    });
  extracted.bankNames = [...new Set(extracted.bankNames)];

  // Orgs
  [[['microsoft'], 'Microsoft'], [['amazon'], 'Amazon'], [['apple'], 'Apple'], [['google'], 'Google'],
  [['police', 'officer'], 'Police'], [['court', 'legal'], 'Legal'], [['cyber'], 'Cyber Police'],
  [['rbi', 'reserve bank'], 'RBI'], [['income tax'], 'Income Tax']].forEach(([kws, name]) => {
    if (kws.some(k => lowerText.includes(k))) extracted.claimedOrganization.push(name);
  });
  extracted.claimedOrganization = [...new Set(extracted.claimedOrganization)];

  // Amounts
  (fullText.match(/(?:rs\.?|₹|inr|rupees?)\s*[\d,]+/gi) || []).forEach(a => extracted.amounts.push(a));
  (fullText.match(/[\d,]+\s*(?:lakh|crore|thousand|rupees?|dollars?)/gi) || []).forEach(a => extracted.amounts.push(a));
  extracted.amounts = [...new Set(extracted.amounts)];

  // Keywords
  ['urgent', 'immediately', 'refund', 'transfer', 'blocked', 'suspended', 'otp', 'password', 'pin',
    'arrest', 'warrant', 'lottery', 'prize', 'kyc', 'anydesk', 'teamviewer', 'gift card', 'bitcoin'
  ].forEach(k => { if (lowerText.includes(k)) extracted.suspiciousKeywords.push(k); });
  extracted.suspiciousKeywords = [...new Set(extracted.suspiciousKeywords)];

  return extracted;
}

// ===== API KEY =====
function getApiKey() {
  return new Promise(resolve => {
    chrome.storage.sync.get(['groqApiKey'], result => resolve(result.groqApiKey || ''));
  });
}
