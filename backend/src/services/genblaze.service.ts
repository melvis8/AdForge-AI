import { PrismaClient } from '@prisma/client';
import { createPromotionalVideo } from './video.service';
import { uploadFromUrl } from './storage.service';
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
      contents: `Detect the language. Reply ONLY with the 2-letter code (en, fr, es, de, pt, zh, ja, ko, ar, ha, yo, sw, etc). No explanation.\n\n"${text}"`,
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
        {
          role: 'system',
          content: `You are an expert advertising copywriter. Generate campaign titles in ${langName}. Output ONLY the title text, nothing else.`
        },
        {
          role: 'user',
          content: `Generate ONE short, powerful, high-impact campaign title (max 6 words) for this campaign. Must be in ${langName}. Create urgency and excitement. No quotes, no period.\n\nCampaign: "${description}"`
        }
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

const generatePosterImage = async (title: string, description: string, campaignId: string, language: string): Promise<string> => {
  // Try DALL-E first for a high-quality image
  try {
    console.log('[OpenAI] Generating image with DALL-E...');
    const imagePrompt = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a creative director writing image generation prompts. Output ONLY the prompt text, nothing else.`
        },
        {
          role: 'user',
          content: `Write a detailed DALL-E prompt for a stunning advertising poster for: "${title}" - ${description}. Include: style (photorealistic/illustrated), lighting, mood, colors, composition. Make it look like a premium brand campaign. Keep it under 400 characters.`
        }
      ],
      max_tokens: 200,
      temperature: 0.8,
    });
    
    const prompt = imagePrompt.choices[0]?.message?.content?.trim() || `Professional advertising poster for ${title}, premium brand, vibrant colors, 8k, photorealistic`;
    
    const image = await openai.images.generate({
      model: 'dall-e-3',
      prompt: prompt,
      size: '1024x1024',
      quality: 'standard',
      n: 1,
    });
    
    const imageUrl = image.data?.[0]?.url;
    if (imageUrl) {
      console.log(`[OpenAI] DALL-E image generated`);
      // Try to upload to B2 for persistence, return source URL if B2 unavailable
      try {
        const fileName = `campaigns/${campaignId}/poster_${Date.now()}.png`;
        const b2Url = await uploadFromUrl(imageUrl, fileName);
        console.log(`[OpenAI] Poster uploaded: ${b2Url}`);
        return b2Url;
      } catch {
        return imageUrl;
      }
    }
  } catch (e) {
    console.error('[OpenAI] DALL-E failed:', e);
  }

  // Fallback: Pollinations.ai
  try {
    console.log('[Fallback] Using Pollinations.ai...');
    const promptCompletion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'user', content: `Generate comma-separated visual keywords for: "${title}" - ${description}. Include: professional advertising photography, vibrant lighting, premium brand, 8k, photorealistic. Only keywords, nothing else.` }
      ],
      max_tokens: 100,
    });
    const prompt = promptCompletion.choices[0]?.message?.content?.trim() || `professional advertising poster for ${title}, vibrant colors, 8k`;
    const encodedPrompt = encodeURIComponent(prompt);
    const randomSeed = Math.floor(Math.random() * 1000000);
    return `https://image.pollinations.ai/prompt/${encodedPrompt}?nologo=1&width=1024&height=1024&seed=${randomSeed}&enhance=true`;
  } catch {
    return `https://images.unsplash.com/photo-1542442828-287217bfb87f?ixlib=rb-4.0.3&auto=format&fit=crop&w=1024&q=80`;
  }
};

const generateCaption = async (title: string, description: string, language: string): Promise<string> => {
  const langName = LANG_NAMES[language] || 'English';
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are the world's best social media copywriter. You write captions that go viral and drive sales. Write in ${langName}.`
        },
        {
          role: 'user',
          content: `Write a HIGH-CONVERTING social media caption for this EXACT campaign:

CAMPAIGN TITLE: "${title}"
CAMPAIGN DETAILS: ${description}

The caption must:
- Be DIRECTLY about THIS product/service (not generic)
- Open with a scroll-stopping HOOK
- Mention specific benefits from the description
- Create real urgency (limited stock, time-bound offer, exclusive deal)
- Have a clear call-to-action
- Include 3-5 relevant trending hashtags
- Use 4-6 strategic emojis
- Under 200 words
- Feel personal, like a friend recommending something amazing
- End with FOMO

Example quality: "Stop scrolling. This changes everything. Our handcrafted chocolate cakes are made with 100% organic cocoa from Cameroon, baked fresh daily, and already loved by 500+ customers in Douala. This Valentine's, surprise someone special. Only 50 cakes available - last year we sold out in 3 days. Order now before it's too late. Order via WhatsApp link in bio. #ValentinesDay #ChocolateLovers #Douala #HandmadeCakes #LimitedEdition"`
        }
      ],
      max_tokens: 500,
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
          content: `You are a world-class digital marketing strategist with 15 years of experience running campaigns for Fortune 500 brands. Write in ${langName}.`
        },
        {
          role: 'user',
          content: `Give 3 POWERFUL, SPECIFIC, ACTIONABLE marketing strategy tips for THIS exact campaign:

TITLE: "${title}"
DESCRIPTION: ${description}

Each tip must:
- Be SPECIFIC to this product/service (not generic advice)
- Include concrete numbers, platforms, and timing
- Focus on ROI-driving actions
- Be 1-2 sentences max
- Be bold and decisive

Format as numbered list (1-3).`
        }
      ],
      max_tokens: 400,
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

    // Step 3: Generate image (DALL-E -> Pollinations fallback)
    const posterUrl = await generatePosterImage(title, description, campaignId, language);
    await prisma.generatedFile.create({
      data: { campaignId, url: posterUrl, type: 'poster' }
    });

    // Step 4: Generate caption (OpenAI)
    let caption = await generateCaption(title, description, language);
    if (!caption) {
      caption = `Discover ${title} - ${description}`;
    }
    await prisma.generatedFile.create({
      data: { campaignId, url: '', type: 'caption', content: caption }
    });

    // Step 5: Generate video (only if JSON2Video API key exists)
    let videoUrl = '';
    if (process.env.JSON2VIDEO_API_KEY) {
      try {
        const videoResult = await createPromotionalVideo(title, description, posterUrl, language);
        const videoFileName = `campaigns/${campaignId}/video_${Date.now()}.mp4`;
        videoUrl = await uploadFromUrl(videoResult.url, videoFileName);
      } catch (e) {
        console.error('[Genblaze] Video failed:', e);
      }
    }
    // Save video entry (empty URL if no video generated - ResultScreen handles this gracefully)
    await prisma.generatedFile.create({
      data: { campaignId, url: videoUrl, type: 'video' }
    });

    // Step 6: Generate strategy (OpenAI)
    let suggestions = await generateStrategy(title, description, language);
    if (!suggestions) {
      suggestions = language === 'fr'
        ? "1. Lancez une campagne Instagram Reels ciblant les 18-35 ans aux heures de pointe (19h-21h).\n2. Créez une offre flash 48h exclusive WhatsApp Status avec un code promo.\n3. Contactez 5-10 micro-influenceurs locaux pour un partenariat de contenu authentique."
        : "1. Run an Instagram Reels campaign targeting 18-35 year-olds during peak hours (7-9 PM).\n2. Create a 48-hour flash sale exclusive to WhatsApp Status viewers.\n3. Partner with 5-10 local micro-influencers for authentic UGC content.";
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
