import { AssemblyAI } from 'assemblyai';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const client = new AssemblyAI({
  apiKey: process.env.ASSEMBLYAI_API_KEY || '',
});

/**
 * Transcribes an audio file using AssemblyAI.
 * Accepts a local file path (from multer upload) and returns the transcribed text.
 */
export const transcribeAudioFile = async (filePath: string): Promise<string> => {
  console.log(`[AssemblyAI] Starting transcription for: ${filePath}`);

  try {
    const transcript = await client.transcripts.transcribe({
      audio: filePath,
    });

    if (transcript.status === 'error') {
      console.error('[AssemblyAI] Transcription error:', transcript.error);
      throw new Error(`Transcription failed: ${transcript.error}`);
    }

    const text = transcript.text || '';
    console.log(`[AssemblyAI] Transcription complete: "${text.substring(0, 80)}..."`);

    // Clean up the uploaded file after transcription
    try {
      fs.unlinkSync(filePath);
    } catch (e) {
      // Ignore cleanup errors
    }

    return text;
  } catch (error) {
    console.error('[AssemblyAI] Error:', error);
    throw error;
  }
};
