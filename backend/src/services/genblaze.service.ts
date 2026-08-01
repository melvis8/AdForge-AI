import { PrismaClient } from '@prisma/client';
import { createPromotionalVideo } from './video.service';
import { uploadFromUrl, uploadBuffer, downloadFromB2 } from './storage.service';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();
const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || '';

const GEMINI_MODEL = 'gemini-2.0-flash';

const LANG_NAMES: Record<string, string> = {
  en: 'English', fr: 'French', es: 'Spanish', de: 'German', pt: 'Portuguese',
  zh: 'Chinese', ja: 'Japanese', ko: 'Korean', ar: 'Arabic', ha: 'Hausa',
  yo: 'Yoruba', sw: 'Swahili', it: 'Italian', nl: 'Dutch', ru: 'Russian',
  hi: 'Hindi', tr: 'Turkish', vi: 'Vietnamese', th: 'Thai', id: 'Indonesian',
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const openRouterGenerate = async (prompt: string): Promise<string> => {
  if (!OPENROUTER_KEY) throw new Error('No OpenRouter key');
  console.log('[OpenRouter] Generating with fallback...');
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENROUTER_KEY}`,
      'HTTP-Referer': 'https://adforge.ai',
      'X-Title': 'AdForge AI',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'qwen/qwen-2.5-72b-instruct',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 4096,
      temperature: 0.7,
    }),
  });
  if (!response.ok) throw new Error(`OpenRouter ${response.status}`);
  const data = (await response.json()) as any;
  return data.choices?.[0]?.message?.content?.trim() || '';
};

export const geminiGenerate = async (prompt: string, retries = 3): Promise<string> => {
  let lastError: any = null;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await gemini.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
      });
      const text = (response as any).text;
      return (typeof text === 'function' ? text() : text || '').trim();
    } catch (e: any) {
      lastError = e;
      const msg = e?.message || '';
      if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
        console.log(`[Gemini] Rate limited (attempt ${attempt}/${retries}), waiting ${attempt * 5}s...`);
        await sleep(attempt * 5000);
        continue;
      }
      break;
    }
  }

  // Try OpenRouter with retries
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await openRouterGenerate(prompt);
    } catch (e: any) {
      console.log(`[OpenRouter] Failed (attempt ${attempt}/2): ${e?.message}`);
      if (attempt < 2) await sleep(3000);
    }
  }

  throw lastError;
};

const generatePosterImage = async (title: string, description: string, campaignId: string): Promise<string> => {
  console.log('[Image] Generating with Gemini...');

  // Try Gemini native image generation first
  try {
    const response = await gemini.models.generateContent({
      model: 'gemini-2.5-flash-preview-image-generation',
      contents: `Generate a professional marketing poster image for: "${title}". ${description.substring(0, 400)}. Vibrant colors, modern design, no text in the image.`,
      config: { responseModalities: ['TEXT', 'IMAGE'] },
    });
    const parts = response.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (part.inlineData?.data) {
        const buf = Buffer.from(part.inlineData.data, 'base64');
        console.log(`[Image] Gemini generated ${buf.length} bytes`);
        const b2Url = await uploadBuffer(buf, `campaigns/${campaignId}/poster_${Date.now()}.jpg`, 'image/jpeg');
        return b2Url;
      }
    }
  } catch (e: any) {
    console.log('[Image] Gemini image failed, using Pollinations:', e?.message?.substring(0, 80));
  }

  // Fallback: Pollinations.ai (free, no API key)
  console.log('[Image] Using Pollinations.ai (free)...');
  const visualPrompt = `Professional marketing poster for ${title}. ${description.substring(0, 200)}. Vibrant colors, modern design, studio lighting, high quality, no text.`;
  const encodedPrompt = encodeURIComponent(visualPrompt);
  const seed = Math.floor(Math.random() * 999999);
  const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?nologo=1&width=1024&height=1024&seed=${seed}&enhance=true`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);
  const response = await fetch(pollinationsUrl, { signal: controller.signal });
  clearTimeout(timeout);

  if (!response.ok) throw new Error(`Pollinations returned ${response.status}`);

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  console.log(`[Image] Pollinations: ${buffer.length} bytes`);
  if (buffer.length < 1000) throw new Error('Image too small');

  try {
    const b2Url = await uploadBuffer(buffer, `campaigns/${campaignId}/poster_${Date.now()}.jpg`, 'image/jpeg');
    console.log(`[Image] Saved to B2: ${b2Url}`);
    return b2Url;
  } catch {
    return pollinationsUrl;
  }
};

