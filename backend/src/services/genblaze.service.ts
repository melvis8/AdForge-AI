import { PrismaClient } from '@prisma/client';
import { createPromotionalVideo } from './video.service';
import { uploadFromUrl, uploadBuffer } from './storage.service';
import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import { fal } from '@fal-ai/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();
const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });
const FAL_KEY = process.env.FAL_API_KEY || '';

if (FAL_KEY) {
  fal.config({ credentials: FAL_KEY });
}

const LANG_NAMES: Record<string, string> = {
  en: 'English', fr: 'French', es: 'Spanish', de: 'German', pt: 'Portuguese',
  zh: 'Chinese', ja: 'Japanese', ko: 'Korean', ar: 'Arabic', ha: 'Hausa',
  yo: 'Yoruba', sw: 'Swahili', it: 'Italian', nl: 'Dutch', ru: 'Russian',
  hi: 'Hindi', tr: 'Turkish', vi: 'Vietnamese', th: 'Thai', id: 'Indonesian',
};

const detectLanguage = async (text: string): Promise<string> => {
  // First, try simple heuristic detection
  const langHints: Record<string, RegExp> = {
    fr: /\b(le|la|les|des|une|est|dans|pour|avec|sur|pas|que|qui|cette|nous|vous|sont|mais|tout|mon|ton|son|fait|peut|va|je|tu|il|elle|nous|vous|ils|elles|bonjour|merci|s'il vous plaît|produit|marque|lancement|offre)\b/i,
    es: /\b(el|la|los|las|un|una|es|en|por|con|para|no|que|como|pero|más|este|esta|muy|bueno|día|hola|gracias|producto|marca|lanzamiento|oferta)\b/i,
    de: /\b(der|die|das|ein|eine|ist|in|mit|auf|nicht|und|ich|du|er|sie|wir|ihr|sind|aber|kann|gut|morgen|danke|produkt|marke|angebot)\b/i,
    pt: /\b(o|a|os|as|um|uma|é|em|com|para|não|que|como|mas|mais|este|esta|muito|bom|dia|olá|obrigado|produto|marca|lançamento|oferta)\b/i,
    ar: /[؟،]/u,
    zh: /[\u4e00-\u9fff]/,
    ja: /[\u3040-\u309f\u30a0-\u30ff]/,
    ko: /[\uac00-\ud7af]/,
    ha: /\b(na|ne|da|wa|ba|ta|ka|ga|ya|am|ai|ni|shi|fi|ko|mi|sunan|kuma| Product| brand| offer)\b/i,
  };

  for (const [lang, regex] of Object.entries(langHints)) {
    if (regex.test(text)) {
      console.log(`[Genblaze] Language detected by heuristic: ${lang}`);
      return lang;
    }
  }

  // Fallback to Gemini API
  try {
    const response = await gemini.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: `What language is this text written in? Reply with ONLY the 2-letter ISO 639-1 code. Examples: English=en, French=fr, Spanish=es, Arabic=ar, Hausa=ha, Yoruba=yo, Swahili=sw\n\nText: "${text.substring(0, 300)}"`,
    });
    const rawResponse = response.text?.trim() || '';
    console.log(`[Genblaze] Gemini raw response: "${rawResponse}"`);
    const code = rawResponse.toLowerCase().replace(/[^a-z]/g, '').substring(0, 2);
    if (code && code.length === 2) {
      console.log(`[Genblaze] Language detected by Gemini: ${code}`);
      return code;
    }
  } catch (e) {
    console.error('[Genblaze] Gemini language detection failed:', e);
  }

  console.log('[Genblaze] Defaulting to English');
  return 'en';
};

/**
 * Step 1: Generate a detailed campaign description from the user's short prompt.
 * The user might type "organic skincare" or "restaurant promo" - we expand it into
 * a rich description that gives the AI enough context to generate great content.
 */
const generateDetailedDescription = async (userPrompt: string, language: string): Promise<string> => {
  const langName = LANG_NAMES[language] || 'English';
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `CRITICAL: You MUST write your entire response in ${langName}. Do NOT write in any other language. This is a strict requirement.`
        },
        {
          role: 'user',
          content: `The user wants to create a marketing campaign. Their prompt is: "${userPrompt}"

Expand this into a detailed campaign brief (200-400 words) that includes:
1. What the product/service is (be specific)
2. Key features and benefits
3. Target audience
4. What makes it unique/special
5. Suggested promotional angle or offer
6. The vibe/mood of the brand

Write it as a natural paragraph in ${langName}. Be creative but stay true to what the user described.`
        }
      ],
      max_tokens: 800,
      temperature: 0.8,
    });
    const result = completion.choices[0]?.message?.content?.trim();
    if (result && result.length > 50) {
      console.log(`[Genblaze] Expanded description (${result.split(' ').length} words, ${language})`);
      return result;
    }
  } catch (e) {
    console.error('[OpenAI] Description expansion failed:', e);
  }
  return userPrompt;
};

