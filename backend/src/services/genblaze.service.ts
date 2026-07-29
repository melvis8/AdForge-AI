import { PrismaClient } from '@prisma/client';
import { createPromotionalVideo } from './video.service';
import { uploadFromUrl, uploadBuffer } from './storage.service';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();
const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

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
    const response = await gemini.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: `CRITICAL: You MUST write your entire response in ${langName}. Do NOT write in any other language.

The user wants to create a marketing campaign. Their prompt is: "${userPrompt}"

Expand this into a detailed campaign brief (200-400 words) that includes:
1. What the product/service is (be specific)
2. Key features and benefits
3. Target audience
4. What makes it unique/special
5. Suggested promotional angle or offer
6. The vibe/mood of the brand

Write it as a natural paragraph in ${langName}. Be creative but stay true to what the user described.`,
    });
    const result = response.text?.trim() || '';
    if (result.length > 50) {
      console.log(`[Genblaze] Expanded description (${result.split(' ').length} words, ${language})`);
      return result;
    }
  } catch (e) {
    console.error('[Gemini] Description expansion failed:', e);
  }
  return userPrompt;
};

const generateCampaignTitle = async (description: string, language: string): Promise<string> => {
  const langName = LANG_NAMES[language] || 'English';
  try {
    const response = await gemini.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: `CRITICAL: You MUST write your entire response in ${langName}. Do NOT write in any other language. You are a world-class copywriter. Output ONLY the title.

Create ONE powerful, catchy campaign title (max 6 words) for this marketing campaign:

"${description.substring(0, 500)}"

Rules: Write in ${langName}. No quotes, no period, create urgency, make it memorable.`,
    });
    return response.text?.trim() || description.substring(0, 40);
  } catch (e) {
    console.error('[Gemini] Title failed:', e);
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
  console.log(`[Genblaze] Generating image with Gemini...`);
  try {
    const response = await gemini.models.generateContent({
      model: 'gemini-2.0-flash-exp',
      contents: `Generate a professional marketing poster image for this campaign:

TITLE: "${title}"
DESCRIPTION: ${description.substring(0, 600)}

Create a visually striking, high-quality marketing poster. The image should be:
- Professional and eye-catching
- Modern design with vibrant colors
- Appropriate for social media (square format)
- Visually compelling that makes people want to stop scrolling
- No text or words in the image - just the visual scene`,
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
      },
    });

    // Extract image from response parts
    const parts = response.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (part.inlineData?.data) {
        const imageBuffer = Buffer.from(part.inlineData.data, 'base64');
        const mimeType = part.inlineData.mimeType || 'image/jpeg';
        const ext = mimeType.includes('png') ? 'png' : 'jpg';
        console.log(`[Genblaze] Gemini image generated (${imageBuffer.length} bytes)`);

        const b2Url = await uploadBuffer(
          imageBuffer,
          `campaigns/${campaignId}/poster_${Date.now()}.${ext}`,
          mimeType
        );
        console.log(`[Genblaze] Saved to B2: ${b2Url}`);
        return b2Url;
      }
    }

    // If no image in response, try with a simpler prompt
    console.log(`[Genblaze] No image in response, retrying with simpler prompt...`);
    const retryResponse = await gemini.models.generateContent({
      model: 'gemini-2.0-flash-exp',
      contents: `Generate a beautiful, colorful marketing poster image for: ${title}. Make it vibrant and professional.`,
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
      },
    });

    const retryParts = retryResponse.candidates?.[0]?.content?.parts || [];
    for (const part of retryParts) {
      if (part.inlineData?.data) {
        const imageBuffer = Buffer.from(part.inlineData.data, 'base64');
        const mimeType = part.inlineData.mimeType || 'image/jpeg';
        const ext = mimeType.includes('png') ? 'png' : 'jpg';
        console.log(`[Genblaze] Gemini retry image generated (${imageBuffer.length} bytes)`);

        const b2Url = await uploadBuffer(
          imageBuffer,
          `campaigns/${campaignId}/poster_${Date.now()}.${ext}`,
          mimeType
        );
        console.log(`[Genblaze] Saved to B2: ${b2Url}`);
        return b2Url;
      }
    }

    throw new Error('Gemini did not return an image');
  } catch (e: any) {
    console.error('[Gemini] Image generation failed:', e?.message || e);
    throw e;
  }
};

/**
 * Generate a long, compelling social media caption using OpenAI.
 * The caption is directly about the user's specific product/service.
 */
const generateCaption = async (title: string, description: string, language: string): Promise<string> => {
  const langName = LANG_NAMES[language] || 'English';
  try {
    const response = await gemini.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: `CRITICAL: You MUST write your ENTIRE response in ${langName}. Do NOT write a single word in any other language. This is a strict requirement.

You are the world's #1 social media copywriter. You write captions for brands like Nike, Apple, and Coca-Cola that go viral and drive sales. Your captions are LONG (500-800 words), tell a compelling story, and make people want to buy.

Write a POWERFUL, LONG-FORM social media caption (500-800 words) entirely in ${langName} for this campaign:

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
- Do NOT switch to English or any other language`,
    });
    const caption = response.text?.trim() || '';
    console.log(`[Genblaze] Caption: ${caption.split(' ').length} words (${language})`);
    return caption;
  } catch (e) {
    console.error('[Gemini] Caption failed:', e);
    return '';
  }
};

const generateStrategy = async (title: string, description: string, language: string): Promise<string> => {
  const langName = LANG_NAMES[language] || 'English';
  try {
    const response = await gemini.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: `CRITICAL: You MUST write your ENTIRE response in ${langName}. Do NOT write in any other language. You are a world-class marketing strategist with 15 years of experience.

Give 3 POWERFUL, SPECIFIC, ACTIONABLE marketing strategy tips entirely in ${langName} for THIS exact campaign:

TITLE: "${title}"
DESCRIPTION: ${description.substring(0, 500)}

Each tip must be SPECIFIC to this product/service with concrete numbers, platforms, timing, and budget suggestions. Format as numbered list (1-3). Write EVERYTHING in ${langName}.`,
    });
    const result = response.text?.trim() || '';
    console.log(`[Genblaze] Strategy: ${result.split(' ').length} words (${language})`);
    return result;
  } catch (e) {
    console.error('[Gemini] Strategy failed:', e);
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
      try {
        const fallbackResponse = await gemini.models.generateContent({
          model: 'gemini-2.0-flash',
          contents: `Write in ${LANG_NAMES[language] || 'English'}. Write a 100-word social media caption about this product. Include emojis and hashtags.\n\nProduct: ${title}\nDetails: ${description.substring(0, 300)}`,
        });
        caption = fallbackResponse.text?.trim() || `${title} - ${description.substring(0, 100)}`;
      } catch {
        caption = `${title} - ${description.substring(0, 100)}`;
      }
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
      try {
        const fallbackResponse = await gemini.models.generateContent({
          model: 'gemini-2.0-flash',
          contents: `Write 3 marketing tips in ${LANG_NAMES[language] || 'English'} for this product. Number them 1-3.\n\nProduct: ${title}\nDetails: ${description.substring(0, 300)}`,
        });
        suggestions = fallbackResponse.text?.trim() || '';
      } catch {
        suggestions = '';
      }
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