const generateCaption = async (title: string, description: string, language: string): Promise<string> => {
  const langName = LANG_NAMES[language] || 'English';
  const caption = await geminiGenerate(`CRITICAL: You MUST write your ENTIRE response in ${langName}. Do NOT write a single word in any other language.

You are the world's #1 social media copywriter. Write captions that go viral and drive sales. Your captions are LONG (500-800 words), tell a compelling story, and make people want to buy.

Write a POWERFUL, LONG-FORM social media caption (500-800 words) entirely in ${langName} for this campaign:

CAMPAIGN TITLE: "${title}"
PRODUCT/SERVICE DETAILS: ${description}

Structure (ALL IN ${langName}):
1. HOOK - First line that stops the scroll
2. STORY - 2-3 paragraphs about the product/service
3. DETAILS - Features, ingredients, prices, discounts
4. BENEFITS - How this changes the customer's life
5. SOCIAL PROOF - Quality, trust
6. URGENCY - Limited time, exclusive deal
7. CTA - Clear call to action
8. HASHTAGS - 5-8 relevant hashtags

RULES: MINIMUM 500 words. EVERYTHING in ${langName}. Use emojis. Reference specific details. Include numbers/percentages. Do NOT switch languages.`);
  console.log(`[Caption] ${caption.split(' ').length} words (${language})`);
  return caption;
};

const generateStrategy = async (title: string, description: string, language: string): Promise<string> => {
  const langName = LANG_NAMES[language] || 'English';
  const result = await geminiGenerate(`CRITICAL: Write ENTIRE response in ${langName}. You are a world-class marketing strategist.

Give 3 POWERFUL, SPECIFIC, ACTIONABLE marketing strategy tips in ${langName} for:

TITLE: "${title}"
DESCRIPTION: ${description.substring(0, 500)}

Each tip must be SPECIFIC with concrete numbers, platforms, timing, and budget. Format as numbered list (1-3). Write EVERYTHING in ${langName}.`);
  console.log(`[Strategy] ${result.split(' ').length} words (${language})`);
  return result;
};

const detectLanguage = async (text: string): Promise<string> => {
  const lower = text.toLowerCase();

  // ONLY distinctive words — words that are unambiguously one language
  // No shared words between languages (e.g. "produit" removed because it's similar in FR/PT)
  const langDistinctive: Record<string, RegExp> = {
    fr: /\b(bonjour|merci|s'il vous plaît|beauté|cosmétique|soin|crème|sérum|visage|peau|cheveux|corps|bien-être|alimentation|naturel|café|hôtel|voyage|vêtement|jardin|nouveau|nouvelle|excellent|meilleur|spécial|c'est|très|je|nous|vous|ils|elles|mon|ton|son|fait|peut|elle|leur|quel|quelle|aujourd'hui|maintenant)\b/i,
    es: /\b(hola|gracias|por favor|belleza|cosmético|cuidado|crema|serum|rostro|piel|cabello|cuerpo|salud|bienestar|alimentación|restaurante|viaje|moda|ropa|jardín|niño|nuevo|nueva|excelente|mejor|también|puede|tiene|hace|desde|hasta|está|ser|hay|más|pero|como|este|esta|eso)\b/i,
    de: /\b(schönheit|kosmetik|pflege|gesicht|haare|körper|gesundheit|wohlbefinden|ernaehrung|kaffee|reise|kleidung|haus|garten|tiere|danke|bitte|guten|morgen|abend|exzellent|besten|könnte|sollte|muss|wird|hat|war|nicht|und|ich|du|er|sie|wir|ihr|sind|aber|kann)\b/i,
    pt: /\b(obrigado|obrigada|beleza|cosmético|cuidado|soro|rosto|pele|cabelo|saúde|bem-estar|viagem|roupa|criança|lançamento|novo|nova|excelente|melhor|também|porém|porque|então|quando|onde|qual|muito|mais|não|você|está|fazer|pode|tem)\b/i,
  };

  let bestLang = '';
  let bestScore = 0;

  for (const [lang, pattern] of Object.entries(langDistinctive)) {
    const matches = lower.match(new RegExp(pattern.source, 'gi'));
    const score = matches ? matches.length : 0;
    if (score >= 2 && score > bestScore) {
      bestScore = score;
      bestLang = lang;
    }
  }

  if (bestLang) {
    console.log(`[Lang] Heuristic: ${bestLang} (${bestScore} matches)`);
    return bestLang;
  }

  // Non-Latin scripts
  if (/[\u4e00-\u9fff]/.test(text)) return 'zh';
  if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) return 'ja';
  if (/[\uac00-\ud7af]/.test(text)) return 'ko';
  if (/[؟،]/.test(text)) return 'ar';

  // Fallback to Gemini
  try {
    const rawResponse = await geminiGenerate(
      `What language is this text? Reply with ONLY the 2-letter ISO 639-1 code.\n\nText: "${text.substring(0, 300)}"`,
    );
    const code = rawResponse.toLowerCase().replace(/[^a-z]/g, '').substring(0, 2);
    if (code && code.length === 2) {
      console.log(`[Lang] Gemini: ${code}`);
      return code;
    }
  } catch (e) {
    console.error('[Lang] Gemini failed:', e);
  }

  return 'en';
};

