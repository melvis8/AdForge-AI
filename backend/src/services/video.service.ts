import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const gemini = GEMINI_KEY ? new GoogleGenAI({ apiKey: GEMINI_KEY }) : null;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Try Gemini Omni Flash first (simpler, faster, $0.10/sec).
 * Falls back to Veo 3.1 if Omni Flash is unavailable.
 */
export const generateVideo = async (
  title: string,
  description: string,
  posterUrl: string
): Promise<Buffer | null> => {
  if (!gemini || !GEMINI_KEY) {
    console.error('[Video] No Gemini client or API key');
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

  // Try Omni Flash first (uses generateContent with VIDEO modality)
  const omniResult = await tryOmniFlash(prompt);
  if (omniResult) return omniResult;

  // Fallback to Veo 3.1 (uses generateVideos + polling)
  console.log('[Video] Omni Flash unavailable, trying Veo 3.1...');
  const veoResult = await tryVeo3(prompt);
  if (veoResult) return veoResult;

  console.error('[Video] All video generation methods failed');
  return null;
};

/**
 * Gemini Omni Flash: text-to-video via generateContent with VIDEO responseModalities.
 * Simpler API, no polling needed — returns video directly.
 */
const tryOmniFlash = async (prompt: string): Promise<Buffer | null> => {
  try {
    console.log('[Omni Flash] Starting video generation...');
    const r = await gemini!.models.generateContent({
      model: 'gemini-omni-flash-preview',
      contents: prompt,
      config: {
        responseModalities: ['VIDEO'],
        videoConfig: { durationSeconds: 8, resolution: '720p' },
      } as any,
    });

    const parts = (r as any).candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (part.inlineData?.data) {
        const buf = Buffer.from(part.inlineData.data, 'base64');
        if (buf.length > 1000) {
          console.log(`[Omni Flash] Generated ${buf.length} bytes`);
          return buf;
        }
      }
    }
    console.error('[Omni Flash] No video in response');
    return null;
  } catch (e: any) {
    const msg = e?.message || '';
    if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
      console.error('[Omni Flash] Quota exhausted');
    } else {
      console.error('[Omni Flash] Error:', msg.substring(0, 200));
    }
    return null;
  }
};

/**
 * Veo 3.1: text-to-video via generateVideos + REST polling.
 * Higher quality but requires async polling.
 */
const tryVeo3 = async (prompt: string): Promise<Buffer | null> => {
  try {
    console.log('[Veo3] Starting video generation...');
    const operation = await gemini!.models.generateVideos({
      model: 'veo-3.1-generate-preview',
      prompt,
      config: {
        aspectRatio: '9:16',
        durationSeconds: 8,
      },
    });

    const operationName = (operation as any).name;
    if (!operationName) {
      console.error('[Veo3] No operation name');
      return null;
    }
    console.log(`[Veo3] Operation: ${operationName}`);

    // Poll using REST (SDK operations.get is broken in v2.13)
    const maxPolls = 60;
    for (let i = 0; i < maxPolls; i++) {
      await sleep(5000);

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
          continue;
        }

        if (status.done) {
          if (status.error) {
            console.error('[Veo3] Error:', JSON.stringify(status.error).substring(0, 200));
            return null;
          }

          const videoUri = status.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
          if (!videoUri) {
            console.error('[Veo3] No video URI');
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
          return videoBuffer.length > 1000 ? videoBuffer : null;
        }

        if (i % 6 === 0) {
          console.log(`[Veo3] Still generating... (${(i + 1) * 5}s)`);
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
      console.error('[Veo3] Quota exhausted');
    } else {
      console.error('[Veo3] Error:', msg.substring(0, 200));
    }
    return null;
  }
};
