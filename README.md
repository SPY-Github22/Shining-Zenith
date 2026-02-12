# 🍯 AI Honeypot - Scam Defense System

An intelligent AI-powered honeypot system that can take over scam calls and keep scammers engaged while extracting intelligence for law enforcement.

## 🎯 Features

- **🗣️ Voice Interface**: Uses Web Speech API for natural voice conversations
- **🤖 AI Persona**: "Margaret", a 68-year-old retiree designed to keep scammers engaged
- **🔍 Intelligence Extraction**: Automatically detects and logs:
  - Bank account numbers
  - UPI IDs
  - Phishing links
  - Phone numbers
  - Suspicious keywords
- **📊 Real-time Dashboard**: Live transcript and extracted data visualization
- **🎨 Premium UI**: Modern dark theme with glassmorphism effects

## 🚀 Quick Start

### Prerequisites

- Node.js (v18 or higher)
- A Groq API key (free - sign up at [console.groq.com](https://console.groq.com))
- Chrome, Edge, or Safari browser (for Web Speech API support)

### Installation

1. **Get a Groq API Key**
   - Go to [console.groq.com](https://console.groq.com)
   - Sign up for a free account (no credit card required)
   - Generate an API key from the dashboard

2. **Install Server Dependencies**
   ```bash
   cd server
   npm install
   ```

3. **Install Client Dependencies**
   ```bash
   cd ../client
   npm install
   ```

4. **Configure Environment**
   - Open `server/.env`
   - Replace `your_groq_api_key_here` with your actual Groq API key:
     ```
     GROQ_API_KEY=gsk_your_actual_key_here
     PORT=3001
     ```

### Running the Application

You need to run both the server and client:

**Terminal 1 - Start the Server:**
```bash
cd server
npm start
```

**Terminal 2 - Start the Client:**
```bash
cd client
npm run dev
```

The application will open at `http://localhost:3000`

## 📱 How to Use

### Basic Usage (Browser Testing)

1. Open the application in your browser
2. Click **"Hand-off Call to AI"** button
3. Grant microphone permissions when prompted
4. Start speaking - the AI will respond as "Margaret"
5. Watch the intelligence panel for extracted data

### Phone Call Integration

To use with actual phone calls, you have two options:

#### Option 1: Phone Speaker Method (Simplest)
1. When you get a scam call, click "Hand-off Call to AI"
2. Put your phone on **speaker mode**
3. Place your phone near your computer's microphone
4. The AI will listen and respond through your computer speakers
5. The scammer hears the AI responses through your phone

#### Option 2: Virtual Audio Cable (Advanced)
For better audio quality, you can use virtual audio cable software:
- **Windows**: VB-Audio Virtual Cable
- **Mac**: BlackHole or Loopback

This routes audio directly between devices without using speakers/microphone.

## 🧠 How It Works

### The Persona

Margaret is designed to:
- Act confused but cooperative
- Ask for clarification frequently
- Make believable mistakes (writing things down wrong)
- Go off-topic (cats, grandchildren)
- Be slow and waste the scammer's time
- Extract information without suspicion

### Intelligence Extraction

The system uses pattern matching to detect:
- **UPI IDs**: `example@okaxis`, `9876543210@paytm`
- **Bank Accounts**: 8-18 digit sequences
- **Phone Numbers**: 10-digit patterns
- **Links**: URLs and domain names
- **Keywords**: refund, verify, urgent, etc.

All extracted data is displayed in real-time on the dashboard.

## 🔧 Technical Stack

- **Frontend**: React + Vite
- **Backend**: Node.js + Express
- **AI**: Groq API (Llama 3.1 8B model)
- **Voice**: Web Speech API (browser built-in)
- **Styling**: Vanilla CSS with custom design system

## 📊 Project Structure

```
honeypot-agent/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/    # UI components
│   │   │   └── ActiveCall.jsx
│   │   ├── hooks/         # Custom React hooks
│   │   │   └── useVoice.js
│   │   └── App.jsx
│   └── package.json
│
└── server/                # Node.js backend
    ├── index.js           # Express server
    ├── groqClient.js      # AI integration
    ├── .env               # Configuration
    └── package.json
```

## ⚠️ Important Notes

- **Legal**: Only use this to waste scammers' time. Do not use for legitimate calls.
- **Privacy**: All conversations are stored in memory and cleared when you refresh.
- **API Limits**: Free Groq tier gives 14,400 requests/day (more than enough for testing).
- **Browser Compatibility**: Web Speech API works best in Chrome.

## 🛟 Troubleshooting

### "Voice Not Supported" Error
- Use Chrome, Edge, or Safari browser
- Ensure you're accessing via `localhost` (not file://)

### AI Not Responding
- Check that the server is running (`npm start` in server folder)
- Verify your Groq API key is correct in `server/.env`
- Check browser console for errors

### Microphone Not Working
- Grant microphone permissions when browser prompts
- Check browser settings → Privacy → Microphone
- Ensure no other app is using the microphone

## 📝 Development

To modify the AI persona, edit `server/groqClient.js` and update the `SYSTEM_PROMPT` variable.

To change the UI theme, edit `client/src/index.css` CSS variables.

## 🤝 Contributing

This is a hackathon project. Feel free to fork and improve!

## 📄 License

MIT License - Use responsibly.

---

Built with ❤️ to fight scammers
