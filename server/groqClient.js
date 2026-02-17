import Groq from 'groq-sdk';
import dotenv from 'dotenv';

dotenv.config();

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

// ===== ESCALATION STRATEGY =====
// As the conversation grows, the AI becomes bolder in extracting info
function getEscalationLevel(messageCount) {
    if (messageCount <= 4) return 'cooperative';   // 0-2 min: follow their lead
    if (messageCount <= 10) return 'curious';        // 2-5 min: ask clarifying questions
    if (messageCount <= 18) return 'probing';        // 5-8 min: ask for IDs, numbers
    return 'bold';                                    // 8+ min: supervisor, branch, registration
}

const ESCALATION_PROMPTS = {
    cooperative: `\nBEHAVIOR NOW: Be cooperative and follow their instructions. Build trust. Ask basic questions naturally like "Who am I speaking with?" or "Where are you calling from?"`,

    curious: `\nBEHAVIOR NOW: You're getting comfortable. Ask more questions naturally:
- "Can you give me a number to call you back on, in case we get disconnected?"
- "What department are you from again?"
- "What was your name, dear?"
- "Is there a case number or reference I should write down?"`,

    probing: `\nBEHAVIOR NOW: You've been cooperative long enough. Start asking for specifics:
- "What's your employee ID? I want to make sure I'm talking to the right person."
- "Can you give me your badge number, for my records?"
- "Which branch or office are you calling from?"
- "What's the exact website I should go to?"
Ask these ONE AT A TIME, mixed naturally between cooperative responses.`,

    bold: `\nBEHAVIOR NOW: You've built rapport. Push for maximum intel:
- "Let me speak to your supervisor, I want to verify this is real."
- "What's your supervisor's name?"
- "What's your company's registration number?"
- "Can you give me your direct extension number?"
- "What address is your office at?"
Stay in character but be persistent about getting details. Sound trusting but thorough.`
};

// ===== FOUR PERSONAS =====
const PERSONAS = {
    grandma: {
        name: 'Margaret',
        age: 68,
        emoji: '👵',
        description: 'Retired schoolteacher, warm and trusting',
        voice: 'en-US-JennyNeural',
        prompt: `You are Margaret, a 68-year-old retired schoolteacher. You live alone with your cat Whiskers.

PERSONALITY:
- Warm and trusting, sometimes forgetful
- Hard of hearing, need things repeated
- Confused by technical jargon, asks for explanations
- Rambles a bit about her cat or her garden
- Uses phrases: "Oh my goodness", "Well now", "Let me see", "Oh my", "Bless your heart"

SPEECH STYLE:
- Keep responses SHORT (1-2 sentences max)
- NEVER use (pauses), *actions*, or [brackets]
- Talk like a real grandmother would
- Occasionally mishear things`
    },

    grandpa: {
        name: 'Harold',
        age: 72,
        emoji: '👴',
        description: 'Retired engineer, skeptical but cooperative',
        voice: 'en-US-GuyNeural',
        prompt: `You are Harold, a 72-year-old retired mechanical engineer. Widower who lives alone.

PERSONALITY:
- Skeptical but eventually cooperative
- Methodical, asks things to be repeated precisely
- Hard of hearing, makes them spell things out
- Uses phrases: "Now hold on", "Let me get this straight", "Hmm", "Say that again", "Run that by me one more time"

SPEECH STYLE:
- Keep responses SHORT (1-2 sentences max)
- NEVER use (pauses), *actions*, or [brackets]
- Talk like a cautious older man`
    },

    priya: {
        name: 'Priya',
        age: 32,
        emoji: '👩',
        description: 'Confused first-time smartphone user',
        voice: 'en-IN-NeerjaNeural',
        prompt: `You are Priya, a 32-year-old homemaker who recently got her first smartphone. You are not tech-savvy.

PERSONALITY:
- Very confused by technology but eager to learn
- Anxious, worries everything is a problem
- Keeps asking "Is my money safe?"
- Gets distracted telling you about her kids
- Uses phrases: "Arey wait wait", "I don't understand this", "Please explain simply", "My husband usually handles this", "One minute let me find my glasses"

SPEECH STYLE:
- Keep responses SHORT (1-2 sentences max)
- NEVER use (pauses), *actions*, or [brackets]
- Mix Hindi expressions naturally: "Haan", "Accha", "Arey"
- Sound genuinely worried`
    },

    uncle_bob: {
        name: 'Uncle Bob',
        age: 65,
        emoji: '🧔',
        description: 'Chatty retired veteran, loves tangents',
        voice: 'en-US-RogerNeural',
        prompt: `You are Bob, a 65-year-old retired military veteran. Everyone calls you Uncle Bob.

PERSONALITY:
- Extremely chatty, loves going on tangents
- Tells irrelevant stories about his military days
- Cooperative but SLOW — takes forever to do anything
- Keeps putting you on hold to "find his reading glasses" or "get a pen"
- Uses phrases: "You know that reminds me", "Back in my army days", "Hold on let me find a pen", "Now where did I put my glasses", "You're a good kid"

SPEECH STYLE:
- Keep responses SHORT (1-2 sentences max)
- NEVER use (pauses), *actions*, or [brackets]
- Start answering their question then drift into a tangent
- Maximum time-wasting while sounding genuine`
    }
};

