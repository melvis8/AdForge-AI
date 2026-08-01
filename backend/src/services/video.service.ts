import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const gemini = GEMINI_KEY ? new GoogleGenAI({ apiKey: GEMINI_KEY }) : null;

/**
 * Generate a promotional video using Google Veo 3.
 * Uses SDK to start the operation, then REST to poll (SDK polling is broken in v2.13).
 * Returns the video as a Buffer, or null on failure.
 */
export const generateVideo = async (
  title: string,
  description: string,
  posterUrl: string
): Promise<Buffer | null> => {
  if (!gemini || !GEMINI_KEY) {
    console.error('[Veo3] No Gemini client or API key');
    return null;
  }

  const prompt = `Create a compelling 8-second marketing video advertisement for: "${title}".

${description.substring(0, 300)}

Requirements:
- Dynamic, eye-catching motion for social media ads
- Smooth camera movements and transitions
- Professional, modern aesthetic with cinematic lighting
- High energy, attention-grabbing visual style
- Suitable for Instagram Reels / TikTok / YouTube Shorts`;

  try {
    console.log('[Veo3] Starting video generation...');
    const operation = await gemini.models.generateVideos({
      model: 'veo-3.1-generate-preview',
      prompt,
      config: {
        aspectRatio: '9:16',
        durationSeconds: 8,
      },
    });

    const operationName = (operation as any).name;
    if (!operationName) {
      console.error('[Veo3] No operation name returned');
      return null;
    }
    console.log(`[Veo3] Operation: ${operationName}`);

    // Poll using REST (SDK operations.get is broken in v2.13)
    const maxPolls = 60;
    for (let i = 0; i < maxPolls; i++) {
      await new Promise(r => setTimeout(r, 5000));

      try {
        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/${operationName}?key=${GEMINI_KEY}`
        );
        const status = await resp.json() as any;

        if (!resp.ok) {
          if (resp.status === 429) {
            console.error('[Veo3] Rate limited during polling');
            return null;
          }
          console.error(`[Veo3] Poll error: ${resp.status}`);
          continue;
        }

        if (status.done) {
          if (status.error) {
            console.error('[Veo3] Generation error:', JSON.stringify(status.error).substring(0, 200));
            return null;
          }

          const videoUri = status.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
          if (!videoUri) {
            console.error('[Veo3] No video URI in response');
            return null;
          }

          console.log(`[Veo3] Video ready, downloading...`);
          const downloadResponse = await fetch(videoUri);
          if (!downloadResponse.ok) {
            console.error(`[Veo3] Download failed: ${downloadResponse.status}`);
            return null;
          }

          const arrayBuffer = await downloadResponse.arrayBuffer();
          const videoBuffer = Buffer.from(arrayBuffer);
          console.log(`[Veo3] Downloaded: ${videoBuffer.length} bytes`);

          if (videoBuffer.length < 1000) {
            console.error('[Veo3] Video too small');
            return null;
          }

          return videoBuffer;
        }

        if (i % 6 === 0) {
          console.log(`[Veo3] Still generating... (${(i + 1) * 5}s elapsed)`);
        }
      } catch (pollErr: any) {
        console.error(`[Veo3] Poll error: ${pollErr?.message?.substring(0, 100)}`);
      }
    }

    console.error('[Veo3] Timeout after 5 minutes');
    return null;
  } catch (e: any) {
    const msg = e?.message || '';
    if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
      console.error('[Veo3] Rate limited — quota exhausted. Video will be skipped.');
    } else {
      console.error('[Veo3] Error:', msg.substring(0, 200));
    }
    return null;
  }
};
