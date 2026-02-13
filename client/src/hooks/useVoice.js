import { useState, useRef, useCallback, useEffect } from 'react';

export function useVoice() {
    const [isListening, setIsListening] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [interimTranscript, setInterimTranscript] = useState('');

    const recognition = useRef(null);
    const audioRef = useRef(null);
    const silenceTimer = useRef(null);
    const isListeningRef = useRef(false);

    // Initialize Speech Recognition
    useEffect(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            console.error('Speech Recognition not supported');
            return;
        }

        const recog = new SpeechRecognition();
        recog.continuous = true;
        recog.interimResults = true;
        recog.lang = 'en-US';
        recog.maxAlternatives = 1;

        recog.onresult = (event) => {
            let interim = '';
            let final = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const text = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    final += text;
                } else {
                    interim += text;
                }
            }

            if (final) {
                setTranscript(final.trim());
                setInterimTranscript('');
            } else {
                setInterimTranscript(interim);
            }

            // Reset silence timer
            clearTimeout(silenceTimer.current);
            silenceTimer.current = setTimeout(() => {
                if (interim && isListeningRef.current) {
                    setTranscript(interim.trim());
                    setInterimTranscript('');
                }
            }, 2000);
        };

        recog.onerror = (event) => {
            if (event.error !== 'no-speech' && event.error !== 'aborted') {
                console.error('Speech recognition error:', event.error);
            }
        };

        recog.onend = () => {
            if (isListeningRef.current) {
                try { recog.start(); } catch (e) { /* already started */ }
            }
        };

        recognition.current = recog;

        return () => {
            clearTimeout(silenceTimer.current);
            try { recog.stop(); } catch (e) { /* not started */ }
        };
    }, []);

    const startListening = useCallback(() => {
        if (!recognition.current) return;
        setTranscript('');
        setInterimTranscript('');
        isListeningRef.current = true;
        setIsListening(true);
        try { recognition.current.start(); } catch (e) { /* restart */ }
    }, []);

    const stopListening = useCallback(() => {
        isListeningRef.current = false;
        setIsListening(false);
        clearTimeout(silenceTimer.current);
        try { recognition.current?.stop(); } catch (e) { /* not started */ }
    }, []);

    const pauseListening = useCallback(() => {
        try { recognition.current?.stop(); } catch (e) { /* not started */ }
    }, []);

    const resumeListening = useCallback(() => {
        if (isListeningRef.current) {
            try { recognition.current?.start(); } catch (e) { /* already started */ }
        }
    }, []);

    // ===== EDGE TTS PLAYBACK =====
    const speak = useCallback(async (text, voice = 'en-US-JennyNeural') => {
        if (!text) return;

        // Stop any current audio
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
        }

        // Pause mic while speaking (avoid feedback)
        pauseListening();
        setIsSpeaking(true);

        try {
            const response = await fetch('/api/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, voice })
            });

            if (!response.ok) throw new Error('TTS request failed');

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const audio = new Audio(url);
            audioRef.current = audio;

            audio.onended = () => {
                setIsSpeaking(false);
                URL.revokeObjectURL(url);
                audioRef.current = null;
                // Resume listening after speech ends
                setTimeout(() => resumeListening(), 300);
            };

            audio.onerror = () => {
                setIsSpeaking(false);
                URL.revokeObjectURL(url);
                audioRef.current = null;
                resumeListening();
            };

            await audio.play();
        } catch (error) {
            console.error('Edge TTS error:', error);
            setIsSpeaking(false);
            resumeListening();

            // Fallback to browser TTS if Edge TTS fails
            fallbackSpeak(text);
        }
    }, [pauseListening, resumeListening]);

    // Browser TTS fallback
    const fallbackSpeak = useCallback((text) => {
        if (!window.speechSynthesis) return;

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.9;
        utterance.pitch = 1.0;

        utterance.onend = () => {
            setIsSpeaking(false);
            setTimeout(() => resumeListening(), 300);
        };

        setIsSpeaking(true);
        pauseListening();
        window.speechSynthesis.speak(utterance);
    }, [pauseListening, resumeListening]);

    // Stop speaking
    const stopSpeaking = useCallback(() => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
        }
        window.speechSynthesis?.cancel();
        setIsSpeaking(false);
        resumeListening();
    }, [resumeListening]);

    return {
        isListening,
        isSpeaking,
        transcript,
        interimTranscript,
        startListening,
        stopListening,
        speak,
        stopSpeaking,
        isSupported: !!(window.SpeechRecognition || window.webkitSpeechRecognition)
    };
}
