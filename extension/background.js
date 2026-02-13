// ===== AI Honeypot - Background Service Worker =====
// Replaces the Node.js/Express server. Calls Groq API directly.

// --- Personas (ported from groqClient.js) ---
const PERSONAS = {
  grandma: {
    name: 'Margaret',
    age: 68,
    emoji: '👵',
    description: 'Retired schoolteacher',
    prompt: `You are Margaret, a 68-year-old retired schoolteacher. You live alone with your cat Whiskers.

PERSONALITY:
- Warm and trusting, sometimes forgetful
- Hard of hearing, need things repeated
- Confused by technical jargon
- Use phrases: "Oh my goodness", "Well now", "Let me see", "Oh my"

SPEECH STYLE:
- Keep responses SHORT (1-2 sentences max)
- NEVER use (pauses), *actions*, or [brackets]
- Respond naturally

QUESTIONS TO ASK (one at a time):
- Their name, callback number, company, employee ID, case numbers

Stay in character. Never admit you are AI.`
  },
  grandpa: {
    name: 'Harold',
    age: 72,
    emoji: '👴',
    description: 'Retired engineer',
    prompt: `You are Harold, a 72-year-old retired mechanical engineer. Widower who lives alone.

PERSONALITY:
- Skeptical but cooperative
- Hard of hearing
- Use phrases: "Now hold on", "Let me get this straight", "Hmm"

SPEECH STYLE:
- Keep responses SHORT (1-2 sentences max)
- NEVER use (pauses), *actions*, or [brackets]
- Respond naturally

QUESTIONS TO ASK (one at a time):
- Their name, callback number, organization, employee ID, case number

Stay in character. Never admit you are AI.`
  }
};

// --- In-memory conversation store ---
const conversations = new Map();

// --- Dynamic prompt builder ---
function buildDynamicPrompt(basePrompt, gatheredInfo) {
  let contextNote = '\n\nIMPORTANT - INFORMATION ALREADY GATHERED (do NOT ask for these again):\n';
  let hasInfo = false;

  if (gatheredInfo.names?.length > 0) {
    contextNote += `- Caller's name: ${gatheredInfo.names.join(', ')}\n`;
    hasInfo = true;
  }
  if (gatheredInfo.claimedOrganization?.length > 0) {
    contextNote += `- Their organization: ${gatheredInfo.claimedOrganization.join(', ')}\n`;
    hasInfo = true;
  }
  if (gatheredInfo.phoneNumbers?.length > 0) {
    contextNote += `- Their phone number: ${gatheredInfo.phoneNumbers.join(', ')}\n`;
    hasInfo = true;
  }
  if (gatheredInfo.employeeId?.length > 0) {
    contextNote += `- Their employee ID: ${gatheredInfo.employeeId.join(', ')}\n`;
    hasInfo = true;
  }
  if (gatheredInfo.caseNumber?.length > 0) {
    contextNote += `- Case/reference number: ${gatheredInfo.caseNumber.join(', ')}\n`;
    hasInfo = true;
  }

  if (hasInfo) {
    contextNote += '\nFocus on OTHER details. Vary your questions. Respond naturally.\n';
    return basePrompt + contextNote;
  }
  return basePrompt;
}

// --- Clean AI response ---
function cleanResponse(text) {
  text = text.replace(/\([^)]*\)/g, '');
  text = text.replace(/\*[^*]*\*/g, '');
  text = text.replace(/\[[^\]]*\]/g, '');
  text = text.replace(/—[^—]*—/g, '');
  text = text.replace(/\.\.\.?\s*(pauses?|sighs?|hesitates?|waits?|thinks?)/gi, '...');
  text = text.replace(/\s+/g, ' ');
  text = text.trim();
  if (!text) return "I'm sorry, could you say that again?";
  return text;
}

