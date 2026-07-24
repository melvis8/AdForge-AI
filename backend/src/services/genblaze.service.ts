import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// This is a mocked orchestration flow for Genblaze
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

    // Mock delay for AI generation
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Generate poster
    await prisma.generatedFile.create({
      data: {
        campaignId,
        url: 'https://images.unsplash.com/photo-1542442828-287217bfb87f?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
        type: 'poster',
      }
    });

    // Generate caption
    await prisma.generatedFile.create({
      data: {
        campaignId,
        url: '',
        type: 'caption',
        content: `Discover our amazing ${campaign.title || 'product'}! 🔥 #Marketing #AI #AdForge`,
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
