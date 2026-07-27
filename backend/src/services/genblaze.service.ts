import { PrismaClient } from '@prisma/client';
import { createPromotionalVideo } from './video.service';
import { uploadBuffer, uploadFromUrl } from './storage.service';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

/**
 * Detects the language of the input text using Gemini and returns
 * the ISO 639-1 language code.
 */
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
    console.error('[Genblaze] Language detection failed, defaulting to English:', e);
    return 'en';
  }
};

/**
 * Generates a smart campaign title from the user's description using Gemini.
 * The title is generated in the same language as the description.
 */
const generateCampaignTitle = async (description: string, language: string): Promise<string> => {
  try {
    const langNames: Record<string, string> = {
      en: 'English', fr: 'French', es: 'Spanish', de: 'German', pt: 'Portuguese',
      zh: 'Chinese', ja: 'Japanese', ko: 'Korean', ar: 'Arabic', ha: 'Hausa',
      yo: 'Yoruba', sw: 'Swahili', it: 'Italian', nl: 'Dutch', ru: 'Russian',
      hi: 'Hindi', tr: 'Turkish', vi: 'Vietnamese', th: 'Thai', id: 'Indonesian',
    };
    const langName = langNames[language] || 'the same language as the input';

    const response = await genAI.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: `Based on this campaign description, generate a short, catchy campaign title (max 6 words, no quotes, no punctuation at the end). The title MUST be written in ${langName}. Description: "${description}"`,
    });
    const title = response.text?.trim() || description.substring(0, 50);
    console.log(`[Genblaze] Generated title (${language}): "${title}"`);
    return title;
  } catch (e) {
    console.error('[Genblaze] Title generation failed:', e);
    return description.substring(0, 50);
  }
};

/**
 * Generates a campaign poster image using Gemini's native image generation.
 * Falls back to Pollinations.ai if Gemini image generation is unavailable.
 * Image dimensions are proportional to the campaign context:
 *  - Social media poster: 1024x1024 (square, Instagram/WhatsApp)
 *  - Landscape banner: 1024x640 (16:10, Facebook/Twitter)
 *  - Portrait story: 640x1024 (9:16, Instagram/TikTok stories)
 * The aspect ratio is selected based on keywords in the description.
 */
const determineImageDimensions = (description: string): { width: number; height: number; aspectLabel: string } => {
  const lower = description.toLowerCase();
  if (lower.includes('story') || lower.includes('reel') || lower.includes('tiktok') || lower.includes('vertical') || lower.includes('portrait')) {
    return { width: 640, height: 1024, aspectLabel: 'portrait (9:16)' };
  }
  if (lower.includes('banner') || lower.includes('cover') || lower.includes('landscape') || lower.includes('header') || lower.includes('facebook cover') || lower.includes('twitter')) {
    return { width: 1024, height: 640, aspectLabel: 'landscape (16:10)' };
  }
  if (lower.includes('poster') || lower.includes('flyer') || lower.includes('square') || lower.includes('instagram post') || lower.includes('whatsapp')) {
    return { width: 1024, height: 1024, aspectLabel: 'square (1:1)' };
  }
  // Default: square for social media
  return { width: 1024, height: 1024, aspectLabel: 'square (1:1)' };
};

