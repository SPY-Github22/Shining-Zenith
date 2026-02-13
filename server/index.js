import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { EdgeTTS } from 'edge-tts-universal';
import { getChatResponse, getPersonas } from './groqClient.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Store conversation history
const conversations = new Map();
// Store completed sessions
const sessions = [];

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Honeypot V3 server is running' });
});

// Get available personas
app.get('/api/personas', (req, res) => {
    res.json({ personas: getPersonas() });
});

// Chat endpoint
app.post('/api/chat', async (req, res) => {
    try {
        const { sessionId, message, persona = 'grandma', gatheredInfo = {} } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        let history = conversations.get(sessionId) || [];
        history.push({ role: 'user', content: message });

        const result = await getChatResponse(history, persona, gatheredInfo);

        history.push({ role: 'assistant', content: result.response });

        // Keep last 30 messages (bigger model handles more context)
        if (history.length > 30) {
            history = history.slice(-30);
        }
        conversations.set(sessionId, history);

        res.json({
            response: result.response,
            extractedInfo: result.extractedInfo,
            sessionId,
            persona: result.persona,
            voice: result.voice,
            escalationLevel: result.escalationLevel
        });
    } catch (error) {
        console.error('Chat error:', error);
        res.status(500).json({ error: 'Failed to process message', details: error.message });
    }
});

// ===== TTS ENDPOINT (Edge TTS) =====
app.post('/api/tts', async (req, res) => {
    try {
        const { text, voice = 'en-US-JennyNeural' } = req.body;

        if (!text) {
            return res.status(400).json({ error: 'Text is required' });
        }

        const tts = new EdgeTTS();
        await tts.synthesize(text, voice, { rate: '-5%', pitch: '+0Hz' });

        const audioBuffer = tts.toBuffer();

        res.set({
            'Content-Type': 'audio/mpeg',
            'Content-Length': audioBuffer.length,
            'Cache-Control': 'no-cache'
        });
        res.send(audioBuffer);

    } catch (error) {
        console.error('TTS error:', error);
        res.status(500).json({ error: 'TTS generation failed', details: error.message });
    }
});

// ===== SESSION HISTORY =====
// Save a completed session
app.post('/api/sessions', (req, res) => {
    try {
        const { sessionId, persona, duration, scamType, extractedInfo, transcript, startTime } = req.body;

        const session = {
            id: sessionId,
            persona,
            duration,
            scamType: scamType || 'Unknown',
            extractedInfo: extractedInfo || {},
            transcript: transcript || [],
            startTime: startTime || new Date().toISOString(),
            endTime: new Date().toISOString()
        };

        sessions.push(session);

        // Clean up conversation memory
        conversations.delete(sessionId);

        res.json({ success: true, session });
    } catch (error) {
        console.error('Session save error:', error);
        res.status(500).json({ error: 'Failed to save session' });
    }
});

// Get all sessions
app.get('/api/sessions', (req, res) => {
    res.json({ sessions });
});

// Get conversation history
app.get('/api/conversation/:sessionId', (req, res) => {
    const history = conversations.get(req.params.sessionId) || [];
    res.json({ history });
});

// Clear conversation
app.delete('/api/conversation/:sessionId', (req, res) => {
    conversations.delete(req.params.sessionId);
    res.json({ message: 'Conversation cleared' });
});

app.listen(PORT, () => {
    console.log(`🍯 Honeypot V3 server running on http://localhost:${PORT}`);
    console.log(`📡 Ready to trap scammers with Edge TTS + Llama 3.3 70B...`);
});