// --- Intelligence Extraction (ported from groqClient.js) ---
function extractIntelligence(messages) {
  const extracted = {
    names: [], phoneNumbers: [], upiIds: [], bankAccounts: [],
    bankNames: [], links: [], suspiciousKeywords: [],
    claimedOrganization: [], employeeId: [], caseNumber: []
  };

  const fullText = messages.map(m => m.content).join(' ');
  const lowerText = fullText.toLowerCase();

  // Names
  const namePatterns = [
    /(?:my name is|i am|i'm|this is|call me|it's|speaking)\s+([A-Z][a-zA-Z]+)/gi,
    /(?:name is|name's)\s+([A-Z][a-zA-Z]+)/gi,
    /^([A-Z][a-z]{2,})\s+(?:here|speaking|calling)/gim,
  ];
  const skipNames = new Set(['sir', 'madam', 'mam', 'hello', 'hi', 'yes', 'no', 'ok', 'okay', 'the', 'and', 'from']);
  namePatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(fullText)) !== null) {
      const name = match[1]?.trim();
      if (name && name.length >= 2 && !skipNames.has(name.toLowerCase())) {
        extracted.names.push(name);
      }
    }
  });
  extracted.names = [...new Set(extracted.names)];

  // Numbers
  const allNumbers = fullText.match(/\b\d{5,}\b/g) || [];
  const phoneNumbers = allNumbers.filter(n => n.length === 10);
  extracted.phoneNumbers.push(...phoneNumbers);
  const spacedPhone = fullText.match(/\b\d{3,5}[\s-]?\d{3,4}[\s-]?\d{3,4}\b/g) || [];
  spacedPhone.forEach(p => {
    const clean = p.replace(/[\s-]/g, '');
    if (clean.length >= 10) extracted.phoneNumbers.push(clean);
  });
  extracted.phoneNumbers = [...new Set(extracted.phoneNumbers)];

  // Bank accounts
  const accountNumbers = allNumbers.filter(n =>
    n.length >= 9 && n.length <= 18 && !extracted.phoneNumbers.includes(n)
  );
  extracted.bankAccounts.push(...accountNumbers);
  extracted.bankAccounts = [...new Set(extracted.bankAccounts)];

  // UPI IDs
  const upiMatches = fullText.match(/[a-zA-Z0-9._-]+@[a-zA-Z]+/gi) || [];
  extracted.upiIds = [...new Set(upiMatches.filter(u => {
    const lower = u.toLowerCase();
    return !(lower.includes('.com') || lower.includes('.org') || lower.includes('.net') || lower.includes('.co.'));
  }))];

  // Bank names
  const bankKeywords = [
    [['sbi', 'state bank', 'statebank'], 'SBI'],
    [['hdfc'], 'HDFC'],
    [['icici'], 'ICICI'],
    [['axis'], 'Axis Bank'],
    [['kotak'], 'Kotak'],
    [['pnb', 'punjab national'], 'PNB'],
    [['bob', 'bank of baroda', 'baroda'], 'Bank of Baroda'],
    [['canara'], 'Canara Bank'],
    [['union bank'], 'Union Bank'],
    [['idbi'], 'IDBI'],
    [['yes bank'], 'Yes Bank'],
    [['indusind'], 'IndusInd'],
    [['federal'], 'Federal Bank'],
    [['rbl'], 'RBL Bank'],
    [['paytm'], 'Paytm'],
    [['phonepe', 'phone pe'], 'PhonePe'],
    [['gpay', 'google pay', 'googlepay'], 'Google Pay'],
    [['amazon pay', 'amazonpay'], 'Amazon Pay'],
    [['freecharge'], 'Freecharge'],
    [['mobikwik'], 'MobiKwik'],
  ];
  bankKeywords.forEach(([keywords, name]) => {
    if (keywords.some(k => lowerText.includes(k))) extracted.bankNames.push(name);
  });
  extracted.bankNames = [...new Set(extracted.bankNames)];

  // Organizations
  const orgKeywords = [
    [['microsoft', 'ms support', 'windows support'], 'Microsoft'],
    [['amazon', 'amazone'], 'Amazon'],
    [['apple', 'icloud'], 'Apple'],
    [['google', 'gmail'], 'Google'],
    [['facebook', 'meta', 'fb'], 'Meta/Facebook'],
    [['whatsapp', 'whats app'], 'WhatsApp'],
    [['cyber cell', 'cyber crime', 'cyber police'], 'Cyber Police'],
    [['cbi'], 'CBI'],
    [['cid'], 'CID'],
    [['income tax', 'it department', 'tax department'], 'Income Tax'],
    [['customs', 'custom department'], 'Customs'],
    [['rbi', 'reserve bank'], 'RBI'],
    [['sebi'], 'SEBI'],
    [['uidai', 'aadhar', 'aadhaar'], 'UIDAI/Aadhaar'],
    [['trai', 'telecom'], 'TRAI/Telecom'],
    [['airtel', 'bharti'], 'Airtel'],
    [['jio', 'reliance jio'], 'Jio'],
    [['vodafone', 'vi ', 'idea'], 'Vi/Vodafone'],
    [['bsnl'], 'BSNL'],
    [['flipkart'], 'Flipkart'],
    [['paypal', 'pay pal'], 'PayPal'],
    [['netflix'], 'Netflix'],
    [['police', 'officer'], 'Police'],
    [['court', 'legal'], 'Legal/Court'],
    [['fedex', 'dhl', 'courier'], 'Courier Service'],
  ];
  orgKeywords.forEach(([keywords, name]) => {
    if (keywords.some(k => lowerText.includes(k))) extracted.claimedOrganization.push(name);
  });
  extracted.claimedOrganization = [...new Set(extracted.claimedOrganization)];

  // Employee IDs
  const idPatterns = [
    /(?:employee|emp|badge|staff|agent)\s*(?:id|number|no|#)?[:\s]*([A-Z0-9-]{2,15})/gi,
    /(?:my id is|id is|id number)\s*([A-Z0-9-]{2,15})/gi,
  ];
  idPatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(fullText)) !== null) {
      if (match[1] && match[1].length >= 2) extracted.employeeId.push(match[1]);
    }
  });
  extracted.employeeId = [...new Set(extracted.employeeId)];

  // Case numbers
  const casePatterns = [
    /(?:case|reference|ref|ticket|complaint|order)\s*(?:id|number|no|#)?[:\s]*([A-Z0-9-]{2,20})/gi,
    /(?:case number is|reference is|ref number)\s*([A-Z0-9-]{2,20})/gi,
  ];
  casePatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(fullText)) !== null) {
      if (match[1] && match[1].length >= 2) extracted.caseNumber.push(match[1]);
    }
  });
  extracted.caseNumber = [...new Set(extracted.caseNumber)];

  // URLs
  const urlPatterns = [
    /(https?:\/\/[^\s]+)/gi,
    /(www\.[^\s]+)/gi,
    /([a-zA-Z0-9-]+\.(com|net|org|in|xyz|tk|ml|io|co|info|biz|online|site|website|link|click)[^\s]*)/gi,
  ];
  urlPatterns.forEach(pattern => {
    const matches = fullText.match(pattern) || [];
    extracted.links.push(...matches);
  });
  extracted.links = [...new Set(extracted.links)];

  // Suspicious keywords
  const keywords = [
    'urgent', 'urgently', 'immediately', 'right now', 'right away', 'asap', 'hurry',
    'today only', 'last chance', 'final warning', 'time sensitive', 'expires',
    'refund', 'transfer', 'send money', 'pay', 'payment', 'transaction', 'deposit',
    'withdraw', 'withdrawal', 'charge', 'charged', 'deducted', 'debit', 'credit',
    'blocked', 'suspended', 'terminated', 'closed', 'locked', 'compromised',
    'unauthorized', 'suspicious activity', 'fraud', 'fraudulent', 'hacked',
    'verify', 'verification', 'confirm', 'validate', 'update', 'upgrade',
    'otp', 'one time password', 'password', 'pin', 'cvv', 'security code',
    'two factor', '2fa', 'authentication',
    'arrest', 'arrested', 'warrant', 'legal action', 'lawsuit', 'sue', 'court',
    'police', 'crime', 'criminal', 'investigation', 'investigate', 'case filed',
    'lottery', 'prize', 'winner', 'won', 'jackpot', 'lucky', 'selected', 'chosen',
    'congratulations', 'reward', 'free gift', 'giveaway',
    'kyc', 'pan card', 'pan number', 'aadhar', 'aadhaar', 'aadhar card',
    'passport', 'driving license', 'documents required',
    'remote access', 'anydesk', 'teamviewer', 'quick support', 'quicksupport',
    'screen share', 'screen sharing', 'download app', 'install app',
    'gift card', 'gift voucher', 'bitcoin', 'crypto', 'cryptocurrency',
    'western union', 'wire transfer', 'money order', 'cash deposit',
    'lakh', 'lakhs', 'crore', 'crores', 'thousand', 'rupees', 'dollars',
  ];
  keywords.forEach(keyword => {
    if (lowerText.includes(keyword)) extracted.suspiciousKeywords.push(keyword);
  });
  extracted.suspiciousKeywords = [...new Set(extracted.suspiciousKeywords)];

  return extracted;
}