const generateCampaignTitle = async (description: string, language: string): Promise<string> => {
  const langName = LANG_NAMES[language] || 'English';
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: `CRITICAL: You MUST write your entire response in ${langName}. Do NOT write in any other language. You are a world-class copywriter. Output ONLY the title.` },
        { role: 'user', content: `Create ONE powerful, catchy campaign title (max 6 words) for this marketing campaign:\n\n"${description.substring(0, 500)}"\n\nRules: Write in ${langName}. No quotes, no period, create urgency, make it memorable.` }
      ],
      max_tokens: 30,
      temperature: 0.9,
    });
    return completion.choices[0]?.message?.content?.trim() || description.substring(0, 40);
  } catch (e) {
    console.error('[OpenAI] Title failed:', e);
    return description.substring(0, 40);
  }
};

/**
 * Generate a campaign poster image using AI.
 * 1. OpenAI writes a detailed visual prompt based on the user's product
 * 2. fal.ai Flux Pro generates the image (if available)
 * 3. Falls back to Pollinations.ai (free) if fal.ai fails
 * 4. Uploads to Backblaze B2
 */
const generatePosterImage = async (title: string, description: string, campaignId: string, language: string): Promise<string> => {
  // Step 1: Use OpenAI to write a detailed visual prompt
  let visualPrompt = '';
  try {
    const promptCompletion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are an expert at writing prompts for AI image generators like DALL-E, Midjourney, and Stable Diffusion. Output ONLY the image prompt, nothing else. Be extremely specific about what the image should look like.`
        },
        {
          role: 'user',
          content: `Write a detailed image generation prompt for a marketing poster. The campaign is:

TITLE: "${title}"
DESCRIPTION: ${description.substring(0, 600)}

The prompt should describe:
- The exact scene/composition (what objects, people, or elements are in the image)
- Colors and lighting (warm tones, neon, natural light, etc.)
- Style (photorealistic, minimalist, luxurious, etc.)
- The overall mood and feeling
- Any text or branding elements visible

Keep the prompt under 300 words. Be vivid and specific. Do NOT use the words "placeholder" or "example".`
        }
      ],
      max_tokens: 400,
      temperature: 0.85,
    });
    visualPrompt = promptCompletion.choices[0]?.message?.content?.trim() || '';
    console.log(`[Genblaze] Visual prompt (${visualPrompt.length} chars): ${visualPrompt.substring(0, 120)}...`);
  } catch (e) {
    console.error('[OpenAI] Visual prompt generation failed:', e);
    visualPrompt = `Professional marketing poster for ${title}. ${description.substring(0, 200)}. High quality, vibrant colors, modern design, studio lighting, 8K photorealistic.`;
  }

  if (!visualPrompt || visualPrompt.length < 20) {
    visualPrompt = `Professional marketing poster for ${title}. Modern design, vibrant colors, studio lighting, 8K quality.`;
  }

  // Step 2: Try fal.ai Flux Pro first (high quality, paid)
  if (FAL_KEY) {
    try {
      console.log(`[Genblaze] Trying fal.ai Flux Pro...`);
      const result = await fal.subscribe('fal-ai/flux-pro/v1.1', {
        input: {
          prompt: visualPrompt,
          image_size: 'square_hd',
          num_images: 1,
          output_format: 'jpeg',
          safety_tolerance: '3',
          enhance_prompt: true,
        },
      });

      const data = result.data as any;
      const imageUrl = data?.images?.[0]?.url;

      if (imageUrl) {
        console.log(`[Genblaze] fal.ai image: ${imageUrl.substring(0, 80)}...`);
        try {
          const b2Url = await uploadFromUrl(imageUrl, `campaigns/${campaignId}/poster_${Date.now()}.jpg`);
          console.log(`[Genblaze] Saved to B2: ${b2Url}`);
          return b2Url;
        } catch {
          return imageUrl;
        }
      }
    } catch (e: any) {
      console.error('[Genblaze] fal.ai failed:', e?.message?.substring(0, 100) || e);
    }
  }

  // Step 3: Pollinations.ai (free, generates from prompt)
  console.log(`[Genblaze] Using Pollinations.ai...`);
  const encodedPrompt = encodeURIComponent(visualPrompt);
  const seed = Math.floor(Math.random() * 999999);
  const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?nologo=1&width=1024&height=1024&seed=${seed}&enhance=true`;

  // Download and upload to B2
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000);
    const response = await fetch(pollinationsUrl, { signal: controller.signal });
    clearTimeout(timeout);

    if (response.ok) {
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const contentType = response.headers.get('content-type') || 'image/jpeg';
      console.log(`[Genblaze] Pollinations image downloaded (${buffer.length} bytes)`);

      try {
        const b2Url = await uploadBuffer(buffer, `campaigns/${campaignId}/poster_${Date.now()}.jpg`, contentType);
        console.log(`[Genblaze] Saved to B2: ${b2Url}`);
        return b2Url;
      } catch (b2Err) {
        console.log(`[Genblaze] B2 failed, returning Pollinations URL`);
        return pollinationsUrl;
      }
    }
  } catch (e: any) {
    console.error('[Genblaze] Pollinations failed:', e?.message || e);
  }

  throw new Error('All image generation methods failed');
};