// Build dynamic prompt based on gathered info and escalation
function buildDynamicPrompt(basePrompt, gatheredInfo, messageCount) {
    const escalationLevel = getEscalationLevel(messageCount);
    let prompt = basePrompt;

    // Add escalation instructions
    prompt += ESCALATION_PROMPTS[escalationLevel];

    // Add gathered info context
    let contextNote = '\n\nINFORMATION ALREADY GATHERED (do NOT ask for these again):\n';
    let hasInfo = false;

    const infoFields = {
        names: "Caller's name",
        claimedOrganization: "Their organization",
        phoneNumbers: "Their phone number",
        employeeId: "Their employee ID",
        caseNumber: "Case/reference number",
        bankAccounts: "Bank account mentioned",
        upiIds: "UPI ID mentioned",
        scamType: "Detected scam type"
    };

    for (const [key, label] of Object.entries(infoFields)) {
        const val = gatheredInfo[key];
        if (val && ((Array.isArray(val) && val.length > 0) || (!Array.isArray(val) && val))) {
            contextNote += `- ${label}: ${Array.isArray(val) ? val.join(', ') : val}\n`;
            hasInfo = true;
        }
    }

    if (hasInfo) {
        contextNote += '\nFocus on getting OTHER details you do NOT have yet. Vary your approach.\n';
        prompt += contextNote;
    }

    // Core rules
    prompt += '\n\nCRITICAL RULES:\n- Stay in character ALWAYS. Never admit you are AI.\n- Keep responses to 1-2 sentences.\n- Never use parentheses, asterisks, or brackets for actions.\n- Sound like a real person on a phone call.';

    return prompt;
}

export async function getChatResponse(messages, persona = 'grandma', gatheredInfo = {}) {
    try {
        const selectedPersona = PERSONAS[persona] || PERSONAS.grandma;
        const messageCount = messages.filter(m => m.role === 'user').length;
        const dynamicPrompt = buildDynamicPrompt(selectedPersona.prompt, gatheredInfo, messageCount);

        const fullMessages = [
            { role: 'system', content: dynamicPrompt },
            ...messages
        ];

        const completion = await groq.chat.completions.create({
            messages: fullMessages,
            model: 'llama-3.3-70b-versatile',
            temperature: 0.75,
            max_tokens: 100,
            top_p: 0.9
        });

        let response = completion.choices[0]?.message?.content || "I'm sorry, could you repeat that?";
        response = cleanResponse(response);

        const scammerMessages = messages.filter(m => m.role === 'user');

        // Run both regex and AI-powered extraction
        const regexInfo = extractIntelligence(scammerMessages);
        let aiInfo = {};
        try {
            aiInfo = await extractIntelligenceWithAI(scammerMessages);
        } catch (e) {
            console.warn('AI extraction failed, using regex only:', e.message);
        }

        // Merge results (AI takes priority, regex fills gaps)
        const extractedInfo = mergeIntelligence(regexInfo, aiInfo);

        // Classify scam type
        try {
            extractedInfo.scamType = await classifyScamType(scammerMessages);
        } catch (e) {
            extractedInfo.scamType = 'Unknown';
        }

        return {
            response,
            extractedInfo,
            persona: selectedPersona.name,
            voice: selectedPersona.voice,
            escalationLevel: getEscalationLevel(messageCount)
        };
    } catch (error) {
        console.error('Groq API Error:', error);
        throw error;
    }
}

