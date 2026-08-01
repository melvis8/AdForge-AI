import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import os from 'os';

dotenv.config();

const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Generate a promotional video using Google Veo 3 via Gemini API.
 * Returns the video as a Buffer, or throws on failure.
 */
export const generateVideo = async (
  title: string,
  description: string,
  posterUrl: string
): Promise<Buffer | null> => {
  if (!GEMINI_KEY) {
    console.error('[Veo3] No GEMINI_API_KEY set');
    return null;
  }

  const prompt = `Create a compelling 8-second marketing video advertisement for: "${title}".

${description.substring(0, 300)}

Requirements:
- Dynamic, eye-catching motion that would work for social media ads
- Smooth camera movements, zoom effects
- Professional, modern aesthetic
- High energy, attention-grabbing
- Suitable for Instagram/TikTok/YouTube ads`;

  try {
    console.log('[Veo3] Starting video generation...');
    const startResponse = await fetch(
      `${BASE_URL}/models/veo-3.1-generate-preview:predictLongRunning?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instances: [{ prompt }],
          parameters: {
            aspectRatio: '9:16',
            durationSeconds: 8,
            sampleCount: 1,
            personGeneration: 'allow_adult',
            enhancePrompt: true,
          },
        }),
      }
    );

    if (!startResponse.ok) {
      const errText = await startResponse.text();
      console.error(`[Veo3] Start failed (${startResponse.status}):`, errText.substring(0, 200));
      return null;
    }

    const startData = await startResponse.json() as any;
    const operationName = startData.name;
    if (!operationName) {
      console.error('[Veo3] No operation name returned');
      return null;
    }
    console.log(`[Veo3] Operation: ${operationName}`);

    // Poll for completion (max 5 minutes)
    const maxPolls = 60;
    for (let i = 0; i < maxPolls; i++) {
      await new Promise(r => setTimeout(r, 5000));

      const statusResponse = await fetch(
        `${BASE_URL}/${operationName}?key=${GEMINI_KEY}`
      );

      if (!statusResponse.ok) {
        console.error(`[Veo3] Poll failed (${statusResponse.status})`);
        continue;
      }

      const statusData = await statusResponse.json() as any;

      if (statusData.done) {
        if (statusData.error) {
          console.error('[Veo3] Generation error:', JSON.stringify(statusData.error).substring(0, 200));
          return null;
        }

        // Extract video download URI
        const videoUri = statusData.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
        if (!videoUri) {
          console.error('[Veo3] No video URI in response');
          return null;
        }

        console.log(`[Veo3] Video ready, downloading from URI...`);

        // Download the video
        const downloadResponse = await fetch(videoUri);
        if (!downloadResponse.ok) {
          console.error(`[Veo3] Download failed: ${downloadResponse.status}`);
          return null;
        }

        const arrayBuffer = await downloadResponse.arrayBuffer();
        const videoBuffer = Buffer.from(arrayBuffer);
        console.log(`[Veo3] Downloaded: ${videoBuffer.length} bytes`);

        if (videoBuffer.length < 1000) {
          console.error('[Veo3] Video too small, likely corrupt');
          return null;
        }

        return videoBuffer;
      }

      const elapsed = (i + 1) * 5;
      if (i % 6 === 0) {
        console.log(`[Veo3] Still generating... (${elapsed}s elapsed)`);
      }
    }

    console.error('[Veo3] Timeout after 5 minutes');
    return null;
  } catch (e: any) {
    console.error('[Veo3] Error:', e?.message || e);
    return null;
  }
};
