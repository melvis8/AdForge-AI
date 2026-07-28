import { fal } from '@fal-ai/client';
import dotenv from 'dotenv';
dotenv.config();

const FAL_KEY = process.env.FAL_API_KEY || '';

interface VideoResult {
  url: string;
  projectId: string;
}

if (FAL_KEY) {
  fal.config({ credentials: FAL_KEY });
}

/**
 * Creates a promotional video using fal.ai
 * Strategy: image-to-video from the generated poster, fallback to text-to-video
 */
export const createPromotionalVideo = async (
  title: string,
  description: string,
  posterUrl?: string,
  language: string = 'en'
): Promise<VideoResult> => {
  if (!FAL_KEY) {
    throw new Error('FAL_API_KEY not configured');
  }

  // Strategy 1: If we have a poster image, animate it into a video
  if (posterUrl) {
    try {
      console.log('[fal.ai] Generating video from poster image (Kling v3 image-to-video)...');
      const result = await fal.subscribe('fal-ai/kling-video/v3/pro/image-to-video', {
        input: {
          start_image_url: posterUrl,
          prompt: `Cinematic promotional video for "${title}". Smooth camera movement, professional lighting, vibrant brand colors, premium aesthetic. ${description.substring(0, 150)}`,
          duration: '5',
          generate_audio: false,
          negative_prompt: 'blur, distort, low quality, text, watermark',
          cfg_scale: 0.5,
        },
        logs: true,
        onQueueUpdate: (update: any) => {
          if (update.status === 'IN_PROGRESS') {
            update.logs?.map((log: any) => log.message).forEach(console.log);
          }
        },
      });

      const data = result.data as any;
      if (data?.video?.url) {
        console.log(`[fal.ai] Video generated: ${data.video.url}`);
        return { url: data.video.url, projectId: 'fal-kling-i2v' };
      }
    } catch (e: any) {
      console.error('[fal.ai] Kling image-to-video failed:', e?.message || e);
    }
  }

  // Strategy 2: Text-to-video
  try {
    console.log('[fal.ai] Generating video from text (Kling v3 text-to-video)...');
    const videoPrompt = `Professional promotional advertisement for "${title}". ${description.substring(0, 200)}. Cinematic lighting, smooth camera pan, vibrant colors, premium brand aesthetic, studio quality.`;

    const result = await fal.subscribe('fal-ai/kling-video/v3/pro/text-to-video', {
      input: {
        prompt: videoPrompt,
        duration: '5',
        aspect_ratio: '1:1',
        generate_audio: false,
        negative_prompt: 'blur, distort, low quality, text, watermark',
        cfg_scale: 0.5,
      },
      logs: true,
      onQueueUpdate: (update: any) => {
        if (update.status === 'IN_PROGRESS') {
          update.logs?.map((log: any) => log.message).forEach(console.log);
        }
      },
    });

    const data = result.data as any;
    if (data?.video?.url) {
      console.log(`[fal.ai] Text-to-video generated: ${data.video.url}`);
      return { url: data.video.url, projectId: 'fal-kling-t2v' };
    }
  } catch (e: any) {
    console.error('[fal.ai] Kling text-to-video failed:', e?.message || e);
  }

  throw new Error('fal.ai video generation failed - all methods exhausted');
};