// --- Groq API call ---
async function callGroqAPI(apiKey, messages, persona, gatheredInfo) {
  const selectedPersona = PERSONAS[persona] || PERSONAS.grandma;
  const dynamicPrompt = buildDynamicPrompt(selectedPersona.prompt, gatheredInfo);

  const fullMessages = [
    { role: 'system', content: dynamicPrompt },
    ...messages
  ];

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messages: fullMessages,
      model: 'llama-3.1-8b-instant',
      temperature: 0.75,
      max_tokens: 80,
      top_p: 0.9
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Groq API error (${response.status}): ${err}`);
  }

  const data = await response.json();
  let aiResponse = data.choices?.[0]?.message?.content || "I'm sorry, could you repeat that?";
  aiResponse = cleanResponse(aiResponse);

  const scammerMessages = messages.filter(m => m.role === 'user');
  const extractedInfo = extractIntelligence(scammerMessages);

  return {
    response: aiResponse,
    extractedInfo,
    persona: selectedPersona.name
  };
}

// --- Message handler from popup ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'CHAT') {
    handleChat(request).then(sendResponse).catch(err => {
      sendResponse({ error: err.message });
    });
    return true; // keep channel open for async
  }

  if (request.type === 'CHECK_API_KEY') {
    chrome.storage.sync.get(['groqApiKey'], (result) => {
      sendResponse({ hasKey: !!result.groqApiKey });
    });
    return true;
  }
});

async function handleChat({ sessionId, message, persona, gatheredInfo }) {
  // Get API key
  const result = await chrome.storage.sync.get(['groqApiKey']);
  const apiKey = result.groqApiKey;

  if (!apiKey) {
    throw new Error('No API key configured. Right-click the extension icon → Options to set your Groq API key.');
  }

  // Get or create conversation history
  let history = conversations.get(sessionId) || [];
  history.push({ role: 'user', content: message });

  // Call Groq
  const { response, extractedInfo, persona: personaName } = await callGroqAPI(
    apiKey, history, persona, gatheredInfo
  );

  // Store history
  history.push({ role: 'assistant', content: response });
  if (history.length > 20) history = history.slice(-20);
  conversations.set(sessionId, history);

  return { response, extractedInfo, sessionId, persona: personaName };
}
