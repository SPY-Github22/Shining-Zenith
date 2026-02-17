import { Communicate } from 'edge-tts-universal';
import fs from 'fs';

const logStream = fs.createWriteStream('test_log.txt', { flags: 'a' });
function log(msg) {
    console.log(msg);
    logStream.write(msg + '\n');
}

async function test() {
    try {
        log('Starting TTS test with Communicate...');
        const text = "Hello, this is a test.";
        const voice = "en-US-JennyNeural";

        const communicate = new Communicate(text, {
            voice: voice,
            rate: '-5%',
            pitch: '+0Hz',
            volume: '+0%'
        });

        log('Starting stream...');
        const audioChunks = [];

        // Add a timeout race
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout waiting for TTS')), 10000)
        );

        const streamPromise = (async () => {
            for await (const chunk of communicate.stream()) {
                if (chunk.type === "audio" && chunk.data) {
                    audioChunks.push(chunk.data);
                }
            }
            return audioChunks;
        })();

        await Promise.race([streamPromise, timeoutPromise]);

        log(`Stream finished. Received ${audioChunks.length} chunks.`);

        if (audioChunks.length > 0) {
            const audioBuffer = Buffer.concat(audioChunks);
            log(`Audio generated! Size: ${audioBuffer.length} bytes`);
            fs.writeFileSync('test_output.mp3', audioBuffer);
            log('Saved to test_output.mp3');
        } else {
            log('Error: No audio chunks received!');
        }

    } catch (error) {
        console.error('Test failed:', error);
        log('Test failed: ' + error.message);
        if (error.stack) log(error.stack);
    }
}

test();
