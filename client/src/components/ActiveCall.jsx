import { useState, useEffect, useRef, useCallback } from 'react';
import { useVoice } from '../hooks/useVoice';
import './ActiveCall.css';

const PERSONA_VOICES = {
    grandma: 'en-US-JennyNeural',
    grandpa: 'en-US-GuyNeural',
    priya: 'en-IN-NeerjaNeural',
    uncle_bob: 'en-US-RogerNeural'
};

export default function ActiveCall() {
    const [personas, setPersonas] = useState([]);
    const [selectedPersona, setSelectedPersona] = useState('grandma');
    const [isActive, setIsActive] = useState(false);
    const [messages, setMessages] = useState([]);
    const [extractedData, setExtractedData] = useState({});
    const [scamType, setScamType] = useState('Unknown');
    const [escalationLevel, setEscalationLevel] = useState('cooperative');
    const [sessionId, setSessionId] = useState('');
    const [callDuration, setCallDuration] = useState(0);
    const [pastSessions, setPastSessions] = useState([]);
    const [showHistory, setShowHistory] = useState(false);
    const [totalTimeWasted, setTotalTimeWasted] = useState(0);
    const [callStartTime, setCallStartTime] = useState(null);

    const timerRef = useRef(null);
    const transcriptRef = useRef(null);
    const processingRef = useRef(false);

    const {
        isListening, isSpeaking, transcript, interimTranscript,
        startListening, stopListening, speak, stopSpeaking, isSupported
    } = useVoice();

    // Fetch personas
    useEffect(() => {
        fetch('/api/personas')
            .then(r => r.json())
            .then(data => setPersonas(data.personas || []))
            .catch(console.error);
    }, []);

    // Load past sessions
    useEffect(() => {
        fetch('/api/sessions')
            .then(r => r.json())
            .then(data => {
                setPastSessions(data.sessions || []);
                const total = (data.sessions || []).reduce((sum, s) => sum + (s.duration || 0), 0);
                setTotalTimeWasted(total);
            })
            .catch(console.error);
    }, []);

    // Call duration timer
    useEffect(() => {
        if (isActive) {
            timerRef.current = setInterval(() => {
                setCallDuration(d => d + 1);
            }, 1000);
        } else {
            clearInterval(timerRef.current);
        }
        return () => clearInterval(timerRef.current);
    }, [isActive]);

    // Process transcript
    useEffect(() => {
        if (transcript && isActive && !processingRef.current) {
            processingRef.current = true;
            handleUserMessage(transcript).finally(() => {
                processingRef.current = false;
            });
        }
    }, [transcript]);

    // Auto-scroll transcript
    useEffect(() => {
        if (transcriptRef.current) {
            transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
        }
    }, [messages]);

    const formatTime = (seconds) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const handleUserMessage = async (text) => {
        if (!text.trim()) return;

        const userMsg = { role: 'user', content: text, timestamp: Date.now() };
        setMessages(prev => [...prev, userMsg]);

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId,
                    message: text,
                    persona: selectedPersona,
                    gatheredInfo: extractedData
                })
            });

            const data = await response.json();

            if (data.response) {
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: data.response,
                    timestamp: Date.now()
                }]);

                if (data.extractedInfo) setExtractedData(data.extractedInfo);
                if (data.scamType) setScamType(data.scamType);
                if (data.escalationLevel) setEscalationLevel(data.escalationLevel);

                // Speak with persona-specific voice
                const voice = PERSONA_VOICES[selectedPersona] || 'en-US-JennyNeural';
                speak(data.response, voice);
            }
        } catch (error) {
            console.error('Chat error:', error);
            setMessages(prev => [...prev, {
                role: 'system',
                content: '⚠️ Connection error. Retrying...',
                timestamp: Date.now()
            }]);
        }
    };

    const startHoneypot = () => {
        const id = 'session_' + Date.now();
        setSessionId(id);
        setMessages([]);
        setExtractedData({});
        setScamType('Unknown');
        setEscalationLevel('cooperative');
        setCallDuration(0);
        setCallStartTime(new Date().toISOString());
        setIsActive(true);
        startListening();

        // Initial greeting
        const persona = personas.find(p => p.id === selectedPersona);
        const greetings = {
            grandma: "Hello? Who's calling please?",
            grandpa: "Yeah, hello? Who is this?",
            priya: "Hello? Haan, who is this?",
            uncle_bob: "Hello hello! Bob here, what can I do ya for?"
        };
        const greeting = greetings[selectedPersona] || "Hello?";
        const voice = PERSONA_VOICES[selectedPersona] || 'en-US-JennyNeural';

        setMessages([{ role: 'assistant', content: greeting, timestamp: Date.now() }]);
        speak(greeting, voice);
    };

    const endHoneypot = async () => {
        stopListening();
        stopSpeaking();
        setIsActive(false);

        // Save session
        try {
            await fetch('/api/sessions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId,
                    persona: selectedPersona,
                    duration: callDuration,
                    scamType,
                    extractedInfo: extractedData,
                    transcript: messages,
                    startTime: callStartTime
                })
            });

            // Refresh sessions
            const res = await fetch('/api/sessions');
            const data = await res.json();
            setPastSessions(data.sessions || []);
            setTotalTimeWasted(prev => prev + callDuration);
        } catch (e) {
            console.error('Failed to save session:', e);
        }
    };

    const skipInterrupt = () => {
        stopSpeaking();
    };

    // ===== REPORT EXPORT =====
    const exportReport = () => {
        const persona = personas.find(p => p.id === selectedPersona);
        let report = `═══════════════════════════════════════════\n`;
        report += `   🍯 AI HONEYPOT — SCAM INTELLIGENCE REPORT\n`;
        report += `═══════════════════════════════════════════\n\n`;
        report += `Date: ${new Date().toLocaleString()}\n`;
        report += `Persona Used: ${persona?.emoji || ''} ${persona?.name || selectedPersona}\n`;
        report += `Call Duration: ${formatTime(callDuration)}\n`;
        report += `Scam Type: ${scamType}\n`;
        report += `Escalation Level Reached: ${escalationLevel}\n\n`;

        report += `───── EXTRACTED INTELLIGENCE ─────\n\n`;
        const fields = [
            ['names', '👤 Names'], ['phoneNumbers', '📞 Phone Numbers'],
            ['upiIds', '💳 UPI IDs'], ['bankAccounts', '🏦 Bank Accounts'],
            ['bankNames', '🏛️ Banks'], ['claimedOrganization', '🏢 Organizations'],
            ['employeeId', '🪪 Employee IDs'], ['caseNumber', '📋 Case Numbers'],
            ['links', '🔗 URLs'], ['locations', '📍 Locations'],
            ['amounts', '💰 Amounts'], ['tactics', '⚠️ Tactics'],
            ['suspiciousKeywords', '🚩 Suspicious Keywords']
        ];

        fields.forEach(([key, label]) => {
            const val = extractedData[key];
            if (val && val.length > 0) {
                report += `${label}:\n`;
                (Array.isArray(val) ? val : [val]).forEach(v => { report += `  • ${v}\n`; });
                report += '\n';
            }
        });

        report += `───── FULL TRANSCRIPT ─────\n\n`;
        messages.forEach(m => {
            const who = m.role === 'user' ? '🔴 SCAMMER' : '🟢 AI HONEYPOT';
            report += `[${new Date(m.timestamp).toLocaleTimeString()}] ${who}:\n${m.content}\n\n`;
        });

        report += `═══════════════════════════════════════════\n`;
        report += `Generated by Shining Zenith AI Honeypot V3\n`;

        navigator.clipboard.writeText(report).then(() => {
            alert('📋 Report copied to clipboard! You can paste it into a cybercrime complaint.');
        }).catch(() => {
            // Fallback: download as file
            const blob = new Blob([report], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `honeypot-report-${sessionId}.txt`;
            a.click();
            URL.revokeObjectURL(url);
        });
    };

    // Intel count
    const intelCount = Object.values(extractedData).reduce((sum, val) =>
        sum + (Array.isArray(val) ? val.length : (val ? 1 : 0)), 0
    );

    const currentPersona = personas.find(p => p.id === selectedPersona);

    const escalationColors = {
        cooperative: '#10b981',
        curious: '#f59e0b',
        probing: '#f97316',
        bold: '#ef4444'
    };

    return (
        <div className="active-call-container">
            {/* Header */}
            <div className="header">
                <div className="logo">
                    <span className="logo-icon">🍯</span>
                    <div>
                        <h1>AI Honeypot <span className="version-badge">V3</span></h1>
                        <p className="subtitle">Maximum Intel Extraction</p>
                    </div>
                </div>
                <div className="header-stats">
                    {totalTimeWasted > 0 && (
                        <div className="total-time" title="Total scammer time wasted">
                            ⏱️ {formatTime(totalTimeWasted)} wasted
                        </div>
                    )}
                    <button className="history-btn" onClick={() => setShowHistory(!showHistory)}>
                        📜 {pastSessions.length} sessions
                    </button>
                </div>
            </div>

            {/* Session History Panel */}
            {showHistory && (
                <div className="history-panel">
                    <h3>📜 Past Sessions</h3>
                    {pastSessions.length === 0 ? (
                        <p className="empty-history">No sessions yet</p>
                    ) : (
                        pastSessions.slice().reverse().map((s, i) => (
                            <div key={i} className="history-item">
                                <div className="history-item-header">
                                    <span>{s.persona}</span>
                                    <span className="scam-badge-small">{s.scamType}</span>
                                </div>
                                <div className="history-item-detail">
                                    {formatTime(s.duration)} · {new Date(s.startTime).toLocaleDateString()}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}

            {/* Active Call Timer */}
            {isActive && (
                <div className="call-timer-bar">
                    <div className="timer-left">
                        <span className="rec-dot"></span>
                        <span className="timer-text">{formatTime(callDuration)}</span>
                    </div>
                    <div className="timer-center">
                        {scamType !== 'Unknown' && (
                            <span className="scam-badge" style={{
                                background: `${escalationColors[escalationLevel]}22`,
                                borderColor: escalationColors[escalationLevel]
                            }}>
                                🎯 {scamType}
                            </span>
                        )}
                    </div>
                    <div className="timer-right">
                        <span className="escalation-badge" style={{
                            color: escalationColors[escalationLevel]
                        }}>
                            {escalationLevel.toUpperCase()}
                        </span>
                    </div>
                </div>
            )}

            {/* Persona Selection */}
            {!isActive && (
                <div className="persona-section">
                    <h2>Select Persona</h2>
                    <div className="persona-grid">
                        {personas.map(p => (
                            <div
                                key={p.id}
                                className={`persona-card ${selectedPersona === p.id ? 'selected' : ''}`}
                                onClick={() => setSelectedPersona(p.id)}
                            >
                                <span className="persona-emoji">{p.emoji}</span>
                                <div className="persona-info">
                                    <strong>{p.name}</strong>
                                    <small>{p.description}</small>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Controls */}
            <div className="controls">
                {!isActive ? (
                    <button className="start-btn" onClick={startHoneypot} disabled={!isSupported}>
                        🍯 Hand-off Call to AI
                    </button>
                ) : (
                    <div className="active-controls">
                        <button className="skip-btn" onClick={skipInterrupt}>
                            ⏭️ Skip
                        </button>
                        <button className="end-btn" onClick={endHoneypot}>
                            📞 End Call
                        </button>
                        <button className="export-btn" onClick={exportReport}>
                            📋 Export
                        </button>
                    </div>
                )}
            </div>

            {/* Voice Status */}
            {isActive && (
                <div className="voice-status">
                    {isSpeaking ? (
                        <div className="status speaking">
                            <div className="wave-bars">
                                <span></span><span></span><span></span><span></span><span></span>
                            </div>
                            <span>{currentPersona?.name || 'AI'} is speaking...</span>
                        </div>
                    ) : isListening ? (
                        <div className="status listening">
                            <div className="pulse-ring"></div>
                            <span>🎙️ Listening...</span>
                            {interimTranscript && <p className="interim">{interimTranscript}</p>}
                        </div>
                    ) : (
                        <div className="status waiting">Processing...</div>
                    )}
                </div>
            )}

            {/* Transcript */}
            {isActive && (
                <div className="transcript-box" ref={transcriptRef}>
                    {messages.map((msg, i) => (
                        <div key={i} className={`message ${msg.role}`}>
                            <span className="msg-label">
                                {msg.role === 'user' ? '🔴 Scammer' : msg.role === 'assistant' ? `🟢 ${currentPersona?.name || 'AI'}` : '⚠️ System'}
                            </span>
                            <p>{msg.content}</p>
                        </div>
                    ))}
                </div>
            )}

            {/* Intelligence Panel */}
            {isActive && intelCount > 0 && (
                <div className="intel-panel">
                    <h3>🔍 Extracted Intelligence ({intelCount})</h3>
                    <div className="intel-grid">
                        {extractedData.names?.length > 0 && (
                            <div className="intel-item">
                                <span className="intel-label">👤 Names</span>
                                <span className="intel-value">{extractedData.names.join(', ')}</span>
                            </div>
                        )}
                        {extractedData.phoneNumbers?.length > 0 && (
                            <div className="intel-item">
                                <span className="intel-label">📞 Phone</span>
                                <span className="intel-value">{extractedData.phoneNumbers.join(', ')}</span>
                            </div>
                        )}
                        {extractedData.upiIds?.length > 0 && (
                            <div className="intel-item">
                                <span className="intel-label">💳 UPI</span>
                                <span className="intel-value">{extractedData.upiIds.join(', ')}</span>
                            </div>
                        )}
                        {extractedData.bankAccounts?.length > 0 && (
                            <div className="intel-item">
                                <span className="intel-label">🏦 Accounts</span>
                                <span className="intel-value">{extractedData.bankAccounts.join(', ')}</span>
                            </div>
                        )}
                        {extractedData.bankNames?.length > 0 && (
                            <div className="intel-item">
                                <span className="intel-label">🏛️ Banks</span>
                                <span className="intel-value">{extractedData.bankNames.join(', ')}</span>
                            </div>
                        )}
                        {extractedData.claimedOrganization?.length > 0 && (
                            <div className="intel-item">
                                <span className="intel-label">🏢 Org</span>
                                <span className="intel-value">{extractedData.claimedOrganization.join(', ')}</span>
                            </div>
                        )}
                        {extractedData.employeeId?.length > 0 && (
                            <div className="intel-item">
                                <span className="intel-label">🪪 Emp ID</span>
                                <span className="intel-value">{extractedData.employeeId.join(', ')}</span>
                            </div>
                        )}
                        {extractedData.caseNumber?.length > 0 && (
                            <div className="intel-item">
                                <span className="intel-label">📋 Case #</span>
                                <span className="intel-value">{extractedData.caseNumber.join(', ')}</span>
                            </div>
                        )}
                        {extractedData.locations?.length > 0 && (
                            <div className="intel-item">
                                <span className="intel-label">📍 Location</span>
                                <span className="intel-value">{extractedData.locations.join(', ')}</span>
                            </div>
                        )}
                        {extractedData.amounts?.length > 0 && (
                            <div className="intel-item">
                                <span className="intel-label">💰 Amounts</span>
                                <span className="intel-value">{extractedData.amounts.join(', ')}</span>
                            </div>
                        )}
                        {extractedData.links?.length > 0 && (
                            <div className="intel-item">
                                <span className="intel-label">🔗 URLs</span>
                                <span className="intel-value">{extractedData.links.join(', ')}</span>
                            </div>
                        )}
                        {extractedData.tactics?.length > 0 && (
                            <div className="intel-item full-width">
                                <span className="intel-label">⚠️ Tactics</span>
                                <span className="intel-value">{extractedData.tactics.join(', ')}</span>
                            </div>
                        )}
                        {extractedData.suspiciousKeywords?.length > 0 && (
                            <div className="intel-item full-width">
                                <span className="intel-label">🚩 Keywords</span>
                                <div className="keyword-tags">
                                    {extractedData.suspiciousKeywords.map((k, i) => (
                                        <span key={i} className="keyword-tag">{k}</span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
