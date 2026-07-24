import dotenv from 'dotenv';
dotenv.config();

const API_KEY = process.env.JSON2VIDEO_API_KEY || '';
const API_BASE = 'https://api.json2video.com/v2/movies';

interface VideoResult {
  url: string;
  projectId: string;
}

/**
 * Creates a promotional video using the JSON2Video API.
 * Builds a multi-scene video from campaign data (title, description, poster image).
 */
export const createPromotionalVideo = async (
  title: string,
  description: string,
  posterUrl?: string
): Promise<VideoResult> => {
  const moviePayload = {
    resolution: 'sd',
    quality: 'high',
    scenes: [
      {
        comment: 'Intro scene',
        duration: 4,
        elements: [
          {
            type: 'shape',
            shape: 'rectangle',
            x: 0,
            y: 0,
            width: 640,
            height: 360,
            backgroundColor: '#0f172a',
          },
          {
            type: 'text',
            text: title || 'Your Campaign',
            x: 40,
            y: 80,
            width: 560,
            settings: {
              'font-family': 'Montserrat',
              'font-weight': '800',
              'font-size': '48px',
              color: '#38bdf8',
              'text-align': 'center',
            },
          },
          {
            type: 'text',
            text: 'Powered by AdForge AI',
            x: 40,
            y: 240,
            width: 560,
            settings: {
              'font-family': 'Montserrat',
              'font-size': '20px',
              color: '#94a3b8',
              'text-align': 'center',
            },
          },
        ],
        transition: {
          style: 'circleopen',
          duration: 0.5,
        },
      },
      {
        comment: 'Product showcase scene',
        duration: 5,
        elements: [
          ...(posterUrl
            ? [
                {
                  type: 'image' as const,
                  src: posterUrl,
                  x: 0,
                  y: 0,
                  width: 640,
                  height: 360,
                },
              ]
            : [
                {
                  type: 'shape' as const,
                  shape: 'rectangle' as const,
                  x: 0,
                  y: 0,
                  width: 640,
                  height: 360,
                  backgroundColor: '#1e293b',
                },
              ]),
          {
            type: 'text',
            text: description?.substring(0, 120) || 'Discover something amazing!',
            x: 20,
            y: 260,
            width: 600,
            settings: {
              'font-family': 'Montserrat',
              'font-weight': '600',
              'font-size': '24px',
              color: '#ffffff',
              'text-align': 'center',
              'background-color': 'rgba(15, 23, 42, 0.7)',
              padding: '12px',
              'border-radius': '8px',
            },
          },
        ],
        transition: {
          style: 'fade',
          duration: 0.5,
        },
      },
      {
        comment: 'Call to action scene',
        duration: 4,
        elements: [
          {
            type: 'shape',
            shape: 'rectangle',
            x: 0,
            y: 0,
            width: 640,
            height: 360,
            backgroundColor: '#0f172a',
          },
          {
            type: 'text',
            text: '🔥 Order Now!',
            x: 40,
            y: 100,
            width: 560,
            settings: {
              'font-family': 'Montserrat',
              'font-weight': '800',
              'font-size': '52px',
              color: '#f59e0b',
              'text-align': 'center',
            },
          },
          {
            type: 'text',
            text: 'Created with AdForge AI',
            x: 40,
            y: 260,
            width: 560,
            settings: {
              'font-family': 'Montserrat',
              'font-size': '18px',
              color: '#64748b',
              'text-align': 'center',
            },
          },
        ],
      },
    ],
  };

  console.log('[JSON2Video] Submitting video generation job...');

  // 1. Submit the video generation job
  const submitResponse = await fetch(API_BASE, {
    method: 'POST',
    headers: {
      'x-api-key': API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(moviePayload),
  });

  if (!submitResponse.ok) {
    const errorText = await submitResponse.text();
    console.error('[JSON2Video] Submit failed:', errorText);
    throw new Error(`JSON2Video submit failed: ${submitResponse.status}`);
  }

  const submitData = await submitResponse.json();
  const projectId = submitData.project;
  console.log(`[JSON2Video] Job submitted. Project ID: ${projectId}`);

  // 2. Poll for completion (max 2 minutes)
  const maxAttempts = 24;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5s between polls

    const statusResponse = await fetch(`${API_BASE}?project=${projectId}`, {
      method: 'GET',
      headers: { 'x-api-key': API_KEY },
    });

    if (!statusResponse.ok) continue;

    const statusData = await statusResponse.json();
    console.log(`[JSON2Video] Poll attempt ${attempt + 1}: status=${statusData.status}`);

    if (statusData.status === 'done') {
      return {
        url: statusData.url,
        projectId,
      };
    }

    if (statusData.status === 'error') {
      throw new Error(`JSON2Video render failed: ${statusData.message || 'unknown error'}`);
    }
  }

  throw new Error('JSON2Video render timed out after 2 minutes');
};
