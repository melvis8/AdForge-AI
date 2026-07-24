import { PrismaClient } from '@prisma/client';
import { createPromotionalVideo } from './video.service';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

/**
 * Orchestrates the full campaign asset generation pipeline:
 * 1. Generates an image prompt using Gemini and fetches the image via Pollinations.ai
 * 2. Generates a caption using Gemini
 * 3. Generates a promotional video via JSON2Video API
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

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    // 1. Generate poster (using Gemini prompt + Pollinations.ai)
    let posterUrl = 'https://images.unsplash.com/photo-1542442828-287217bfb87f?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80';
    try {
      const imagePromptText = `Generate ONLY a comma-separated list of highly descriptive visual keywords for a beautiful, cinematic, and professional advertising poster for: ${campaign.title} - ${campaign.description}. Do not include any conversational text. Use words like 8k, photorealistic, vibrant.`;
      const imageResult = await model.generateContent(imagePromptText);
      const imagePrompt = imageResult.response.text().trim();
      
      const encodedPrompt = encodeURIComponent(imagePrompt);
      const randomSeed = Math.floor(Math.random() * 1000000);
      posterUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?nologo=1&width=800&height=800&seed=${randomSeed}`;
      console.log(`[Genblaze] Poster generated from prompt: ${imagePrompt}`);
    } catch (e) {
      console.error('[Genblaze] Image generation failed, using fallback:', e);
    }

    await prisma.generatedFile.create({
      data: {
        campaignId,
        url: posterUrl,
        type: 'poster',
      }
    });

    // 2. Generate caption (using Gemini)
    let caption = `Discover our amazing ${campaign.title || 'product'}! 🔥 ${campaign.description || ''} #Marketing #AI #AdForge`;
    try {
      const captionPrompt = `Write a short, catchy, and professional social media marketing caption for a campaign titled "${campaign.title}" with this description: "${campaign.description}". Include appropriate emojis and 3 trending hashtags.`;
      const captionResult = await model.generateContent(captionPrompt);
      caption = captionResult.response.text().trim();
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
    let videoUrl = '';
    try {
      const videoResult = await createPromotionalVideo(
        campaign.title || 'Your Campaign',
        campaign.description || 'An amazing product for you!',
        posterUrl
      );
      videoUrl = videoResult.url;
      console.log(`[Genblaze] Video generated: ${videoUrl}`);
    } catch (videoError) {
      console.error('[Genblaze] Video generation failed, using fallback:', videoError);
      // Fallback to a sample video if the API fails
      videoUrl = 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4';
    }

    await prisma.generatedFile.create({
      data: {
        campaignId,
        url: videoUrl,
        type: 'video',
      }
    });

    // Update final status
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'completed' },
    });
    
    console.log(`Campaign ${campaignId} generation completed.`);
  } catch (error) {
    console.error(`Error generating assets for campaign ${campaignId}:`, error);
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'failed' },
    });
  }
};