export const generateCampaignAssets = async (campaignId: string) => {
  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: { assets: true },
    });
    if (!campaign) throw new Error('Campaign not found');

    await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'generating' } });

    const userPrompt = campaign.description || 'A great product';

    // Step 1: Detect language
    const language = await detectLanguage(userPrompt);

    // Step 2: Expand description
    const langName = LANG_NAMES[language] || 'English';
    let description: string;
    try {
      description = await geminiGenerate(`CRITICAL: Write your entire response in ${langName}.

Expand this marketing campaign prompt into a detailed 200-400 word brief including: product details, features, target audience, unique selling points, promotional angle, brand vibe.

User prompt: "${userPrompt}"`);
      if (description.length < 50) description = userPrompt;
    } catch {
      description = userPrompt;
    }
    console.log(`[Genblaze] Description: ${description.split(' ').length} words (${language})`);

    // Step 3: Generate title
    let title: string;
    try {
      title = await geminiGenerate(`CRITICAL: Write in ${langName}. Output ONLY the title. Create ONE catchy campaign title (max 6 words) for: "${description.substring(0, 500)}". No quotes, no period.`);
      if (!title) title = description.substring(0, 40);
    } catch {
      title = description.substring(0, 40);
    }
    await prisma.campaign.update({ where: { id: campaignId }, data: { title, description } });
    console.log(`[Genblaze] Title: ${title}`);

    // Step 4 & 5: Generate image AND caption in parallel
    console.log('[Genblaze] Generating image and caption in parallel...');
    const [posterResult, captionResult] = await Promise.allSettled([
      generatePosterImage(title, description, campaignId),
      generateCaption(title, description, language),
    ]);

    // Handle image
    let posterUrl = '';
    if (posterResult.status === 'fulfilled' && posterResult.value) {
      posterUrl = posterResult.value;
      await prisma.generatedFile.create({ data: { campaignId, url: posterUrl, type: 'poster' } });
      console.log(`[Genblaze] Image: ${posterUrl.substring(0, 80)}...`);
    } else {
      console.error('[Genblaze] Image FAILED:', posterResult.status === 'rejected' ? posterResult.reason : 'empty');
    }

    // Handle caption
    let caption = captionResult.status === 'fulfilled' ? captionResult.value : '';
    if (!caption || caption.length < 50) {
      try { caption = await generateCaption(title, description, language); } catch {}
    }
    if (!caption || caption.length < 50) {
      caption = `${title} - ${description.substring(0, 100)}`;
    }
    await prisma.generatedFile.create({ data: { campaignId, url: '', type: 'caption', content: caption } });
    console.log(`[Genblaze] Caption: ${caption.split(' ').length} words`);

    // Step 6: Generate strategy
    let strategy = '';
    try {
      strategy = await generateStrategy(title, description, language);
    } catch {}
    if (!strategy || strategy.length < 20) {
      try { strategy = await generateStrategy(title, description, language); } catch {}
    }
    await prisma.generatedFile.create({ data: { campaignId, url: '', type: 'strategy', content: strategy } });

    // Mark completed
    await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'completed' } });
    console.log(`[Genblaze] Campaign ${campaignId} completed`);

    // Step 7: Video in background
    if (posterUrl) {
      generateVideoInBackground(campaignId, title, description, posterUrl, language).catch(e => {
        console.error('[Genblaze] Background video failed:', e?.message || e);
      });
    }
  } catch (error) {
    console.error(`[Genblaze] Campaign ${campaignId} FAILED:`, error);
    await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'failed' } });
  }
};

const generateVideoInBackground = async (
  campaignId: string, title: string, description: string, posterUrl: string, _language: string
) => {
  console.log(`[Video] Starting background video for ${campaignId}...`);
  try {
    // posterUrl may be a proxy URL (/api/files/...) — convert to raw B2 URL for video service
    let rawPosterUrl = posterUrl;
    if (posterUrl.startsWith('/api/files/')) {
      const fileName = posterUrl.replace('/api/files/', '');
      rawPosterUrl = `https://f005.backblazeb2.com/file/${process.env.B2_BUCKET_NAME}/${fileName}`;
    }

    const videoResult = await createPromotionalVideo(title, description, rawPosterUrl);
    if (videoResult?.url && videoResult.url.startsWith('/')) {
      const buffer = fs.readFileSync(videoResult.url);
      try {
        const videoUrl = await uploadBuffer(buffer, `campaigns/${campaignId}/video_${Date.now()}.mp4`, 'video/mp4');
        await prisma.generatedFile.create({ data: { campaignId, url: videoUrl, type: 'video' } });
        console.log(`[Video] Uploaded to B2: ${videoUrl}`);
      } catch (uploadErr) {
        console.error('[Video] B2 upload failed:', (uploadErr as Error).message);
        const renderUrl = 'https://adforge-api-hday.onrender.com';
        const localUrl = `${renderUrl}/api/campaigns/${campaignId}/video`;
        await prisma.generatedFile.create({ data: { campaignId, url: localUrl, type: 'video' } });
        console.log(`[Video] Saved as fallback: ${localUrl}`);
      }
      try { fs.unlinkSync(videoResult.url); } catch {}
    }
  } catch (e: any) {
    console.error('[Video] Failed:', e?.message || e);
  }
};
