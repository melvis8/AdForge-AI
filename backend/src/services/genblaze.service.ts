import { PrismaClient } from '@prisma/client';
import { createPromotionalVideo } from './video.service';
import { uploadFromUrl, uploadBuffer } from './storage.service';
import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();
const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });

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
 * Generate a campaign poster image.
 * 1. Use Pollinations.ai to generate the image (free, no API key, generates from prompt)
 * 2. Upload the Pollinations image to B2 for persistence
 * 3. If B2 fails, return the Pollinations URL directly (it's still a real working URL)
 */
const generatePosterImage = async (title: string, description: string, campaignId: string, language: string): Promise<string> => {
  // Step 1: Generate a detailed visual prompt using OpenAI
  let visualPrompt = `professional advertising poster for ${title}, premium brand aesthetic, vibrant colors, 8k photorealistic, studio lighting, modern design`;
  try {
    const promptCompletion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You write image generation prompts. Output ONLY the prompt, nothing else.' },
        { role: 'user', content: `Write a detailed, vivid image prompt for an advertising poster. The poster is for: "${title}" - ${description}. Describe the exact scene, products, colors, lighting, mood, and style. Be very specific about what should appear in the image. Keep under 300 characters.` }
      ],
      max_tokens: 150,
      temperature: 0.8,
    });
    const generated = promptCompletion.choices[0]?.message?.content?.trim();
    if (generated && generated.length > 20) {
      visualPrompt = generated;
    }
  } catch (e) {
    console.error('[OpenAI] Image prompt generation failed:', e);
  }

  console.log(`[Genblaze] Image prompt: ${visualPrompt}`);

  // Step 2: Generate image with Pollinations.ai
  const encodedPrompt = encodeURIComponent(visualPrompt);
  const randomSeed = Math.floor(Math.random() * 1000000);
  const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?nologo=1&width=1024&height=1024&seed=${randomSeed}&enhance=true`;

  // Step 3: Download the image and upload to B2
  try {
    console.log(`[Genblaze] Downloading image from Pollinations...`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000); // 60s timeout for image generation
    const response = await fetch(pollinationsUrl, { signal: controller.signal });
    clearTimeout(timeout);

    if (response.ok) {
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const contentType = response.headers.get('content-type') || 'image/jpeg';
      const fileName = `campaigns/${campaignId}/poster_${Date.now()}.jpg`;

      // Try to upload to B2
      try {
        const b2Url = await uploadBuffer(buffer, fileName, contentType);
        console.log(`[Genblaze] Poster saved to B2: ${b2Url}`);
        return b2Url;
      } catch (b2Err) {
        console.log(`[Genblaze] B2 upload failed, saving to local uploads/`);
        // Save locally as fallback
        const fs = require('fs');
        const path = require('path');
        const localDir = path.join(process.cwd(), 'uploads', 'generated', campaignId);
        fs.mkdirSync(localDir, { recursive: true });
        const localPath = path.join(localDir, `poster_${Date.now()}.jpg`);
        fs.writeFileSync(localPath, buffer);
        console.log(`[Genblaze] Poster saved locally: ${localPath}`);
        // Return the Pollinations URL since it's a real working URL
        return pollinationsUrl;
      }
    }
  } catch (e) {
    console.error('[Genblaze] Image download failed:', e);
  }

  // Last resort: return the Pollinations URL directly (it will generate on access)
  return pollinationsUrl;
};

const generateCaption = async (title: string, description: string, language: string): Promise<string> => {
  const langName = LANG_NAMES[language] || 'English';
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are the world's best social media copywriter. You write captions that go viral, drive sales, and build brands. Your captions are LONG, detailed, and tell a story. Write in ${langName}.`
        },
        {
          role: 'user',
          content: `Write a POWERFUL, LONG-FORM social media caption (300-500 words) for this EXACT campaign. This caption should be detailed enough to post directly on Instagram, Facebook, or LinkedIn without any editing.

CAMPAIGN TITLE: "${title}"
CAMPAIGN DETAILS/DESCRIPTION: ${description}

STRUCTURE YOUR CAPTION LIKE THIS:

1. HOOK (first line that stops the scroll - question, bold statement, or surprising fact)
2. STORY (2-3 paragraphs about the product/service, its benefits, why it's special, who it's for)
3. SOCIAL PROOF (mention quality, customer satisfaction, or unique selling points)
4. URGENCY (limited time offer, limited stock, exclusive deal, seasonal relevance)
5. CALL TO ACTION (clear instruction on what to do next)
6. HASHTAGS (5-8 relevant trending hashtags)
7. EMOJIS (strategic placement throughout, not too many)

The caption MUST:
- Be DIRECTLY about THIS specific product/service from the description
- Reference specific details from the user's description (ingredients, location, price, discount, target audience)
- Tell a compelling story that makes people FEEL something
- Be long enough to be a complete social media post (300-500 words)
- Feel authentic and personal, not corporate or generic
- Include specific numbers, prices, or percentages when mentioned in the description
- Work for Instagram, Facebook, LinkedIn, or Twitter`
        }
      ],
      max_tokens: 1200,
      temperature: 0.85,
    });
    return completion.choices[0]?.message?.content?.trim() || '';
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

    // Step 2: Generate title
    const title = await generateCampaignTitle(description, language);
    await prisma.campaign.update({ where: { id: campaignId }, data: { title } });

    // Step 3: Generate image (Pollinations.ai -> B2 upload)
    const posterUrl = await generatePosterImage(title, description, campaignId, language);
    await prisma.generatedFile.create({
      data: { campaignId, url: posterUrl, type: 'poster' }
    });

    // Step 4: Generate LONG, compelling caption
    let caption = await generateCaption(title, description, language);
    if (!caption) {
      caption = `Discover ${title} - ${description}`;
    }
    await prisma.generatedFile.create({
      data: { campaignId, url: '', type: 'caption', content: caption }
    });

    // Step 5: Generate video (always try with fal.ai)
    let videoUrl = '';
    try {
      const videoResult = await createPromotionalVideo(title, description, posterUrl, language);
      if (videoResult && videoResult.url) {
        const videoFileName = `campaigns/${campaignId}/video_${Date.now()}.mp4`;
        videoUrl = await uploadFromUrl(videoResult.url, videoFileName);
      }
    } catch (e) {
      console.error('[Genblaze] Video generation failed:', e);
      videoUrl = 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4';
    }
    await prisma.generatedFile.create({
      data: { campaignId, url: videoUrl, type: 'video' }
    });

    // Step 6: Generate strategy
    let suggestions = await generateStrategy(title, description, language);
    if (!suggestions) {
      suggestions = language === 'fr'
        ? "1. Lancez une campagne Instagram Reels ciblant les 18-35 ans aux heures de pointe (19h-21h) avec un budget de 50-100 FCFA par clic.\n2. Créez une offre flash 48h exclusive WhatsApp Status avec un code promo pour créer l'urgence.\n3. Contactez 5-10 micro-influenceurs locaux pour un partenariat de contenu authentique."
        : "1. Run an Instagram Reels campaign targeting 18-35 year-olds during peak hours (7-9 PM) with $0.50-1.00 CPC budget for maximum reach.\n2. Create a 48-hour flash sale exclusive to WhatsApp Status viewers with a unique promo code to drive urgency.\n3. Partner with 5-10 local micro-influencers for authentic UGC content that builds trust and social proof.";
    }
    await prisma.generatedFile.create({
      data: { campaignId, url: '', type: 'caption', content: `STRATEGY:${suggestions}` }
    });

    // Done
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'completed' },
    });
    
    console.log(`Campaign ${campaignId} completed (${language}).`);
  } catch (error) {
    console.error(`Error generating assets for campaign ${campaignId}:`, error);
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'failed' },
    });
  }
};
