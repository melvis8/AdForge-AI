import { PrismaClient } from '@prisma/client';
import { createPromotionalVideo } from './video.service';
import { uploadBuffer, uploadFromUrl } from './storage.service';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

const LANG_NAMES: Record<string, string> = {
  en: 'English', fr: 'French', es: 'Spanish', de: 'German', pt: 'Portuguese',
  zh: 'Chinese', ja: 'Japanese', ko: 'Korean', ar: 'Arabic', ha: 'Hausa',
  yo: 'Yoruba', sw: 'Swahili', it: 'Italian', nl: 'Dutch', ru: 'Russian',
  hi: 'Hindi', tr: 'Turkish', vi: 'Vietnamese', th: 'Thai', id: 'Indonesian',
};

const detectLanguage = async (text: string): Promise<string> => {
  try {
    const response = await genAI.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: `Detect the language of the following text. Reply with ONLY the two-letter ISO 639-1 language code (e.g. "en", "fr", "es", "de", "zh", "ar", "pt", "ja", "ko", "ha", "yo", "sw"). No explanation, no punctuation, just the code.\n\nText: "${text}"`,
    });
    const lang = response.text?.trim().toLowerCase().replace(/[^a-z]/g, '').substring(0, 2) || 'en';
    console.log(`[Genblaze] Detected language: ${lang}`);
    return lang;
  } catch (e) {
    console.error('[Genblaze] Language detection failed:', e);
    return 'en';
  }
};

const generateCampaignTitle = async (description: string, language: string): Promise<string> => {
  const langName = LANG_NAMES[language] || 'English';
  try {
    const response = await genAI.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: `You are an expert copywriter for a top advertising agency. Based on this campaign description, generate ONE short, powerful, high-impact campaign title (max 6 words). The title must be in ${langName}. No quotes, no period at the end. It should create urgency and excitement.\n\nDescription: "${description}"`,
    });
    const title = response.text?.trim() || description.substring(0, 50);
    console.log(`[Genblaze] Generated title (${language}): "${title}"`);
    return title;
  } catch (e) {
    console.error('[Genblaze] Title generation failed:', e);
    return description.substring(0, 50);
  }
};

const determineImageDimensions = (description: string): { width: number; height: number; aspectLabel: string } => {
  const lower = description.toLowerCase();
  if (lower.includes('story') || lower.includes('reel') || lower.includes('tiktok') || lower.includes('vertical') || lower.includes('portrait')) {
    return { width: 640, height: 1024, aspectLabel: 'portrait (9:16)' };
  }
  if (lower.includes('banner') || lower.includes('cover') || lower.includes('landscape') || lower.includes('header') || lower.includes('facebook cover') || lower.includes('twitter')) {
    return { width: 1024, height: 640, aspectLabel: 'landscape (16:10)' };
  }
  return { width: 1024, height: 1024, aspectLabel: 'square (1:1)' };
};