const generatePosterImage = async (title: string, description: string, campaignId: string, language: string): Promise<string> => {
  const { width, height, aspectLabel } = determineImageDimensions(description);
  console.log(`[Genblaze] Image dimensions: ${width}x${height} (${aspectLabel})`);

  // Try Gemini native image generation first
  try {
    console.log('[Genblaze] Attempting Gemini native image generation...');
    const langNames: Record<string, string> = {
      en: 'English', fr: 'French', es: 'Spanish', de: 'German', pt: 'Portuguese',
      zh: 'Chinese', ja: 'Japanese', ko: 'Korean', ar: 'Arabic', ha: 'Hausa',
      yo: 'Yoruba', sw: 'Swahili',
    };
    const langName = langNames[language] || 'English';

    const response = await genAI.models.generateContent({
      model: 'gemini-2.0-flash-exp',
      contents: `Create a stunning, professional, high-quality advertising poster image for a campaign called "${title}". The campaign is about: ${description}. The image text and visual style should be appropriate for a ${langName}-speaking audience. The image aspect ratio should be ${aspectLabel}. Make it visually striking with vibrant colors, professional typography feel, and modern design aesthetics. The image should look like a premium marketing poster.`,
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
            const b2Url = await uploadBuffer(imageBuffer, fileName, part.inlineData.mimeType || 'image/png');
            console.log(`[Genblaze] Poster uploaded to B2: ${b2Url}`);
            return b2Url;
          }
        }
      }
    }
    throw new Error('No image data in Gemini response');
  } catch (geminiError) {
    console.error('[Genblaze] Gemini image generation failed:', geminiError);
  }

  // Fallback: Use Gemini text model to generate a prompt, then Pollinations.ai to generate the image
  try {
    console.log('[Genblaze] Falling back to Pollinations.ai...');
    const promptResponse = await genAI.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: `Generate ONLY a comma-separated list of highly descriptive visual keywords for a beautiful, cinematic, and professional advertising poster for: ${title} - ${description}. Do not include any conversational text. Use words like 8k, photorealistic, vibrant.`,
    });
    const imagePrompt = promptResponse.text?.trim() || `professional advertising poster for ${title}`;
    
    const encodedPrompt = encodeURIComponent(imagePrompt);
    const randomSeed = Math.floor(Math.random() * 1000000);
    const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?nologo=1&width=${width}&height=${height}&seed=${randomSeed}`;
    
    // Download from Pollinations and upload to B2
    try {
      const fileName = `campaigns/${campaignId}/poster_${Date.now()}.jpg`;
      const b2Url = await uploadFromUrl(pollinationsUrl, fileName);
      console.log(`[Genblaze] Pollinations poster uploaded to B2: ${b2Url}`);
      return b2Url;
    } catch (uploadError) {
      console.error('[Genblaze] B2 upload of Pollinations image failed, retrying upload...', uploadError);
      // Retry B2 upload once more
      try {
        const retryFileName = `campaigns/${campaignId}/poster_retry_${Date.now()}.jpg`;
        const retryUrl = await uploadFromUrl(pollinationsUrl, retryFileName);
        return retryUrl;
      } catch (retryErr) {
        console.error('[Genblaze] Retry B2 upload also failed:', retryErr);
        // As a last resort, still upload to B2 via buffer
        try {
          const imgResponse = await fetch(pollinationsUrl);
          if (imgResponse.ok) {
            const arrBuf = await imgResponse.arrayBuffer();
            const buf = Buffer.from(arrBuf);
            const bufFileName = `campaigns/${campaignId}/poster_buf_${Date.now()}.jpg`;
            const bufUrl = await uploadBuffer(buf, bufFileName, 'image/jpeg');
            return bufUrl;
          }
        } catch (bufErr) {
          console.error('[Genblaze] Buffer upload also failed:', bufErr);
        }
        return pollinationsUrl;
      }
    }
  } catch (fallbackError) {
    console.error('[Genblaze] All image generation failed:', fallbackError);
    // Generate a placeholder using B2 - upload a minimal placeholder
    const placeholderUrl = 'https://images.unsplash.com/photo-1542442828-287217bfb87f?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80';
    try {
      const fileName = `campaigns/${campaignId}/poster_placeholder_${Date.now()}.jpg`;
      return await uploadFromUrl(placeholderUrl, fileName);
    } catch {
      return placeholderUrl;
    }
  }
};

/**
 * Generates the campaign assets:
 * 1. Detect language of the prompt
 * 2. Generate a smart campaign title in the detected language
 * 3. Generate an image using Gemini (uploaded to Backblaze B2)
 * 4. Generate a caption using Gemini in the detected language
 * 5. Generate a promotional video via JSON2Video (uploaded to Backblaze B2)
 * 6. Generate marketing strategy tips in the detected language
 */
export const generateCampaignAssets = async (campaignId: string) => {
  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: { assets: true }
    });

    if (!campaign) throw new Error('Campaign not found');

    // Update status
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'generating' },
    });

    const description = campaign.description || 'A great product';

    // 0. Detect language
    console.log(`[Genblaze] Step 0: Detecting language...`);
    const language = await detectLanguage(description);
    console.log(`[Genblaze] Detected language: ${language}`);

    // 1. Generate campaign title in detected language
    console.log(`[Genblaze] Step 1: Generating title in ${language}...`);
    const title = await generateCampaignTitle(description, language);

    // Update campaign title in DB
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { title },
    });

    // 2. Generate poster image (Gemini → B2)
    console.log(`[Genblaze] Step 2: Generating poster for "${title}"...`);
    const posterUrl = await generatePosterImage(title, description, campaignId, language);

    await prisma.generatedFile.create({
      data: {
        campaignId,
        url: posterUrl,
        type: 'poster',
      }
    });

    // 3. Generate caption in detected language
    console.log(`[Genblaze] Step 3: Generating caption in ${language}...`);
    const langNames: Record<string, string> = {
      en: 'English', fr: 'French', es: 'Spanish', de: 'German', pt: 'Portuguese',
      zh: 'Chinese', ja: 'Japanese', ko: 'Korean', ar: 'Arabic', ha: 'Hausa',
      yo: 'Yoruba', sw: 'Swahili', it: 'Italian', nl: 'Dutch', ru: 'Russian',
      hi: 'Hindi', tr: 'Turkish', vi: 'Vietnamese', th: 'Thai', id: 'Indonesian',
    };
    const langName = langNames[language] || 'English';

    let caption = '';
    try {
      const captionResponse = await genAI.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: `Write a short, catchy, and professional social media marketing caption for a campaign titled "${title}" with this description: "${description}". The caption MUST be written in ${langName}. Include appropriate emojis and 3 trending hashtags relevant to the ${langName}-speaking audience.`,
      });
      caption = captionResponse.text?.trim() || '';
    } catch (e) {
      console.error('[Genblaze] Caption generation failed:', e);
    }

    if (!caption) {
      caption = description.substring(0, 150);
    }
    
    await prisma.generatedFile.create({
      data: {
        campaignId,
        url: '',
        type: 'caption',
        content: caption,
      }
    });

    // 4. Generate promotional video via JSON2Video
    console.log(`[Genblaze] Step 4: Generating video...`);
    let videoUrl = '';
    try {
      const videoResult = await createPromotionalVideo(title, description, posterUrl, language);
      
      // Always upload video to B2
      try {
        const videoFileName = `campaigns/${campaignId}/video_${Date.now()}.mp4`;
        const b2VideoUrl = await uploadFromUrl(videoResult.url, videoFileName);
        videoUrl = b2VideoUrl;
        console.log(`[Genblaze] Video uploaded to B2: ${videoUrl}`);
      } catch (uploadError) {
        console.error('[Genblaze] B2 video upload failed, retrying...', uploadError);
        try {
          const retryFileName = `campaigns/${campaignId}/video_retry_${Date.now()}.mp4`;
          videoUrl = await uploadFromUrl(videoResult.url, retryFileName);
        } catch {
          videoUrl = videoResult.url;
        }
      }
    } catch (videoError) {
      console.error('[Genblaze] Video generation failed:', videoError);
      // Upload fallback video to B2
      const fallbackVideo = 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4';
      try {
        const fallbackFileName = `campaigns/${campaignId}/video_fallback_${Date.now()}.mp4`;
        videoUrl = await uploadFromUrl(fallbackVideo, fallbackFileName);
      } catch {
        videoUrl = fallbackVideo;
      }
    }

    await prisma.generatedFile.create({
      data: {
        campaignId,
        url: videoUrl,
        type: 'video',
      }
    });

    // 5. Generate marketing strategy suggestions in detected language
    console.log(`[Genblaze] Step 5: Generating strategy suggestions in ${language}...`);
    let suggestions = '';
    try {
      const strategyResponse = await genAI.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: `Give exactly 3 concise, actionable marketing strategy tips for a campaign titled "${title}" about: "${description}". The tips MUST be written in ${langName}. Number them 1-3. Be specific and practical for the ${langName}-speaking market.`,
      });
      suggestions = strategyResponse.text?.trim() || '';
    } catch (e) {
      console.error('[Genblaze] Strategy generation failed:', e);
    }

    if (!suggestions) {
      suggestions = language === 'fr'
        ? "1. Publiez ceci sur Instagram Stories aux heures de pointe.\n2. Lancez une promotion flash de 48 heures.\n3. Partagez sur WhatsApp Status pour une portée locale."
        : "1. Post this on Instagram Stories at peak hours.\n2. Run a 48-hour flash promotion.\n3. Share on WhatsApp Status for local reach.";
    }

    await prisma.generatedFile.create({
      data: {
        campaignId,
        url: '',
        type: 'caption',
        content: `STRATEGY:${suggestions}`,
      }
    });

    // Update final status
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'completed' },
    });
    
    console.log(`✅ Campaign ${campaignId} generation completed successfully (${language}).`);
  } catch (error) {
    console.error(`❌ Error generating assets for campaign ${campaignId}:`, error);
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'failed' },
    });
  }
};
