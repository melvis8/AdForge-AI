import dotenv from 'dotenv';
dotenv.config();

const FAL_KEY = process.env.FAL_API_KEY || '';

interface VideoResult {
  url: string;
  projectId: string;
}

/**
 * Creates a promotional video using fal.ai
 * Takes the campaign poster image and animates it into a short video clip
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

  // If we have a poster image, animate it into a video
  if (posterUrl) {
    try {
      console.log('[fal.ai] Generating video from poster image...');
      
      const response = await fetch('https://queue.fal.run/fal-ai/fast-svd', {
        method: 'POST',
        headers: {
          'Authorization': `Key ${FAL_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image_url: posterUrl,
          motion_bucket_id: 127,
          noise_aug_strength: 0.02,
          num_frames: 25,
          fps: 6,
          seed: Math.floor(Math.random() * 999999),
        }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.video && result.video.url) {
          console.log(`[fal.ai] Video generated: ${result.video.url}`);
          return { url: result.video.url, projectId: 'fal-svd' };
        }
      }
      console.log(`[fal.ai] SVD response: ${response.status}`);
    } catch (e) {
      console.error('[fal.ai] SVD video failed:', e);
    }
  }

  // Fallback: Use MiniMax for text-to-video
  try {
    console.log('[fal.ai] Generating video with MiniMax...');
    
    const videoPrompt = `Professional promotional video for: ${title}. ${description.substring(0, 200)}. Cinematic lighting, smooth camera movement, premium brand aesthetic, vibrant colors.`;
    
    const response = await fetch('https://queue.fal.run/fal-ai/minimax-video', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${FAL_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: videoPrompt,
        num_seconds: 6,
      }),
    });

    if (response.ok) {
      const result = await response.json();
      if (result.video && result.video.url) {
        console.log(`[fal.ai] MiniMax video generated: ${result.video.url}`);
        return { url: result.video.url, projectId: 'fal-minimax' };
      }
    }
    console.log(`[fal.ai] MiniMax response: ${response.status}`);
  } catch (e) {
    console.error('[fal.ai] MiniMax video failed:', e);
  }

  throw new Error('fal.ai video generation failed');
};
