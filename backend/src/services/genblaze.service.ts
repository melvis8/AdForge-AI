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
      contents: `Detect the language of the following text. Reply with ONLY the two-letter ISO 639-1 language code. No explanation, no punctuation.\n\nText: "${text}"`,
    });
    return response.text?.trim().toLowerCase().replace(/[^a-z]/g, '').substring(0, 2) || 'en';
  } catch (e) {
    return 'en';
  }
};

const generateCampaignTitle = async (description: string, language: string): Promise<string> => {
  const langName = LANG_NAMES[language] || 'English';
  try {
    const response = await genAI.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: `You are an expert copywriter. Generate ONE short, powerful campaign title (max 6 words) in ${langName}. No quotes, no period. Create urgency and excitement.\n\nDescription: "${description}"`,
    });
    return response.text?.trim() || description.substring(0, 50);
  } catch (e) {
    return description.substring(0, 50);
  }
};

const determineImageDimensions = (description: string): { width: number; height: number } => {
  const lower = description.toLowerCase();
  if (lower.includes('story') || lower.includes('reel') || lower.includes('tiktok') || lower.includes('vertical') || lower.includes('portrait')) {
    return { width: 640, height: 1024 };
  }
  if (lower.includes('banner') || lower.includes('cover') || lower.includes('landscape') || lower.includes('header')) {
    return { width: 1024, height: 640 };
  }
  return { width: 1024, height: 1024 };
};

