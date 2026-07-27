import { PrismaClient } from '@prisma/client';
import { createPromotionalVideo } from './video.service';
import { uploadBuffer, uploadFromUrl } from './storage.service';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

/**
 * Generates a smart campaign title from the user's description using Gemini.
 */
const generateCampaignTitle = async (description: string): Promise<string> => {
  try {
    const response = await genAI.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: `Based on this campaign description, generate a short, catchy campaign title (max 6 words, no quotes, no punctuation at the end). Description: "${description}"`,
    });
    const title = response.text?.trim() || description.substring(0, 50);
    console.log(`[Genblaze] Generated title: "${title}"`);
    return title;
  } catch (e) {
    console.error('[Genblaze] Title generation failed:', e);
    return description.substring(0, 50);
  }
};

/**
 * Generates a campaign poster image using Gemini's native image generation.
 * Falls back to Pollinations.ai if Gemini image generation is unavailable.
 */
const generatePosterImage = async (title: string, description: string, campaignId: string): Promise<string> => {
  // Try Gemini native image generation first
  try {
    console.log('[Genblaze] Attempting Gemini native image generation...');
    const response = await genAI.models.generateContent({
      model: 'gemini-2.0-flash-exp',
      contents: `Create a stunning, professional, high-quality advertising poster image for a campaign called "${title}". The campaign is about: ${description}. Make it visually striking with vibrant colors, professional typography feel, and modern design aesthetics. The image should look like a premium marketing poster.`,
      config: {
        responseModalities: ['IMAGE'],
      },
    });

    // Extract image data from response
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
    const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?nologo=1&width=800&height=800&seed=${randomSeed}`;
    
    // Download from Pollinations and upload to B2
    try {
      const fileName = `campaigns/${campaignId}/poster_${Date.now()}.jpg`;
      const b2Url = await uploadFromUrl(pollinationsUrl, fileName);
      console.log(`[Genblaze] Pollinations poster uploaded to B2: ${b2Url}`);
      return b2Url;
    } catch (uploadError) {
      console.error('[Genblaze] B2 upload of Pollinations image failed:', uploadError);
      return pollinationsUrl; // Return Pollinations URL directly as last resort
    }
  } catch (fallbackError) {
    console.error('[Genblaze] All image generation failed:', fallbackError);
    return 'https://images.unsplash.com/photo-1542442828-287217bfb87f?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80';
  }
};

/**
 * Orchestrates the full campaign asset generation pipeline:
 * 1. Generates a smart campaign title from user prompt
 * 2. Generates an image using Gemini (uploaded to Backblaze B2)
 * 3. Generates a caption using Gemini
 * 4. Generates a promotional video via JSON2Video (uploaded to Backblaze B2)
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
    const title = campaign.title || description.substring(0, 50);

    // 1. Generate poster image (Gemini → B2)
    console.log(`[Genblaze] Step 1: Generating poster for "${title}"...`);
    const posterUrl = await generatePosterImage(title, description, campaignId);

    await prisma.generatedFile.create({
      data: {
        campaignId,
        url: posterUrl,
        type: 'poster',
      }
    });

    // 2. Generate caption (using Gemini text)
    console.log(`[Genblaze] Step 2: Generating caption...`);
    let caption = `Discover our amazing ${title}! 🔥 ${description} #Marketing #AI #AdForge`;
    try {
      const captionResponse = await genAI.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: `Write a short, catchy, and professional social media marketing caption for a campaign titled "${title}" with this description: "${description}". Include appropriate emojis and 3 trending hashtags.`,
      });
      caption = captionResponse.text?.trim() || caption;
      console.log(`[Genblaze] Caption generated: ${caption}`);
    } catch (e) {
      console.error('[Genblaze] Caption generation failed, using fallback:', e);
    }
    
    await prisma.generatedFile.create({
      data: {
        campaignId,
        url: '',
        type: 'caption',
        content: caption,
      }
    });

    // 3. Generate promotional video via JSON2Video
    console.log(`[Genblaze] Step 3: Generating video...`);
    let videoUrl = '';
    try {
      const videoResult = await createPromotionalVideo(title, description, posterUrl);
      
      // Upload the video to B2
      try {
        const videoFileName = `campaigns/${campaignId}/video_${Date.now()}.mp4`;
        const b2VideoUrl = await uploadFromUrl(videoResult.url, videoFileName);
        videoUrl = b2VideoUrl;
        console.log(`[Genblaze] Video uploaded to B2: ${videoUrl}`);
      } catch (uploadError) {
        console.error('[Genblaze] B2 video upload failed, using JSON2Video URL:', uploadError);
        videoUrl = videoResult.url;
      }
    } catch (videoError) {
      console.error('[Genblaze] Video generation failed, using fallback:', videoError);
      videoUrl = 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4';
    }

    await prisma.generatedFile.create({
      data: {
        campaignId,
        url: videoUrl,
        type: 'video',
      }
    });

    // 4. Generate marketing strategy suggestions
    console.log(`[Genblaze] Step 4: Generating strategy suggestions...`);
    let suggestions = `1. Post this on Instagram Stories at peak hours.\n2. Run a 48-hour flash promotion.\n3. Share on WhatsApp Status for local reach.`;
    try {
      const strategyResponse = await genAI.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: `Give exactly 3 concise, actionable marketing strategy tips for a campaign titled "${title}" about: "${description}". Number them 1-3. Be specific and practical.`,
      });
      suggestions = strategyResponse.text?.trim() || suggestions;
    } catch (e) {
      console.error('[Genblaze] Strategy generation failed:', e);
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
    
    console.log(`✅ Campaign ${campaignId} generation completed successfully.`);
  } catch (error) {
    console.error(`❌ Error generating assets for campaign ${campaignId}:`, error);
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'failed' },
    });
  }
};