/**
 * Generate a long, compelling social media caption using OpenAI.
 * The caption is directly about the user's specific product/service.
 */
const generateCaption = async (title: string, description: string, language: string): Promise<string> => {
  const langName = LANG_NAMES[language] || 'English';
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `CRITICAL: You MUST write your ENTIRE response in ${langName}. Do NOT write a single word in any other language. This is a strict requirement.\n\nYou are the world's #1 social media copywriter. You write captions for brands like Nike, Apple, and Coca-Cola that go viral and drive sales. Your captions are LONG (500-800 words), tell a compelling story, and make people want to buy.`
        },
        {
          role: 'user',
          content: `Write a POWERFUL, LONG-FORM social media caption (500-800 words) entirely in ${langName} for this campaign:

CAMPAIGN TITLE: "${title}"
PRODUCT/SERVICE DETAILS: ${description}

Write the caption with this structure (ALL IN ${langName}):

1. HOOK - First line that stops the scroll (question, bold statement, or surprising fact)
2. STORY - 2-3 paragraphs about the product/service, why it exists, who it's for
3. DETAILS - Specific features, ingredients, prices, discounts, locations
4. BENEFITS - How this changes the customer's life
5. SOCIAL PROOF - Quality, satisfaction, awards, trust
6. URGENCY - Limited time, limited stock, exclusive deal
7. CTA - Clear call to action (follow, visit, order, DM)
8. HASHTAGS - 5-8 relevant trending hashtags

RULES:
- Write MINIMUM 500 words
- EVERYTHING must be in ${langName}
- Reference SPECIFIC details from the description
- Use emojis strategically throughout
- Feel personal and authentic
- Use short paragraphs for readability
- Include specific numbers, prices, or percentages
- Make someone FEEL something and WANT to take action
- No generic filler - every sentence must be about THIS specific product
- Do NOT switch to English or any other language`
        }
      ],
      max_tokens: 2000,
      temperature: 0.85,
    });
    const caption = completion.choices[0]?.message?.content?.trim() || '';
    console.log(`[Genblaze] Caption: ${caption.split(' ').length} words (${language})`);
    return caption;
  } catch (e) {
    console.error('[OpenAI] Caption failed:', e);
    return '';
  }
};

const generateStrategy = async (title: string, description: string, language: string): Promise<string> => {
  const langName = LANG_NAMES[language] || 'English';
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: `CRITICAL: You MUST write your ENTIRE response in ${langName}. Do NOT write in any other language. You are a world-class marketing strategist with 15 years of experience.` },
        {
          role: 'user',
          content: `Give 3 POWERFUL, SPECIFIC, ACTIONABLE marketing strategy tips entirely in ${langName} for THIS exact campaign:

TITLE: "${title}"
DESCRIPTION: ${description.substring(0, 500)}

Each tip must be SPECIFIC to this product/service with concrete numbers, platforms, timing, and budget suggestions. Format as numbered list (1-3). Write EVERYTHING in ${langName}.`
        }
      ],
      max_tokens: 600,
      temperature: 0.8,
    });
    const result = completion.choices[0]?.message?.content?.trim() || '';
    console.log(`[Genblaze] Strategy: ${result.split(' ').length} words (${language})`);
    return result;
  } catch (e) {
    console.error('[OpenAI] Strategy failed:', e);
    return '';
  }
};

