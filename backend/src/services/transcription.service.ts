import { AssemblyAI } from 'assemblyai';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const ASSEMBLYAI_KEY = process.env.ASSEMBLYAI_API_KEY || '';
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';

let assemblyClient: AssemblyAI | null = null;
if (ASSEMBLYAI_KEY) {
  assemblyClient = new AssemblyAI({ apiKey: ASSEMBLYAI_KEY });
}

const gemini = GEMINI_KEY ? new GoogleGenAI({ apiKey: GEMINI_KEY }) : null;

/**
 * Transcribes an audio file. Tries AssemblyAI first, falls back to Gemini.
 * Accepts a local file path (from multer upload) and returns the transcribed text.
 */
export const transcribeAudioFile = async (filePath: string): Promise<string> => {
  console.log(`[Transcription] Starting for: ${filePath}`);

  // Try AssemblyAI first
  if (assemblyClient) {
    try {
      console.log('[Transcription] Trying AssemblyAI...');
      const transcript = await assemblyClient.transcripts.transcribe({
        audio: filePath,
      });

      if (transcript.status === 'error') {
        console.error('[Transcription] AssemblyAI error:', transcript.error);
        throw new Error(`AssemblyAI failed: ${transcript.error}`);
      }

      const text = transcript.text || '';
      console.log(`[Transcription] AssemblyAI complete: "${text.substring(0, 80)}..."`);
      cleanupFile(filePath);
      return text;
    } catch (e: any) {
      console.error('[Transcription] AssemblyAI failed:', e?.message?.substring(0, 100));
      console.log('[Transcription] Falling back to Gemini...');
    }
  }

  // Fallback: Gemini audio understanding
  if (gemini) {
    try {
      console.log('[Transcription] Using Gemini for audio transcription...');
      const audioBuffer = fs.readFileSync(filePath);
      const base64Audio = audioBuffer.toString('base64');

      // Determine MIME type from file extension
      const ext = filePath.split('.').pop()?.toLowerCase() || 'caf';
      const mimeMap: Record<string, string> = {
        caf: 'audio/x-caf',
        m4a: 'audio/m4a',
        mp3: 'audio/mpeg',
        wav: 'audio/wav',
        ogg: 'audio/ogg',
        webm: 'audio/webm',
      };
      const mimeType = mimeMap[ext] || 'audio/x-caf';

      const response = await gemini.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: [
          {
            inlineData: {
              mimeType,
              data: base64Audio,
            },
          },
          'Please transcribe this audio exactly as spoken. Output only the transcription text, nothing else.',
        ],
      });

      const text = (response as any).text || '';
      const cleaned = typeof text === 'function' ? text() : text;
      console.log(`[Transcription] Gemini complete: "${cleaned.substring(0, 80)}..."`);
      cleanupFile(filePath);
      return cleaned.trim();
    } catch (e: any) {
      console.error('[Transcription] Gemini also failed:', e?.message?.substring(0, 100));
    }
  }

  cleanupFile(filePath);
  throw new Error('All transcription services failed. Please type your prompt instead.');
};

/**
 * Gemini Text-to-Speech: converts text to spoken audio.
 * Returns a Buffer of the audio file, or null on failure.
 */
export const textToSpeech = async (text: string, voiceName: string = 'Kore'): Promise<Buffer | null> => {
  if (!gemini) {
    console.error('[TTS] No Gemini API key');
    return null;
  }

  try {
    console.log(`[TTS] Generating speech for ${text.length} chars (voice: ${voiceName})...`);

    const response = await gemini.models.generateContent({
      model: 'gemini-2.5-flash-preview-tts',
      contents: text,
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName,
            },
          },
        },
      },
    });

    const parts = (response as any).candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (part.inlineData?.data) {
        const audioBuffer = Buffer.from(part.inlineData.data, 'base64');
        console.log(`[TTS] Generated ${audioBuffer.length} bytes of audio`);
        return audioBuffer;
      }
    }

    console.error('[TTS] No audio data in response');
    return null;
  } catch (e: any) {
    console.error('[TTS] Error:', e?.message?.substring(0, 120));
    return null;
  }
};

function cleanupFile(filePath: string) {
  try {
    fs.unlinkSync(filePath);
  } catch (e) {
    // Ignore cleanup errors
  }
}