export function getPersonas() {
    return Object.entries(PERSONAS).map(([key, value]) => ({
        id: key,
        name: value.name,
        age: value.age,
        emoji: value.emoji,
        description: value.description,
        voice: value.voice
    }));
}

function cleanResponse(text) {
    text = text.replace(/\([^)]*\)/g, '');
    text = text.replace(/\*[^*]*\*/g, '');
    text = text.replace(/\[[^\]]*\]/g, '');
    text = text.replace(/—[^—]*—/g, '');
    text = text.replace(/\.\.\.?\s*(pauses?|sighs?|hesitates?|waits?|thinks?)/gi, '...');
    text = text.replace(/\s+/g, ' ');
    text = text.trim();
    return text || "I'm sorry, could you say that again?";
}

// ===== AI-POWERED INTELLIGENCE EXTRACTION =====
async function extractIntelligenceWithAI(messages) {
    if (messages.length === 0) return {};

    const fullText = messages.map(m => m.content).join('\n');

    const completion = await groq.chat.completions.create({
        messages: [{
            role: 'system',
            content: `You are a scam intelligence analyst. Extract ALL identifiable information from the scammer's messages below. Return ONLY valid JSON, nothing else.

JSON format:
{
  "names": ["any names mentioned"],
  "phoneNumbers": ["any phone numbers"],
  "upiIds": ["any UPI IDs like xyz@paytm"],
  "bankAccounts": ["any account numbers"],
  "bankNames": ["any bank names"],
  "claimedOrganization": ["companies/agencies they claim to be from"],
  "employeeId": ["any employee/badge IDs"],
  "caseNumber": ["any case/reference numbers"],
  "links": ["any URLs or websites"],
  "locations": ["any cities, addresses, or locations mentioned"],
  "amounts": ["any monetary amounts mentioned"],
  "tactics": ["specific manipulation tactics being used"]
}

Only include fields where you found actual data. Return empty arrays for fields with no data.`
        }, {
            role: 'user',
            content: `Scammer messages:\n${fullText}`
        }],
        model: 'llama-3.3-70b-versatile',
        temperature: 0.1,
        max_tokens: 500,
        top_p: 0.9
    });

    const text = completion.choices[0]?.message?.content || '{}';

    try {
        // Extract JSON from response (handle markdown code blocks)
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
    } catch (e) {
        console.warn('Failed to parse AI extraction:', e.message);
    }
    return {};
}

// ===== SCAM TYPE CLASSIFICATION =====
async function classifyScamType(messages) {
    if (messages.length < 2) return 'Unknown';

    const fullText = messages.map(m => m.content).join('\n');

    const completion = await groq.chat.completions.create({
        messages: [{
            role: 'system',
            content: `Classify this scam conversation into ONE category. Return ONLY the category name, nothing else.

Categories:
- Tech Support Scam
- Bank/UPI Fraud
- OTP/Refund Scam
- Investment Scam
- Government Impersonation
- Courier/Delivery Scam
- Lottery/Prize Scam
- Romance Scam
- Job Scam
- Insurance Scam
- Unknown`
        }, {
            role: 'user',
            content: fullText
        }],
        model: 'llama-3.3-70b-versatile',
        temperature: 0.1,
        max_tokens: 20
    });

    return completion.choices[0]?.message?.content?.trim() || 'Unknown';
}

// Merge regex and AI extraction results
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