const generatePosterImage = async (title: string, description: string, campaignId: string, language: string): Promise<string> => {
  const { width, height, aspectLabel } = determineImageDimensions(description);
  const langName = LANG_NAMES[language] || 'English';

  // Try Gemini native image generation
  try {
    console.log('[Genblaze] Attempting Gemini native image generation...');
    const response = await genAI.models.generateContent({
      model: 'gemini-2.0-flash-exp',
      contents: `You are a world-class advertising creative director. Design a STUNNING, high-converting advertising poster for a campaign.

Campaign Title: "${title}"
Campaign Description: ${description}

Requirements:
- Aspect ratio: ${aspectLabel} (${width}x${height})
- Style: Premium brand aesthetic, clean modern design
- Color palette: Rich, vibrant colors that evoke desire and trust
- Typography feel: Bold headline text area at the top
- Layout: Professional advertising layout with clear visual hierarchy
- The poster should make viewers STOP scrolling and want to buy immediately
- Include visual elements that match the product/service described
- Make it look like it was designed by a top-tier creative agency
- Target audience: ${langName}-speaking market
- The image should be photorealistic or hyper-stylized, NOT cartoonish
- Add subtle premium touches: gradients, depth, shadows, bokeh effects`,
      config: {
        responseModalities: ['IMAGE'],
      },
    });

    const candidates = response.candidates;
    if (candidates && candidates.length > 0) {
      const parts = candidates[0].content?.parts;
      if (parts) {
        for (const part of parts) {
          if (part.inlineData && part.inlineData.data) {
            console.log('[Genblaze] Gemini returned image data, uploading to B2...');
            const imageBuffer = Buffer.from(part.inlineData.data, 'base64');
            const fileName = `campaigns/${campaignId}/poster_${Date.now()}.png`;
            try {
              const b2Url = await uploadBuffer(imageBuffer, fileName, part.inlineData.mimeType || 'image/png');
              console.log(`[Genblaze] Poster uploaded to B2: ${b2Url}`);
              return b2Url;
            } catch {
              // B2 upload failed, save locally as temp file and return a data URL approach
              // Instead, save to disk and serve via a temp endpoint - or just use Pollinations
              console.log('[Genblaze] B2 upload failed for Gemini image, using Pollinations fallback');
            }
          }
        }
      }
    }
    throw new Error('No image data in Gemini response');
  } catch (geminiError) {
    console.error('[Genblaze] Gemini image generation failed:', geminiError);
  }

  // Fallback: Pollinations.ai
  try {
    console.log('[Genblaze] Falling back to Pollinations.ai...');
    const promptResponse = await genAI.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: `You are a creative director writing an image generation prompt. Generate ONLY a detailed, comma-separated visual description for a stunning advertising poster.\n\nCampaign: "${title}"\nAbout: ${description}\n\nThe prompt must include: style (e.g. "professional advertising photography"), lighting (e.g. "golden hour", "studio lighting"), mood, color palette, composition, and "8k, photorealistic, advertising campaign, premium brand quality".\n\nOutput ONLY the prompt keywords, nothing else.`,
    });
    const imagePrompt = promptResponse.text?.trim() || `professional advertising poster for ${title}, premium brand, vibrant colors, 8k, photorealistic`;
    
    const encodedPrompt = encodeURIComponent(imagePrompt);
    const randomSeed = Math.floor(Math.random() * 1000000);
    const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?nologo=1&width=${width}&height=${height}&seed=${randomSeed}&enhance=true`;
    
    // Download and upload to B2 (uploadFromUrl returns sourceUrl if B2 fails)
    const fileName = `campaigns/${campaignId}/poster_${Date.now()}.jpg`;
    const resultUrl = await uploadFromUrl(pollinationsUrl, fileName);
    console.log(`[Genblaze] Poster URL: ${resultUrl}`);
    return resultUrl;
  } catch (fallbackError) {
    console.error('[Genblaze] Pollinations fallback failed:', fallbackError);
    // Return a reliable placeholder via Unsplash
    return `https://images.unsplash.com/photo-1542442828-287217bfb87f?ixlib=rb-4.0.3&auto=format&fit=crop&w=${width}&q=80`;
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

    // Step 0: Detect language
    console.log(`[Genblaze] Step 0: Detecting language...`);
    const language = await detectLanguage(description);
    const langName = LANG_NAMES[language] || 'English';
    console.log(`[Genblaze] Detected language: ${language} (${langName})`);

    // Step 1: Generate title
    console.log(`[Genblaze] Step 1: Generating title...`);
    const title = await generateCampaignTitle(description, language);
    await prisma.campaign.update({ where: { id: campaignId }, data: { title } });

    // Step 2: Generate poster image
    console.log(`[Genblaze] Step 2: Generating poster...`);
    const posterUrl = await generatePosterImage(title, description, campaignId, language);
    await prisma.generatedFile.create({
      data: { campaignId, url: posterUrl, type: 'poster' }
    });

    // Step 3: Generate HIGH-CONVERTING caption
    console.log(`[Genblaze] Step 3: Generating powerful caption...`);
    let caption = '';
    try {
      const captionResponse = await genAI.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: `You are the world's best social media copywriter. Write a HIGH-CONVERTING social media caption for this campaign that makes people WANT to click, buy, or take action immediately.

Campaign Title: "${title}"
Campaign Description: ${description}
Language: ${langName}

Rules:
- Write in ${langName}
- Open with a HOOK that stops the scroll (question, bold statement, or surprising fact)
- Create urgency (limited time, exclusive, don't miss out)
- Include a clear call-to-action
- Use 3-5 relevant trending hashtags
- Add strategic emojis (not too many, not too few - 4-6 max)
- Keep it under 200 words
- Make it feel personal, like talking to a friend
- End with urgency or FOMO

Example of a great caption:
"Stop scrolling. Your skin deserves this. ✨ Our new Vitamin C serum is dermatologist-tested, 100% natural, and already sold out 3 times. Over 10,000 happy customers can't be wrong. Ready for your glow-up? Link in bio before it's gone again. 🔥 #SkincareRoutine #GlowUp #NaturalBeauty #VitaminC #SelfCare"`,
      });
      caption = captionResponse.text?.trim() || '';
    } catch (e) {
      console.error('[Genblaze] Caption generation failed:', e);
    }

    if (!caption) {
      caption = `Discover ${title} - a game-changer you don't want to miss. ${description}`;
    }
    
    await prisma.generatedFile.create({
      data: { campaignId, url: '', type: 'caption', content: caption }
    });

    // Step 4: Generate video
    console.log(`[Genblaze] Step 4: Generating video...`);
    let videoUrl = '';
    try {
      const videoResult = await createPromotionalVideo(title, description, posterUrl, language);
      const videoFileName = `campaigns/${campaignId}/video_${Date.now()}.mp4`;
      videoUrl = await uploadFromUrl(videoResult.url, videoFileName);
      console.log(`[Genblaze] Video URL: ${videoUrl}`);
    } catch (videoError) {
      console.error('[Genblaze] Video generation failed:', videoError);
      // Use a reliable fallback video
      videoUrl = 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4';
    }

    await prisma.generatedFile.create({
      data: { campaignId, url: videoUrl, type: 'video' }
    });

    // Step 5: Generate POWERFUL marketing strategy
    console.log(`[Genblaze] Step 5: Generating strategy...`);
    let suggestions = '';
    try {
      const strategyResponse = await genAI.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: `You are a world-class digital marketing strategist with 15 years of experience running campaigns for Fortune 500 brands. Give 3 POWERFUL, SPECIFIC, ACTIONABLE marketing strategy tips for this campaign.

Campaign Title: "${title}"
Campaign Description: ${description}
Language: ${langName}

Requirements:
- Write in ${langName}
- Each tip must be SPECIFIC to this campaign (not generic advice)
- Include concrete numbers, platforms, and timing
- Focus on ROI-driving actions
- Format as numbered list (1-3)
- Each tip should be 1-2 sentences max
- Be bold and decisive like a real strategist would be`,
      });
      suggestions = strategyResponse.text?.trim() || '';
    } catch (e) {
      console.error('[Genblaze] Strategy generation failed:', e);
    }

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
    
    console.log(`Campaign ${campaignId} generation completed (${language}).`);
  } catch (error) {
    console.error(`Error generating assets for campaign ${campaignId}:`, error);
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'failed' },
    });
  }
};