export const generateCampaignAssets = async (campaignId: string) => {
  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: { assets: true }
    });

    if (!campaign) throw new Error('Campaign not found');

    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'generating' },
    });

    const userPrompt = campaign.description || 'A great product';

    // Step 1: Detect language from user's prompt
    const language = await detectLanguage(userPrompt);

    // Step 2: Generate detailed description from user's short prompt
    const description = await generateDetailedDescription(userPrompt, language);
    console.log(`[Genblaze] Description expanded to ${description.split(' ').length} words`);

    // Step 3: Generate title
    const title = await generateCampaignTitle(description, language);
    await prisma.campaign.update({ where: { id: campaignId }, data: { title, description } });
    console.log(`[Genblaze] Title: ${title}`);

    // Step 4 & 5: Generate image AND caption in parallel
    console.log(`[Genblaze] Generating image and caption in parallel...`);
    const [posterResult, captionResult] = await Promise.allSettled([
      generatePosterImage(title, description, campaignId, language),
      generateCaption(title, description, language),
    ]);

    // Handle image
    let posterUrl = '';
    if (posterResult.status === 'fulfilled') {
      posterUrl = posterResult.value;
      await prisma.generatedFile.create({
        data: { campaignId, url: posterUrl, type: 'poster' }
      });
      console.log(`[Genblaze] Image: ${posterUrl.substring(0, 80)}...`);
    } else {
      console.error('[Genblaze] Image FAILED:', posterResult.reason);
    }

    // Handle caption
    let caption = captionResult.status === 'fulfilled' ? captionResult.value : '';
    if (!caption || caption.length < 50) {
      // Retry caption generation if it was too short
      console.log('[Genblaze] Caption too short, retrying...');
      try {
        caption = await generateCaption(title, description, language);
      } catch {}
    }
    if (!caption || caption.length < 50) {
      // Last resort: generate a basic caption in the correct language
      caption = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: `Write in ${LANG_NAMES[language] || 'English'}. Write a 100-word social media caption about this product. Include emojis and hashtags.` },
          { role: 'user', content: `Product: ${title}\nDetails: ${description.substring(0, 300)}` }
        ],
        max_tokens: 300,
      }).then(r => r.choices[0]?.message?.content?.trim() || `${title} - ${description.substring(0, 100)}`);
    }
    await prisma.generatedFile.create({
      data: { campaignId, url: '', type: 'caption', content: caption }
    });
    console.log(`[Genblaze] Caption: ${caption.split(' ').length} words`);

    // Step 6: Generate strategy
    let suggestions = await generateStrategy(title, description, language);
    if (!suggestions || suggestions.length < 20) {
      // Retry strategy
      console.log('[Genblaze] Strategy too short, retrying...');
      try {
        suggestions = await generateStrategy(title, description, language);
      } catch {}
    }
    if (!suggestions || suggestions.length < 20) {
      // Last resort: basic strategy in correct language
      suggestions = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: `Write 3 marketing tips in ${LANG_NAMES[language] || 'English'} for this product. Number them 1-3.` },
          { role: 'user', content: `Product: ${title}\nDetails: ${description.substring(0, 300)}` }
        ],
        max_tokens: 400,
      }).then(r => r.choices[0]?.message?.content?.trim() || '');
    }
    await prisma.generatedFile.create({
      data: { campaignId, url: '', type: 'caption', content: `STRATEGY:${suggestions}` }
    });

    // Mark campaign as completed
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'completed' },
    });
    console.log(`[Genblaze] Campaign ${campaignId} completed`);

    // Step 7: Generate video in background
    generateVideoInBackground(campaignId, title, description, posterUrl, language).catch(e => {
      console.error('[Genblaze] Background video failed:', e);
    });

  } catch (error) {
    console.error(`[Genblaze] Campaign ${campaignId} FAILED:`, error);
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'failed' },
    });
  }
};

const generateVideoInBackground = async (
  campaignId: string,
  title: string,
  description: string,
  posterUrl: string,
  language: string
) => {
  const fs = require('fs');
  console.log(`[Genblaze] Starting background video for ${campaignId}...`);
  try {
    const videoResult = await createPromotionalVideo(title, description, posterUrl, language);
    if (videoResult?.url) {
      // If it's a local file path, read it and upload to B2
      if (videoResult.url.startsWith('/')) {
        const buffer = fs.readFileSync(videoResult.url);
        const videoUrl = await uploadBuffer(buffer, `campaigns/${campaignId}/video_${Date.now()}.mp4`, 'video/mp4');
        await prisma.generatedFile.create({
          data: { campaignId, url: videoUrl, type: 'video' }
        });
        console.log(`[Genblaze] Video uploaded to B2: ${videoUrl.substring(0, 80)}...`);
        // Clean up temp file
        try { fs.unlinkSync(videoResult.url); } catch {}
      } else {
        const videoUrl = await uploadFromUrl(videoResult.url, `campaigns/${campaignId}/video_${Date.now()}.mp4`);
        await prisma.generatedFile.create({
          data: { campaignId, url: videoUrl, type: 'video' }
        });
        console.log(`[Genblaze] Video completed: ${videoUrl.substring(0, 80)}...`);
      }
    }
  } catch (e: any) {
    console.error('[Genblaze] Video failed:', e?.message || e);
  }
};
