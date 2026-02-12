import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { getChatResponse, getPersonas } from './groqClient.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Store conversation history (in production, use a database)
const conversations = new Map();

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Honeypot server is running' });
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

        // Get or create conversation history
        let history = conversations.get(sessionId) || [];

        // Add user message to history
        history.push({ role: 'user', content: message });

        // Get AI response with selected persona and gathered info context
        const { response, extractedInfo, persona: personaName } = await getChatResponse(history, persona, gatheredInfo);

        // Add assistant response to history
        history.push({ role: 'assistant', content: response });

        // Store updated history (keep last 20 messages to avoid token limits)
        if (history.length > 20) {
            history = history.slice(-20);
        }
        conversations.set(sessionId, history);

        res.json({
            response,
            extractedInfo,
            sessionId,
            persona: personaName
        });
    } catch (error) {
        console.error('Chat error:', error);
        res.status(500).json({
            error: 'Failed to process message',
            details: error.message
        });
    }
});

// Get conversation history
app.get('/api/conversation/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const history = conversations.get(sessionId) || [];
    res.json({ history });
});

// Clear conversation
app.delete('/api/conversation/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    conversations.delete(sessionId);
    res.json({ message: 'Conversation cleared' });
});

app.listen(PORT, () => {
    console.log(`🍯 Honeypot server running on http://localhost:${PORT}`);
    console.log(`📡 Ready to trap scammers...`);
});
