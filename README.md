# 🍯 Shining Zenith — AI Honeypot V3

**An intelligent AI-powered honeypot that intercepts scam calls, keeps scammers engaged with natural-sounding voices, and extracts maximum intelligence — all for free.**

## 🎯 What's New in V3

| Feature | V2 | V3 |
|---|---|---|
| AI Model | Llama 3.1 8B (small) | **Llama 3.3 70B** (9× smarter) |
| Voice | Robotic browser speech | **Edge TTS neural voices** (natural) |
| Personas | 2 (Margaret, Harold) | **4** (+Priya, Uncle Bob) |
| Intel Extraction | Regex patterns only | **AI-powered + regex** |
| Scam Classification | ❌ | **Auto-detects scam type** |
| Escalation Strategy | ❌ | **Progressively extracts more info** |
| Session History | ❌ | **Tracks all past sessions** |
| Time Wasted Counter | ❌ | **Shows total scammer time wasted** |
| Report Export | ❌ | **One-click report for authorities** |

## 🚀 Quick Start

### Prerequisites

- Node.js (v18+)
- **Python 3.x** (for Edge TTS)
- `pip install edge-tts`
- Groq API key (free — [console.groq.com](https://console.groq.com))
- Chrome/Edge browser

### Installation

```bash
# Server
cd server
npm install

# Client
cd ../client
npm install
```

### Configure

Edit `server/.env`:
```
GROQ_API_KEY=gsk_your_key_here
PORT=3001
```

### Run

**Terminal 1** — Server:
```bash
cd server
npm start
```

**Terminal 2** — Client:
```bash
cd client
npm run dev
```

Open `http://localhost:3000`

## 📱 How to Use

1. **Select a persona** — choose who the scammer will talk to
2. Click **"Hand-off Call to AI"** — grant mic permissions
3. **Put the scam call on speaker** near your computer
4. Watch the AI engage the scammer while extracting intel
5. Check the **intelligence panel** for extracted data
6. Click **📋 Export** to copy a full report for authorities
7. Click **📞 End** to save the session

## 🎭 Four AI Personas

| Persona | Character | Strategy |
|---|---|---|
| 👵 **Margaret** | 68yo retired teacher, warm and trusting | Cooperative, asks for clarification |
| 👴 **Harold** | 72yo retired engineer, skeptical | Makes them repeat everything |
| 👩 **Priya** | 32yo confused smartphone user | Anxious, asks "is my money safe?" |
| 🧔 **Uncle Bob** | 65yo chatty veteran | Goes on tangents, maximum time wasting |

## 🎯 Escalation Strategy

The AI progressively extracts more details as the conversation grows:

| Time | Level | Behavior |
|---|---|---|
| 0-2 min | **Cooperative** | Follow scammer's lead, build trust |
| 2-5 min | **Curious** | Ask for callback number, name, department |
| 5-8 min | **Probing** | Request employee ID, badge number, branch |
| 8+ min | **Bold** | Ask for supervisor, company registration, office address |

## 🔍 Intelligence Extraction

### AI-Powered (V3 New)
Uses a second AI call to understand context and extract structured data — catches things regex misses.

### Regex Patterns (Fallback)
- **Names** — caller identification
- **Phone Numbers** — 10-digit patterns
- **UPI IDs** — `id@provider` format
- **Bank Accounts** — 9-18 digit sequences
- **Bank Names** — SBI, HDFC, ICICI, etc.
- **Organizations** — Microsoft, RBI, Cyber Police, etc.
- **Employee IDs** — alphanumeric badge/staff IDs
- **Case Numbers** — reference/ticket numbers
- **URLs** — phishing links
- **Amounts** — monetary values mentioned
- **Suspicious Keywords** — urgent, refund, OTP, arrest, etc.

### Scam Type Classification
Auto-detects: Tech Support, Bank/UPI Fraud, OTP/Refund, Investment, Government Impersonation, Courier, Lottery/Prize, Romance, Job, Insurance

## 🔧 Tech Stack

- **Frontend**: React + Vite
- **Backend**: Node.js + Express
- **AI**: Groq API (Llama 3.3 70B Versatile) — free tier
- **Voice**: Edge TTS (natural neural voices — free) + Web Speech API (listening)
- **Styling**: Vanilla CSS with premium dark theme

## 📊 Project Structure

```
shining-zenith/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── ActiveCall.jsx    # Main UI with all V3 features
│   │   │   └── ActiveCall.css    # Premium dark theme styles
│   │   ├── hooks/
│   │   │   └── useVoice.js       # Edge TTS + Speech Recognition
│   │   └── App.jsx
│   └── package.json
│
├── server/
│   ├── index.js              # Express + TTS + Sessions API
│   ├── groqClient.js         # AI personas, escalation, extraction
│   ├── .env                  # GROQ_API_KEY config
│   └── package.json
│
├── server/
│   ├── index.js              # Express + TTS + Sessions API
│   ├── groqClient.js         # AI personas, escalation, extraction
│   ├── .env                  # GROQ_API_KEY config
│   └── package.json
```

---



| Feature | Web App |
|---|---|
| Setup | `npm install` + server |
| Server required | ✅ Yes |
| Voice quality | **Edge TTS (natural)** |
| AI Intelligence | ✅ AI + Regex |
| Session History | ✅ Server memory |
| Report Export | ✅ Clipboard |
| Personas | 4 |

---

## ⚠️ Important Notes

- **Legal**: Only use on scam calls. Do not use for legitimate calls.
- **Privacy**: Web app conversations cleared on refresh. Extension stores sessions in chrome.storage.
- **API Limits**: Groq free tier: 14,400 requests/day — more than enough.
- **Browser**: Best in Chrome (Web Speech API + extension support).

## 🛟 Troubleshooting

| Issue | Solution |
|---|---|
| Voice not supported | Use Chrome/Edge. Access via `localhost`. |
| AI not responding | Check server is running. Verify API key in `.env`. |
| Mic not working | Grant permissions. Check no other app using mic. |
| Edge TTS error | Falls back to browser TTS automatically. |

## 📝 Development

- Modify personas: `server/groqClient.js` → `PERSONAS` object
- Change UI theme: `client/src/index.css` → CSS variables
- Add escalation behavior: `groqClient.js` → `ESCALATION_PROMPTS`

## 📄 License

MIT License — Use responsibly.

---

Built with ❤️ to fight scammers | **Shining Zenith V3**