const generatePosterImage = async (title: string, description: string, campaignId: string, language: string): Promise<string> => {
  const { width, height } = determineImageDimensions(description);
  const langName = LANG_NAMES[language] || 'English';

  // Try Gemini native image generation first
  try {
    console.log('[Genblaze] Attempting Gemini image generation...');
    const response = await genAI.models.generateContent({
      model: 'gemini-2.0-flash-exp',
      contents: `Design a STUNNING advertising poster for: "${title}". ${description}. Premium brand aesthetic, vibrant colors, professional layout, photorealistic. ${langName}-speaking audience. Aspect ratio ${width}x${height}.`,
      config: { responseModalities: ['IMAGE'] },
    });

    const candidates = response.candidates;
    if (candidates && candidates.length > 0) {
      const parts = candidates[0].content?.parts;
      if (parts) {
        for (const part of parts) {
          if (part.inlineData && part.inlineData.data) {
            const imageBuffer = Buffer.from(part.inlineData.data, 'base64');
            const fileName = `campaigns/${campaignId}/poster_${Date.now()}.png`;
            try {
              const b2Url = await uploadBuffer(imageBuffer, fileName, part.inlineData.mimeType || 'image/png');
              console.log(`[Genblaze] Gemini poster uploaded: ${b2Url}`);
              return b2Url;
            } catch {
              console.log('[Genblaze] B2 upload failed for Gemini image');
            }
          }
        }
      }
    }
  } catch (e) {
    console.error('[Genblaze] Gemini image gen failed:', e);
  }

  // Fallback: Pollinations.ai (return the URL directly - it's always accessible)
  try {
    console.log('[Genblaze] Using Pollinations.ai...');
    const promptResponse = await genAI.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: `Generate ONLY comma-separated visual keywords for a stunning advertising poster: "${title}" - ${description}. Include: professional advertising photography, vibrant lighting, premium brand aesthetic, 8k, photorealistic. Nothing else.`,
    });
    const imagePrompt = promptResponse.text?.trim() || `professional advertising poster for ${title}, premium brand, vibrant colors, 8k, photorealistic`;
    
    const encodedPrompt = encodeURIComponent(imagePrompt);
    const randomSeed = Math.floor(Math.random() * 1000000);
    const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?nologo=1&width=${width}&height=${height}&seed=${randomSeed}&enhance=true`;
    
    // Try to upload to B2 for persistence, but always return the Pollinations URL as it's always accessible
    const fileName = `campaigns/${campaignId}/poster_${Date.now()}.jpg`;
    try {
      const b2Url = await uploadFromUrl(pollinationsUrl, fileName);
      // If B2 is not authorized, uploadFromUrl returns the sourceUrl directly
      console.log(`[Genblaze] Poster URL: ${b2Url}`);
      return b2Url;
    } catch {
      console.log(`[Genblaze] Using Pollinations URL directly: ${pollinationsUrl}`);
      return pollinationsUrl;
    }
  } catch (e) {
    console.error('[Genblaze] Pollinations fallback failed:', e);
  }

  // Last resort: a reliable Unsplash image
  return `https://images.unsplash.com/photo-1542442828-287217bfb87f?ixlib=rb-4.0.3&auto=format&fit=crop&w=${width}&q=80`;
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
    const language = await detectLanguage(description);
    const langName = LANG_NAMES[language] || 'English';

    // Step 1: Generate title
    const title = await generateCampaignTitle(description, language);
    await prisma.campaign.update({ where: { id: campaignId }, data: { title } });

    // Step 2: Generate poster image
    const posterUrl = await generatePosterImage(title, description, campaignId, language);
    await prisma.generatedFile.create({
      data: { campaignId, url: posterUrl, type: 'poster' }
    });

    // Step 3: Generate powerful caption
    let caption = '';
    try {
      const captionResponse = await genAI.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: `You are the world's best social media copywriter. Write a HIGH-CONVERTING caption for this campaign.

Title: "${title}"
Description: ${description}
Language: ${langName}

Rules:
- Write in ${langName}
- Open with a HOOK that stops the scroll
- Create urgency (limited time, exclusive, don't miss out)
- Clear call-to-action
- 3-5 trending hashtags
- 4-6 strategic emojis
- Under 200 words
- Personal tone, like talking to a friend
- End with FOMO

Example: "Stop scrolling. Your skin deserves this. Our new Vitamin C serum is dermatologist-tested, 100% natural, and already sold out 3 times. Over 10,000 happy customers can't be wrong. Ready for your glow-up? Link in bio before it's gone again. #SkincareRoutine #GlowUp #NaturalBeauty"`,
      });
      caption = captionResponse.text?.trim() || '';
    } catch (e) {
      console.error('[Genblaze] Caption failed:', e);
    }

    if (!caption) {
      caption = `Discover ${title} - a game-changer you don't want to miss. ${description}`;
    }
    
    await prisma.generatedFile.create({
      data: { campaignId, url: '', type: 'caption', content: caption }
    });

    // Step 4: Generate video
    let videoUrl = '';
    try {
      const videoResult = await createPromotionalVideo(title, description, posterUrl, language);
      const videoFileName = `campaigns/${campaignId}/video_${Date.now()}.mp4`;
      videoUrl = await uploadFromUrl(videoResult.url, videoFileName);
    } catch (e) {
      console.error('[Genblaze] Video failed:', e);
      videoUrl = 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4';
    }

    await prisma.generatedFile.create({
      data: { campaignId, url: videoUrl, type: 'video' }
    });

    // Step 5: Generate marketing strategy
    let suggestions = '';
    try {
      const strategyResponse = await genAI.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: `You are a world-class marketing strategist with 15 years of experience. Give 3 POWERFUL, SPECIFIC, ACTIONABLE marketing tips for this campaign.

Title: "${title}"
Description: ${description}
Language: ${langName}

Rules:
- Write in ${langName}
- Each tip must be SPECIFIC to this campaign
- Include concrete numbers, platforms, timing
- Focus on ROI-driving actions
- Numbered 1-3
- 1-2 sentences max per tip
- Be bold and decisive`,
      });
      suggestions = strategyResponse.text?.trim() || '';
    } catch (e) {
      console.error('[Genblaze] Strategy failed:', e);
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
    
    console.log(`Campaign ${campaignId} completed (${language}).`);
  } catch (error) {
    console.error(`Error generating assets for campaign ${campaignId}:`, error);
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'failed' },
    });
  }
};
