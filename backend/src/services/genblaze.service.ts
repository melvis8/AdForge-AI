import { PrismaClient } from '@prisma/client';
import { createPromotionalVideo } from './video.service';
import { uploadFromUrl, uploadBuffer } from './storage.service';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();
const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || '';

const GEMINI_MODEL = 'gemini-2.5-flash';

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
        console.log(`[Gemini] Rate limited (attempt ${attempt}/${retries}), waiting ${attempt * 15}s...`);
        await sleep(attempt * 15000);
        continue;
      }
      break;
    }
  }
  try {
    return await openRouterGenerate(prompt);
  } catch {
    throw lastError;
  }
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
  const langHints: Record<string, RegExp> = {
    fr: /\b(le|la|les|des|une|est|dans|pour|avec|sur|pas|que|qui|cette|nous|vous|sont|mais|tout|mon|ton|son|fait|peut|va|je|tu|il|elle|bonjour|merci|produit|marque|lancement|offre|s'il vous plaît)\b/i,
    es: /\b(el|la|los|las|un|una|es|en|por|con|para|no|que|como|pero|más|este|esta|muy|bueno|día|hola|gracias|producto|marca|lanzamiento|oferta)\b/i,
    de: /\b(der|die|das|ein|eine|ist|in|mit|auf|nicht|und|ich|du|er|sie|wir|ihr|sind|aber|kann|gut|morgen|danke|produkt|marke|angebot)\b/i,
    pt: /\b(os|as|um|uma|é|com|não|mas|mais|muito|bom|olá|obrigado|produto|marca|lançamento|oferta|você|está|fazer|também|porém|porque|então|quando|onde|qual)\b/i,
    ar: /[؟،]/u,
    zh: /[\u4e00-\u9fff]/,
    ja: /[\u3040-\u309f\u30a0-\u30ff]/,
    ko: /[\uac00-\ud7af]/,
    ha: /\b(sunan|kuma|na|ne|da|wa|ba|ta|ka|ga|ya|am|ai|ni|shi|fi|ko|mi)\b/i,
  };

  for (const [lang, regex] of Object.entries(langHints)) {
    if (regex.test(text)) {
      console.log(`[Lang] Detected by heuristic: ${lang}`);
      return lang;
    }
  }

  try {
    const rawResponse = await geminiGenerate(
      `What language is this text? Reply with ONLY the 2-letter ISO 639-1 code.\n\nText: "${text.substring(0, 300)}"`,
    );
    const code = rawResponse.toLowerCase().replace(/[^a-z]/g, '').substring(0, 2);
    if (code && code.length === 2) {
      console.log(`[Lang] Detected by Gemini: ${code}`);
      return code;
    }
  } catch (e) {
    console.error('[Lang] Gemini detection failed:', e);
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
    const videoResult = await createPromotionalVideo(title, description, posterUrl);
    if (videoResult?.url && videoResult.url.startsWith('/')) {
      const buffer = fs.readFileSync(videoResult.url);
      const videoUrl = await uploadBuffer(buffer, `campaigns/${campaignId}/video_${Date.now()}.mp4`, 'video/mp4');
      await prisma.generatedFile.create({ data: { campaignId, url: videoUrl, type: 'video' } });
      console.log(`[Video] Uploaded to B2: ${videoUrl.substring(0, 80)}...`);
      try { fs.unlinkSync(videoResult.url); } catch {}
    }
  } catch (e: any) {
    console.error('[Video] Failed:', e?.message || e);
  }
};
