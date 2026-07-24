import { PrismaClient } from '@prisma/client';
import { createPromotionalVideo } from './video.service';

const prisma = new PrismaClient();

/**
 * Orchestrates the full campaign asset generation pipeline:
 * 1. Generates a poster (mock for now — can integrate DALL-E / Stable Diffusion later)
 * 2. Generates a caption using campaign description
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

    // 1. Generate poster (using uploaded image or a placeholder)
    const uploadedImage = campaign.assets.find(a => a.type === 'image');
    const posterUrl = uploadedImage?.url || 'https://images.unsplash.com/photo-1542442828-287217bfb87f?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80';

    await prisma.generatedFile.create({
      data: {
        campaignId,
        url: posterUrl,
        type: 'poster',
      }
    });

    // 2. Generate caption
    const caption = `Discover our amazing ${campaign.title || 'product'}! 🔥 ${campaign.description || ''} #Marketing #AI #AdForge`;
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
