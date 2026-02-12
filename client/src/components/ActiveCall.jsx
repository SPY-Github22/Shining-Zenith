import { useState, useEffect, useRef } from 'react';
import { useVoice } from '../hooks/useVoice';
import './ActiveCall.css';

const PERSONAS = {
    grandma: { id: 'grandma', name: 'Margaret', age: 68, emoji: '👵', description: 'Retired Teacher' },
    grandpa: { id: 'grandpa', name: 'Harold', age: 72, emoji: '👴', description: 'Retired Engineer' }
};

export default function ActiveCall() {
    const [sessionId] = useState(() => 'session_' + Date.now());
    const [selectedPersona, setSelectedPersona] = useState('grandma');
    const [messages, setMessages] = useState([]);
    const [extractedData, setExtractedData] = useState({
        names: [],
        phoneNumbers: [],
        upiIds: [],
        bankAccounts: [],
        bankNames: [],
        links: [],
        suspiciousKeywords: [],
        claimedOrganization: [],
        employeeId: [],
        caseNumber: []
    });
    const [isActive, setIsActive] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    const {
        isSupported,
        isListening,
        isSpeaking,
        transcript,
        interimTranscript,
        startListening,
        stopListening,
        clearTranscript,
        speak,
        stopSpeaking
    } = useVoice();

    const messagesEndRef = useRef(null);
    const lastProcessedRef = useRef('');
    const silenceTimeoutRef = useRef(null);
    const lastTranscriptRef = useRef('');

    const SILENCE_DURATION = 2500;

    const persona = PERSONAS[selectedPersona];

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Smart silence detection
    useEffect(() => {
        if (silenceTimeoutRef.current) {
            clearTimeout(silenceTimeoutRef.current);
            silenceTimeoutRef.current = null;
        }

        if (!isActive || isProcessing || isSpeaking) {
            return;
        }

        const currentTranscript = (transcript + ' ' + interimTranscript).trim();

        if (currentTranscript !== lastTranscriptRef.current) {
            lastTranscriptRef.current = currentTranscript;
        }

        const finalTranscript = transcript.trim();
        if (finalTranscript && finalTranscript !== lastProcessedRef.current && finalTranscript.length > 2) {
            silenceTimeoutRef.current = setTimeout(() => {
                const stillSameTranscript = transcript.trim() === finalTranscript;
                const noInterimSpeech = !interimTranscript || interimTranscript.trim().length === 0;

                if (stillSameTranscript && noInterimSpeech && finalTranscript !== lastProcessedRef.current) {
                    handleUserMessage(finalTranscript);
                    lastProcessedRef.current = finalTranscript;
                }
            }, SILENCE_DURATION);
        }

        return () => {
            if (silenceTimeoutRef.current) {
                clearTimeout(silenceTimeoutRef.current);
            }
        };
    }, [transcript, interimTranscript, isActive, isProcessing, isSpeaking]);

    const handleInterrupt = () => {
        stopSpeaking();
        setIsProcessing(false);
        lastProcessedRef.current = transcript.trim();
    };

    const handleUserMessage = async (text) => {
        setIsProcessing(true);

        const userMsg = { role: 'user', content: text, timestamp: Date.now() };
        setMessages(prev => [...prev, userMsg]);
        clearTranscript();
        lastTranscriptRef.current = '';

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId,
                    message: text,
                    persona: selectedPersona,
                    gatheredInfo: extractedData // Send what we already know
                })
            });

            const data = await response.json();

            const aiMsg = { role: 'assistant', content: data.response, timestamp: Date.now() };
            setMessages(prev => [...prev, aiMsg]);

            if (data.extractedInfo) {
                setExtractedData(prev => ({
                    names: [...new Set([...prev.names, ...(data.extractedInfo.names || [])])],
                    phoneNumbers: [...new Set([...prev.phoneNumbers, ...(data.extractedInfo.phoneNumbers || [])])],
                    upiIds: [...new Set([...prev.upiIds, ...(data.extractedInfo.upiIds || [])])],
                    bankAccounts: [...new Set([...prev.bankAccounts, ...(data.extractedInfo.bankAccounts || [])])],
                    bankNames: [...new Set([...prev.bankNames, ...(data.extractedInfo.bankNames || [])])],
                    links: [...new Set([...prev.links, ...(data.extractedInfo.links || [])])],
                    suspiciousKeywords: [...new Set([...prev.suspiciousKeywords, ...(data.extractedInfo.suspiciousKeywords || [])])],
                    claimedOrganization: [...new Set([...prev.claimedOrganization, ...(data.extractedInfo.claimedOrganization || [])])],
                    employeeId: [...new Set([...prev.employeeId, ...(data.extractedInfo.employeeId || [])])],
                    caseNumber: [...new Set([...prev.caseNumber, ...(data.extractedInfo.caseNumber || [])])]
                }));
            }

            // Pass persona to speak for correct voice selection
            speak(data.response, () => {
                setIsProcessing(false);
                lastProcessedRef.current = '';
            }, selectedPersona);

        } catch (error) {
            console.error('Error sending message:', error);
            const errorMsg = {
                role: 'system',
                content: 'Connection error. Please check if the server is running.',
                timestamp: Date.now()
            };
            setMessages(prev => [...prev, errorMsg]);
            setIsProcessing(false);
        }
    };

    const startHoneypot = () => {
        setIsActive(true);
        lastProcessedRef.current = '';
        lastTranscriptRef.current = '';
        startListening();

        const greeting = selectedPersona === 'grandpa'
            ? "Hello? Who's calling?"
            : "Hello? Who is this?";
        setMessages([{ role: 'assistant', content: greeting, timestamp: Date.now() }]);
        speak(greeting, () => { });
    };

    const stopHoneypot = () => {
        setIsActive(false);
        setIsProcessing(false);
        stopListening();
        stopSpeaking();
        if (silenceTimeoutRef.current) {
            clearTimeout(silenceTimeoutRef.current);
        }
    };

    if (!isSupported) {
        return (
            <div className="error-container">
                <h2>⚠️ Voice Not Supported</h2>
                <p>Your browser doesn't support Web Speech API. Please use Chrome, Edge, or Safari.</p>
            </div>
        );
    }

    const displayTranscript = (transcript + ' ' + interimTranscript).trim();

    const hasInfo = extractedData.names.length > 0 ||
        extractedData.phoneNumbers.length > 0 ||
        extractedData.upiIds.length > 0 ||
        extractedData.bankAccounts.length > 0 ||
        extractedData.bankNames.length > 0 ||
        extractedData.claimedOrganization.length > 0 ||
        extractedData.employeeId.length > 0 ||
        extractedData.caseNumber.length > 0;

    return (
        <div className="active-call-container">
            {/* Header */}
            <header className="call-header">
                <div className="header-content">
                    <h1>🍯 AI Honeypot</h1>
                    <p className="subtitle">Scam Defense System</p>
                </div>
                {isActive && (
                    <div className="status-indicator">
                        <span className="pulse-dot"></span>
                        <span>Active</span>
                    </div>
                )}
            </header>

            <div className="main-content">
                {/* Call Interface */}
                <div className="call-section">
                    {/* Persona Selector - only show when not active */}
                    {!isActive && (
                        <div className="persona-selector">
                            <h3>Select Persona</h3>
                            <div className="persona-options">
                                {Object.values(PERSONAS).map(p => (
                                    <button
                                        key={p.id}
                                        className={`persona-option ${selectedPersona === p.id ? 'selected' : ''}`}
                                        onClick={() => setSelectedPersona(p.id)}
                                    >
                                        <span className="persona-emoji">{p.emoji}</span>
                                        <span className="persona-name">{p.name}</span>
                                        <span className="persona-age">{p.age} y/o</span>
                                        <span className="persona-role">{p.description}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Active Persona Card */}
                    <div className="persona-card">
                        <div className="avatar">{persona.emoji}</div>
                        <h2>{persona.name}</h2>
                        <p className="persona-desc">{persona.age} years old · {persona.description}</p>
                    </div>

                    {/* Control Buttons */}
                    <div className="control-buttons">
                        {!isActive ? (
                            <button className="start-btn" onClick={startHoneypot}>
                                <span className="btn-icon">📞</span>
                                <span>Hand-off Call to AI</span>
                            </button>
                        ) : (
                            <>
                                <button className="stop-btn" onClick={stopHoneypot}>
                                    <span className="btn-icon">🛑</span>
                                    <span>End Call</span>
                                </button>
                                {isSpeaking && (
                                    <button className="interrupt-btn" onClick={handleInterrupt}>
                                        <span className="btn-icon">⏭️</span>
                                        <span>Skip / Interrupt</span>
                                    </button>
                                )}
                            </>
                        )}
                    </div>

                    {isActive && (
                        <div className="voice-status">
                            <div className={`voice-indicator ${isListening ? 'listening' : ''} ${isSpeaking ? 'speaking' : ''}`}>
                                <div className="wave-container">
                                    <div className="wave"></div>
                                    <div className="wave"></div>
                                    <div className="wave"></div>
                                </div>
                            </div>
                            <p className="status-text">
                                {isProcessing ? '⏳ Thinking...' : isSpeaking ? `🗣️ ${persona.name} is speaking...` : isListening ? '👂 Listening...' : '⏸️ Idle'}
                            </p>
                            {displayTranscript && !isSpeaking && (
                                <div className="live-transcript">
                                    <span className="live-label">Hearing:</span> {displayTranscript}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Transcript */}
                    <div className="transcript-box">
                        <h3>📝 Live Transcript</h3>
                        <div className="messages">
                            {messages.map((msg, idx) => (
                                <div key={idx} className={`message ${msg.role}`}>
                                    <span className="message-label">
                                        {msg.role === 'user' ? '🎭 Scammer' : msg.role === 'assistant' ? `${persona.emoji} ${persona.name}` : '⚙️ System'}:
                                    </span>
                                    <span className="message-content">{msg.content}</span>
                                </div>
                            ))}
                            <div ref={messagesEndRef} />
                        </div>
                    </div>
                </div>

                {/* Intelligence Panel */}
                <div className="intel-section">
                    {/* Information Captured */}
                    <div className="intel-card captured-info">
                        <h2>🎯 Information Captured</h2>
                        {hasInfo ? (
                            <div className="captured-grid">
                                {extractedData.names.length > 0 && (
                                    <div className="captured-item">
                                        <span className="captured-label">👤 Name:</span>
                                        <span className="captured-value">{extractedData.names.join(', ')}</span>
                                    </div>
                                )}
                                {extractedData.phoneNumbers.length > 0 && (
                                    <div className="captured-item">
                                        <span className="captured-label">📞 Phone:</span>
                                        <span className="captured-value">{extractedData.phoneNumbers.join(', ')}</span>
                                    </div>
                                )}
                                {extractedData.claimedOrganization.length > 0 && (
                                    <div className="captured-item">
                                        <span className="captured-label">🏢 Claimed Org:</span>
                                        <span className="captured-value">{extractedData.claimedOrganization.join(', ')}</span>
                                    </div>
                                )}
                                {extractedData.employeeId.length > 0 && (
                                    <div className="captured-item">
                                        <span className="captured-label">🪪 Employee ID:</span>
                                        <span className="captured-value">{extractedData.employeeId.join(', ')}</span>
                                    </div>
                                )}
                                {extractedData.caseNumber.length > 0 && (
                                    <div className="captured-item">
                                        <span className="captured-label">📋 Case/Ref #:</span>
                                        <span className="captured-value">{extractedData.caseNumber.join(', ')}</span>
                                    </div>
                                )}
                                {extractedData.bankNames.length > 0 && (
                                    <div className="captured-item">
                                        <span className="captured-label">🏦 Bank:</span>
                                        <span className="captured-value">{extractedData.bankNames.join(', ')}</span>
                                    </div>
                                )}
                                {extractedData.bankAccounts.length > 0 && (
                                    <div className="captured-item">
                                        <span className="captured-label">💳 Account:</span>
                                        <span className="captured-value danger">{extractedData.bankAccounts.join(', ')}</span>
                                    </div>
                                )}
                                {extractedData.upiIds.length > 0 && (
                                    <div className="captured-item">
                                        <span className="captured-label">💸 UPI ID:</span>
                                        <span className="captured-value danger">{extractedData.upiIds.join(', ')}</span>
                                    </div>
                                )}
                                {extractedData.links.length > 0 && (
                                    <div className="captured-item">
                                        <span className="captured-label">🔗 Link:</span>
                                        <span className="captured-value warning">{extractedData.links.join(', ')}</span>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <p className="empty-state">No scammer information captured yet. Keep them talking!</p>
                        )}
                    </div>

                    {/* Suspicious Keywords */}
                    <div className="intel-card">
                        <h3>⚠️ Suspicious Keywords Detected</h3>
                        <div className="intel-tags">
                            {extractedData.suspiciousKeywords.length > 0 ? (
                                extractedData.suspiciousKeywords.map((keyword, idx) => (
                                    <span key={idx} className="keyword-tag">{keyword}</span>
                                ))
                            ) : (
                                <p className="empty-state">No keywords detected yet</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
