import dotenv from 'dotenv';
dotenv.config();

const API_KEY = process.env.JSON2VIDEO_API_KEY || '';
const API_BASE = 'https://api.json2video.com/v2/movies';

interface VideoResult {
  url: string;
  projectId: string;
}

const CTA_TEXT: Record<string, string> = {
  en: 'Order Now - Limited Time!', fr: 'Commandez Maintenant!', es: 'Ordena Ya - Tiempo Limitado!',
  de: 'Jetzt Bestellen!', pt: 'Peça Agora - Tempo Limitado!', zh: '立即订购 - 限时优惠！',
  ja: '今すぐ注文 - 数量限定！', ko: '지금 주문 - 한정 판매!', ar: '!اطلب الآن - لفترة محدودة',
  ha: 'Yi Aminta Yanzu!', yo: 'Ra Si Bayi Lọwọlọwọ!',
  sw: 'Agiza Sasa - Muda Umeishia!', it: 'Ordina Ora - Tempo Limitato!', nl: 'Bestel Nu - Beperkte Tijd!',
  ru: 'Закажите сейчас!', hi: 'अभी ऑर्डर करें - सीमित समय!', tr: 'Hemen Sipariş Ver!',
  vi: 'Đặt hàng ngay - Thời gian có hạn!', th: 'สั่งซื้อตอนนี้ - เวลาจำกัด!', id: 'Pesan Sekarang - Waktu Terbatas!',
};

const POWERED_TEXT: Record<string, string> = {
  en: 'Powered by AdForge AI', fr: 'Propulsé par AdForge AI', es: 'Impulsado por AdForge AI',
  de: 'Betrieben von AdForge AI', pt: 'Alimentado por AdForge AI', zh: '由 AdForge AI 提供支持',
  ja: 'AdForge AI搭載', ko: 'AdForge AI 제공', ar: 'بدعم من AdForge AI',
  ha: 'Ta amfanar da AdForge AI', yo: 'Nípasẹ AdForge AI',
  sw: 'Imewashwa na AdForge AI', it: 'Offerto da AdForge AI', nl: 'Mogelijk gemaakt door AdForge AI',
  ru: 'На базе AdForge AI', hi: 'AdForge AI द्वारा संचालित', tr: 'AdForge AI tarafından desteklenmektedir',
  vi: 'Được hỗ trợ bởi AdForge AI', th: 'ขับเคลื่อนโดย AdForge AI', id: 'Didukung oleh AdForge AI',
};

/**
 * Creates a promotional video using the JSON2Video API.
 * Video text is rendered in the campaign's language.
 */
export const createPromotionalVideo = async (
  title: string,
  description: string,
  posterUrl?: string,
  language: string = 'en'
): Promise<VideoResult> => {
  const ctaText = CTA_TEXT[language] || CTA_TEXT.en;
  const poweredText = POWERED_TEXT[language] || POWERED_TEXT.en;

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
            text: poweredText,
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
            text: ctaText,
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
            text: poweredText,
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

  if (!API_KEY) {
    console.warn('[JSON2Video] API key not set, skipping video generation');
    throw new Error('JSON2VIDEO_API_KEY not configured');
  }

  console.log('[JSON2Video] Submitting video generation job...');

  // 1. Submit the video generation job
  const submitController = new AbortController();
  const submitTimeout = setTimeout(() => submitController.abort(), 15000);
  const submitResponse = await fetch(API_BASE, {
    method: 'POST',
    headers: {
      'x-api-key': API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(moviePayload),
    signal: submitController.signal,
  });
  clearTimeout(submitTimeout);

  if (!submitResponse.ok) {
    const errorText = await submitResponse.text();
    console.error('[JSON2Video] Submit failed:', errorText);
    throw new Error(`JSON2Video submit failed: ${submitResponse.status}`);
  }

  const submitData = await submitResponse.json();
  const projectId = submitData.project;
  console.log(`[JSON2Video] Job submitted. Project ID: ${projectId}`);

  // 2. Poll for completion (max 60 seconds)
  const maxAttempts = 12;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5s between polls

    const pollController = new AbortController();
    const pollTimeout = setTimeout(() => pollController.abort(), 10000);
    const statusResponse = await fetch(`${API_BASE}?project=${projectId}`, {
      method: 'GET',
      headers: { 'x-api-key': API_KEY },
      signal: pollController.signal,
    });
    clearTimeout(pollTimeout);

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
