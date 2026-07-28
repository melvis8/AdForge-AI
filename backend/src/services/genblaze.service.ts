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
  try {
    const response = await gemini.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: `Detect the language. Reply ONLY with the 2-letter code (en, fr, es, de, pt, zh, ja, ko, ar, ha, yo, sw). No explanation.\n\n"${text}"`,
    });
    return response.text?.trim().toLowerCase().replace(/[^a-z]/g, '').substring(0, 2) || 'en';
  } catch {
    return 'en';
  }
};

const generateCampaignTitle = async (description: string, language: string): Promise<string> => {
  const langName = LANG_NAMES[language] || 'English';
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: `Expert copywriter. Output ONLY the title, nothing else. Write in ${langName}.` },
        { role: 'user', content: `Generate ONE short, powerful campaign title (max 6 words) for: "${description}". Create urgency. No quotes, no period.` }
      ],
      max_tokens: 50,
      temperature: 0.9,
    });
    return completion.choices[0]?.message?.content?.trim() || description.substring(0, 50);
  } catch (e) {
    console.error('[OpenAI] Title failed:', e);
    return description.substring(0, 50);
  }
};

/**
 * Generate a campaign poster image using fal.ai Flux Pro.
 * 1. Use OpenAI to write a detailed visual prompt based on the user's product
 * 2. Generate image with fal.ai Flux Pro v1.1
 * 3. Upload to B2 for persistence, fallback to fal CDN URL
 */
const generatePosterImage = async (title: string, description: string, campaignId: string, language: string): Promise<string> => {
  if (!FAL_KEY) {
    throw new Error('FAL_API_KEY not configured');
  }

  // Step 1: Generate a detailed visual prompt using OpenAI
  let visualPrompt = `professional advertising poster for ${title}, premium brand aesthetic, vibrant colors, 8k photorealistic, studio lighting, modern design`;
  try {
    const promptCompletion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You write image generation prompts for Flux Pro AI. Output ONLY the prompt, nothing else. Be extremely detailed and vivid.' },
        { role: 'user', content: `Write a detailed, vivid image prompt for an advertising poster. The poster is for: "${title}" - ${description}. Describe the exact scene, products, colors, lighting, mood, and style. Be very specific about what should appear in the image. Keep under 400 characters.` }
      ],
      max_tokens: 200,
      temperature: 0.8,
    });
    const generated = promptCompletion.choices[0]?.message?.content?.trim();
    if (generated && generated.length > 20) {
      visualPrompt = generated;
    }
  } catch (e) {
    console.error('[OpenAI] Image prompt generation failed:', e);
  }

  console.log(`[Genblaze] Flux Pro prompt: ${visualPrompt}`);

  // Step 2: Generate image with fal.ai Flux Pro v1.1
  try {
    console.log(`[Genblaze] Generating image with fal.ai Flux Pro...`);
    const result = await fal.subscribe('fal-ai/flux-pro/v1.1', {
      input: {
        prompt: visualPrompt,
        image_size: 'square_hd',
        num_images: 1,
        output_format: 'jpeg',
        safety_tolerance: '3',
        enhance_prompt: true,
      },
      logs: true,
      onQueueUpdate: (update: any) => {
        if (update.status === 'IN_PROGRESS') {
          update.logs?.map((log: any) => log.message).forEach(console.log);
        }
      },
    });

    const data = result.data as any;
    const imageUrl = data?.images?.[0]?.url;

    if (imageUrl) {
      console.log(`[Genblaze] Image generated: ${imageUrl}`);

      // Step 3: Upload to B2 for persistence
      try {
        const b2Url = await uploadFromUrl(imageUrl, `campaigns/${campaignId}/poster_${Date.now()}.jpg`);
        console.log(`[Genblaze] Poster saved to B2: ${b2Url}`);
        return b2Url;
      } catch (b2Err) {
        console.log(`[Genblaze] B2 upload failed, using fal CDN URL`);
        return imageUrl;
      }
    }
  } catch (e: any) {
    console.error('[Genblaze] fal.ai image generation failed:', e?.message || e);
  }

  throw new Error('Image generation failed - fal.ai returned no image');
};