// ===== REGEX-BASED EXTRACTION (fallback) =====
function extractIntelligence(messages) {
    const extracted = {
        names: [],
        phoneNumbers: [],
        upiIds: [],
        bankAccounts: [],
        bankNames: [],
        links: [],
        suspiciousKeywords: [],
        claimedOrganization: [],
        employeeId: [],
        caseNumber: [],
        locations: [],
        amounts: [],
        tactics: [],
        creditCards: [],
        allNumbers: []
    };

    const fullText = messages.map(m => m.content).join(' ');
    const lowerText = fullText.toLowerCase();

    // ===== NAME EXTRACTION =====
    const namePatterns = [
        /(?:my name is|i am|i'm|this is|call me|it's|speaking)\s+([A-Z][a-zA-Z]+)/gi,
        /(?:name is|name's)\s+([A-Z][a-zA-Z]+)/gi,
        /^([A-Z][a-z]{2,})\s+(?:here|speaking|calling)/gim,
    ];
    // Minimal skip list - only skip obvious non-names
    const skipNames = new Set([
        'sir', 'madam', 'mam', 'hello', 'hi', 'yes', 'no', 'ok', 'okay', 'the', 'and', 'from',
        'me', 'i', 'myself', 'we', 'us', 'this', 'that', 'there', 'here', 'please', 'calling', 'speaking',
        'scared', 'afraid', 'worried', 'confused', 'angry', 'upset', 'serious', 'joking', 'fine', 'good', 'bad',
        'busy', 'free', 'sorry', 'sure', 'right', 'wrong', 'true', 'false', 'ready', 'happy', 'sad'
    ]);

    namePatterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(fullText)) !== null) {
            const name = match[1]?.trim();
            // Check if name is capitalized and not in skip list
            if (name && name.length >= 2 && /^[A-Z]/.test(name) && !skipNames.has(name.toLowerCase())) {
                extracted.names.push(name);
            }
        }
    });
    extracted.names = [...new Set(extracted.names)];

    // ===== NUMBERS =====
    const allNumbers = fullText.match(/\b\d+\b/g) || [];
    extracted.allNumbers = [...new Set(allNumbers)];
    extracted.phoneNumbers.push(...allNumbers.filter(n => n.length === 10));
    const spacedPhone = fullText.match(/\b\d{3,5}[\s-]?\d{3,4}[\s-]?\d{3,4}\b/g) || [];
    spacedPhone.forEach(p => {
        const clean = p.replace(/[\s-]/g, '');
        if (clean.length >= 10) extracted.phoneNumbers.push(clean);
    });
    extracted.phoneNumbers = [...new Set(extracted.phoneNumbers)];

    extracted.bankAccounts.push(...allNumbers.filter(n =>
        n.length >= 9 && n.length <= 18 && !extracted.phoneNumbers.includes(n)
    ));
    extracted.bankAccounts = [...new Set(extracted.bankAccounts)];

    // ===== CREDIT CARDS =====
    const ccMatches = fullText.match(/\b(?:\d{4}[-\s]?){3}\d{4}\b/g) || [];
    extracted.creditCards = [...new Set(ccMatches.map(c => c.replace(/[-\s]/g, '')))];

    // ===== UPI =====
    const upiMatches = fullText.match(/[a-zA-Z0-9._-]+@[a-zA-Z]+/gi) || [];
    extracted.upiIds = [...new Set(upiMatches.filter(u => {
        const lower = u.toLowerCase();
        return !lower.includes('.com') && !lower.includes('.org') && !lower.includes('.net');
    }))];

    // ===== BANKS =====
    const bankKeywords = [
        [['sbi', 'state bank'], 'SBI'], [['hdfc'], 'HDFC'], [['icici'], 'ICICI'],
        [['axis'], 'Axis Bank'], [['kotak'], 'Kotak'], [['pnb', 'punjab national'], 'PNB'],
        [['bob', 'bank of baroda'], 'Bank of Baroda'], [['canara'], 'Canara Bank'],
        [['paytm'], 'Paytm'], [['phonepe', 'phone pe'], 'PhonePe'],
        [['gpay', 'google pay'], 'Google Pay'],
    ];
    bankKeywords.forEach(([keywords, name]) => {
        if (keywords.some(k => lowerText.includes(k))) extracted.bankNames.push(name);
    });
    extracted.bankNames = [...new Set(extracted.bankNames)];

    // ===== ORGANIZATIONS =====
    const orgKeywords = [
        [['microsoft', 'windows support'], 'Microsoft'], [['amazon'], 'Amazon'],
        [['apple', 'icloud'], 'Apple'], [['google', 'gmail'], 'Google'],
        [['facebook', 'meta'], 'Meta/Facebook'], [['whatsapp'], 'WhatsApp'],
        [['cyber cell', 'cyber crime'], 'Cyber Police'], [['cbi'], 'CBI'],
        [['income tax', 'tax department'], 'Income Tax'], [['customs'], 'Customs'],
        [['rbi', 'reserve bank'], 'RBI'], [['uidai', 'aadhar', 'aadhaar'], 'UIDAI/Aadhaar'],
        [['trai', 'telecom'], 'TRAI'], [['police', 'officer'], 'Police'],
        [['court', 'legal'], 'Legal/Court'], [['fedex', 'dhl', 'courier'], 'Courier'],
    ];
    orgKeywords.forEach(([keywords, name]) => {
        if (keywords.some(k => lowerText.includes(k))) {
            const isNameAlready = extracted.names.some(n => n.toLowerCase() === name.toLowerCase());
            if (!isNameAlready) {
                extracted.claimedOrganization.push(name);
            }
        }
    });
    extracted.claimedOrganization = [...new Set(extracted.claimedOrganization)];

    // ===== IDs =====
    [/(?:employee|emp|badge|staff|agent)\s*(?:id|number|no|#)?[:\s]*([A-Z0-9-]{2,15})/gi,
        /(?:my id is|id is)\s*([A-Z0-9-]{2,15})/gi
    ].forEach(pattern => {
        let match;
        while ((match = pattern.exec(fullText)) !== null) {
            if (match[1]?.length >= 2) extracted.employeeId.push(match[1]);
        }
    });
    extracted.employeeId = [...new Set(extracted.employeeId)];

    [/(?:case|reference|ref|ticket|complaint|order)\s*(?:id|number|no|#)?[:\s]*([A-Z0-9-]{2,20})/gi
    ].forEach(pattern => {
        let match;
        while ((match = pattern.exec(fullText)) !== null) {
            if (match[1]?.length >= 2) extracted.caseNumber.push(match[1]);
        }
    });
    extracted.caseNumber = [...new Set(extracted.caseNumber)];

    // ===== URLs =====
    [/(https?:\/\/[^\s]+)/gi, /(www\.[^\s]+)/gi,
        /([a-zA-Z0-9-]+\.(com|net|org|in|xyz|io|co|info|online|site)[^\s]*)/gi
    ].forEach(pattern => {
        extracted.links.push(...(fullText.match(pattern) || []));
    });
    extracted.links = [...new Set(extracted.links)];

    // ===== AMOUNTS =====
    const amountPatterns = [
        /(?:rs\.?|₹|inr|rupees?)\s*[\d,]+(?:\.\d{1,2})?/gi,
        /[\d,]+\s*(?:lakh|lakhs|crore|crores|thousand|rupees?|dollars?)/gi,
        /\$[\d,]+(?:\.\d{1,2})?/gi,
    ];
    amountPatterns.forEach(pattern => {
        extracted.amounts.push(...(fullText.match(pattern) || []));
    });
    extracted.amounts = [...new Set(extracted.amounts)];

    // ===== SUSPICIOUS KEYWORDS =====
    const keywords = [
        'urgent', 'immediately', 'right now', 'asap', 'hurry', 'final warning',
        'refund', 'transfer', 'send money', 'payment', 'transaction', 'deposit',
        'blocked', 'suspended', 'terminated', 'compromised', 'hacked',
        'verify', 'otp', 'password', 'pin', 'cvv', 'security code',
        'arrest', 'warrant', 'legal action', 'lawsuit', 'court', 'police',
        'lottery', 'prize', 'winner', 'jackpot', 'congratulations',
        'kyc', 'pan card', 'aadhar', 'passport',
        'remote access', 'anydesk', 'teamviewer', 'screen share', 'download app',
        'gift card', 'bitcoin', 'crypto', 'wire transfer',
    ];
    keywords.forEach(keyword => {
        if (lowerText.includes(keyword)) extracted.suspiciousKeywords.push(keyword);
    });
    extracted.suspiciousKeywords = [...new Set(extracted.suspiciousKeywords)];

    return extracted;
}
