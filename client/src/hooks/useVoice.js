import { useState, useEffect, useRef, useCallback } from 'react';

export function useVoice() {
    const [isListening, setIsListening] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [interimTranscript, setInterimTranscript] = useState('');
    const [isSupported, setIsSupported] = useState(false);

    const recognitionRef = useRef(null);
    const synthRef = useRef(null);
    const isListeningRef = useRef(false);
    const isSpeakingRef = useRef(false);

    useEffect(() => {
        isListeningRef.current = isListening;
    }, [isListening]);

    useEffect(() => {
        isSpeakingRef.current = isSpeaking;
    }, [isSpeaking]);

    useEffect(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const speechSynthesis = window.speechSynthesis;

        if (SpeechRecognition && speechSynthesis) {
            setIsSupported(true);
            synthRef.current = speechSynthesis;
            speechSynthesis.getVoices();

            const recognition = new SpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = 'en-US';
            recognition.maxAlternatives = 1;

            recognition.onstart = () => {
                console.log('🎤 Speech recognition started');
            };

            recognition.onresult = (event) => {
                // CRITICAL: Ignore results while speaking
                if (isSpeakingRef.current) {
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
                    setTranscript(prev => prev + final);
                }
                setInterimTranscript(interim);
            };

            recognition.onerror = (event) => {
                console.error('❌ Speech recognition error:', event.error);
                if (event.error === 'no-speech' || event.error === 'aborted') {
                    if (isListeningRef.current && !isSpeakingRef.current) {
                        setTimeout(() => {
                            try {
                                recognition.start();
                            } catch (e) { }
                        }, 100);
                    }
                }
            };

            recognition.onend = () => {
                console.log('🔇 Speech recognition ended');
                if (isListeningRef.current && !isSpeakingRef.current) {
                    setTimeout(() => {
                        try {
                            recognition.start();
                        } catch (e) { }
                    }, 100);
                }
            };

            recognitionRef.current = recognition;
        }

        return () => {
            if (recognitionRef.current) {
                try { recognitionRef.current.stop(); } catch (e) { }
            }
        };
    }, []);

    const pauseListening = useCallback(() => {
        if (recognitionRef.current && isListeningRef.current) {
            try {
                recognitionRef.current.stop();
                console.log('⏸️ Paused listening');
            } catch (e) { }
        }
    }, []);

    const resumeListening = useCallback(() => {
        if (recognitionRef.current && isListeningRef.current && !isSpeakingRef.current) {
            // Clear output buffers before resuming
            setInterimTranscript('');

            try {
                recognitionRef.current.start();
                console.log('▶️ Resumed listening');
            } catch (e) {
                if (!e.message?.includes('already started')) {
                    console.log('Could not resume:', e);
                }
            }
        }
    }, []);

    const clearTranscript = useCallback(() => {
        setTranscript('');
        setInterimTranscript('');
    }, []);

    const stopSpeaking = useCallback(() => {
        if (synthRef.current) {
            synthRef.current.cancel();
            setIsSpeaking(false);
            isSpeakingRef.current = false;

            // Clear any buffered input that might have been captured
            setInterimTranscript('');

            // Resume listening
            resumeListening();
        }
    }, [resumeListening]);

    const speak = useCallback((text, onEnd, persona = 'grandma') => {
        if (synthRef.current) {
            synthRef.current.cancel();
            pauseListening();

            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'en-US';

            const voices = synthRef.current.getVoices();

            if (persona === 'grandpa') {
                utterance.rate = 0.85;
                utterance.pitch = 0.8;
                const maleVoice = voices.find(voice =>
                    voice.name.includes('Male') || voice.name.includes('David') ||
                    voice.name.includes('Mark') || voice.name.includes('Daniel')
                );
                if (maleVoice) utterance.voice = maleVoice;
            } else {
                utterance.rate = 0.9;
                utterance.pitch = 1.1;
                const femaleVoice = voices.find(voice =>
                    voice.name.includes('Female') || voice.name.includes('Samantha') ||
                    voice.name.includes('Zira') || voice.name.includes('Susan')
                );
                if (femaleVoice) utterance.voice = femaleVoice;
            }

            utterance.onstart = () => {
                setIsSpeaking(true);
                isSpeakingRef.current = true;
            };

            utterance.onend = () => {
                setIsSpeaking(false);
                isSpeakingRef.current = false;
                setTimeout(() => {
                    resumeListening();
                    if (onEnd) onEnd();
                }, 300);
            };

            utterance.onerror = () => {
                setIsSpeaking(false);
                isSpeakingRef.current = false;
                resumeListening();
            };

            synthRef.current.speak(utterance);
        }
    }, [pauseListening, resumeListening]);

    const startListening = useCallback(() => {
        if (recognitionRef.current && !isListeningRef.current) {
            setTranscript('');
            setInterimTranscript('');
            isListeningRef.current = true;
            setIsListening(true);
            try { recognitionRef.current.start(); } catch (e) { }
        }
    }, []);

    const stopListening = useCallback(() => {
        isListeningRef.current = false;
        setIsListening(false);
        if (recognitionRef.current) {
            try { recognitionRef.current.stop(); } catch (e) { }
        }
    }, []);

    return {
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
    };
}