const generateCaption = async (title: string, description: string, language: string): Promise<string> => {
  const langName = LANG_NAMES[language] || 'English';
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are the world's #1 social media copywriter who has generated viral posts for Nike, Apple, and Coca-Cola. You write captions that make people stop scrolling, feel emotions, and BUY. Your captions are LONG (500-800 words), tell a story, and convert readers into customers. Write in ${langName}. NEVER write short captions.`
        },
        {
          role: 'user',
          content: `Write a LONG-FORM, POWERFUL social media caption (500-800 words minimum!) for this EXACT campaign. This should be the kind of caption that goes VIRAL on Instagram, Facebook, and LinkedIn.

CAMPAIGN TITLE: "${title}"
CAMPAIGN DETAILS: ${description}

CAPTION STRUCTURE (follow this exactly):

**LINE 1 - THE HOOK (stops the scroll)**
Start with a question, bold statement, or surprising fact that makes people READ MORE.

**PARAGRAPH 1 - THE STORY (connect emotionally)**
Tell the story behind this product/service. Why does it exist? What problem does it solve? Who created it and why?

**PARAGRAPH 2 - THE DETAILS (inform and impress)**
Describe exactly what makes this product/service special. Mention specific features, ingredients, prices, discounts, locations, or any detail from the description.

**PARAGRAPH 3 - THE BENEFITS (show the transformation)**
Explain how this product/service will CHANGE the customer's life. What will they gain? What pain will be eliminated?

**PARAGRAPH 4 - THE SOCIAL PROOF (build trust)**
Mention quality guarantees, customer satisfaction, awards, or any reason to trust this brand.

**PARAGRAPH 5 - THE URGENCY (drive action)**
Create urgency - limited time, limited stock, exclusive deal, seasonal, first 100 customers, etc.

**PARAGRAPH 6 - THE CTA (tell them what to do)**
Clear call to action: follow, visit, order, DM, click link, etc.

**PARAGRAPH 7 - THE HASHTAGS**
5-8 relevant trending hashtags.

RULES:
- Write MINIMUM 500 words
- Reference SPECIFIC details from the description (prices, locations, ingredients, discounts, target audience)
- Use emojis strategically (not too many, but enough to break text)
- Feel personal and authentic, like a real person talking
- Use short paragraphs for readability
- Include specific numbers, percentages, or details when available
- Work perfectly for Instagram, Facebook, LinkedIn, and Twitter
- The caption should make someone who reads it FEEL something and WANT to take action`
        }
      ],
      max_tokens: 2000,
      temperature: 0.85,
    });
    const caption = completion.choices[0]?.message?.content?.trim() || '';
    console.log(`[Genblaze] Caption length: ${caption.split(' ').length} words`);
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
        {
          role: 'system',
          content: `World-class marketing strategist with 15 years experience for Fortune 500 brands. Write in ${langName}.`
        },
        {
          role: 'user',
          content: `Give 3 POWERFUL, SPECIFIC, ACTIONABLE marketing strategy tips for THIS exact campaign:

TITLE: "${title}"
DESCRIPTION: ${description}

Each tip must:
- Be SPECIFIC to this exact product/service (not generic advice)
- Include concrete numbers, platforms, timing, and budget suggestions
- Focus on ROI-driving actions the user can take TODAY
- Be 2-3 sentences with real detail
- Be bold and decisive

Format as numbered list (1-3).`
        }
      ],
      max_tokens: 500,
      temperature: 0.8,
    });
    return completion.choices[0]?.message?.content?.trim() || '';
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

    const description = campaign.description || 'A great product';

    // Step 1: Detect language
    const language = await detectLanguage(description);
    const langName = LANG_NAMES[language] || 'English';
    console.log(`[Genblaze] Detected language: ${language}`);

    // Step 2: Generate title
    const title = await generateCampaignTitle(description, language);
    await prisma.campaign.update({ where: { id: campaignId }, data: { title } });
    console.log(`[Genblaze] Title: ${title}`);

    // Step 3 & 4: Generate image AND caption in parallel (both fast)
    console.log(`[Genblaze] Generating image and caption in parallel...`);
    const [posterResult, captionResult] = await Promise.allSettled([
      generatePosterImage(title, description, campaignId, language),
      generateCaption(title, description, language),
    ]);

    // Handle image result
    let posterUrl = '';
    if (posterResult.status === 'fulfilled') {
      posterUrl = posterResult.value;
      await prisma.generatedFile.create({
        data: { campaignId, url: posterUrl, type: 'poster' }
      });
      console.log(`[Genblaze] Image generated: ${posterUrl.substring(0, 80)}...`);
    } else {
      console.error('[Genblaze] Image generation failed:', posterResult.reason);
    }

    // Handle caption result
    let caption = captionResult.status === 'fulfilled' ? captionResult.value : '';
    if (!caption) {
      caption = `Discover ${title} - ${description}`;
    }
    await prisma.generatedFile.create({
      data: { campaignId, url: '', type: 'caption', content: caption }
    });
    console.log(`[Genblaze] Caption generated (${caption.split(' ').length} words)`);

    // Step 5: Generate strategy (fast)
    let suggestions = await generateStrategy(title, description, language);
    if (!suggestions) {
      suggestions = language === 'fr'
        ? "1. Lancez une campagne Instagram Reels ciblant les 18-35 ans aux heures de pointe (19h-21h) avec un budget de 50-100 FCFA par clic.\n2. Créez une offre flash 48h exclusive WhatsApp Status avec un code promo pour créer l'urgence.\n3. Contactez 5-10 micro-influenceurs locaux pour un partenariat de contenu authentique."
        : "1. Run an Instagram Reels campaign targeting 18-35 year-olds during peak hours (7-9 PM) with $0.50-1.00 CPC budget for maximum reach.\n2. Create a 48-hour flash sale exclusive to WhatsApp Status viewers with a unique promo code to drive urgency.\n3. Partner with 5-10 local micro-influencers for authentic UGC content that builds trust and social proof.";
    }
    await prisma.generatedFile.create({
      data: { campaignId, url: '', type: 'caption', content: `STRATEGY:${suggestions}` }
    });

    // Mark campaign as completed NOW (without video)
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'completed' },
    });
    console.log(`[Genblaze] Campaign ${campaignId} completed (${language}). Image + caption + strategy done.`);

    // Step 6: Generate video in BACKGROUND (don't block the user)
    generateVideoInBackground(campaignId, title, description, posterUrl, language).catch(e => {
      console.error('[Genblaze] Background video failed:', e);
    });

  } catch (error) {
    console.error(`Error generating assets for campaign ${campaignId}:`, error);
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'failed' },
    });
  }
};

/**
 * Generate video in background AFTER campaign is marked completed.
 * The user can already see their image, caption, and strategy.
 * Video will appear when ready.
 */
const generateVideoInBackground = async (
  campaignId: string,
  title: string,
  description: string,
  posterUrl: string,
  language: string
) => {
  console.log(`[Genblaze] Starting background video generation for ${campaignId}...`);
  try {
    const videoResult = await createPromotionalVideo(title, description, posterUrl, language);
    if (videoResult && videoResult.url) {
      const videoFileName = `campaigns/${campaignId}/video_${Date.now()}.mp4`;
      const videoUrl = await uploadFromUrl(videoResult.url, videoFileName);
      await prisma.generatedFile.create({
        data: { campaignId, url: videoUrl, type: 'video' }
      });
      console.log(`[Genblaze] Background video completed: ${videoUrl.substring(0, 80)}...`);
    }
  } catch (e: any) {
    console.error('[Genblaze] Background video generation failed:', e?.message || e);
  }
};
