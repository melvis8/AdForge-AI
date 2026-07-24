import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { generateCampaignAssets } from '../services/genblaze.service';

const prisma = new PrismaClient();

export const createCampaign = async (req: Request, res: Response) => {
  try {
    const { title, description } = req.body;
    const campaign = await prisma.campaign.create({
      data: {
        title: title || 'New Campaign',
        description: description || '',
      },
    });
    res.status(201).json(campaign);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create campaign' });
  }
};

export const uploadImages = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const files = req.files as Express.Multer.File[];
    // Normally we'd upload to Backblaze B2 here and save URL
    const assets = await Promise.all(
      files.map((file) =>
        prisma.asset.create({
          data: {
            campaignId: id as string,
            url: `mock-url-${file.filename}`, // Mocked for now
            type: 'image',
          },
        })
      )
    );
    res.status(200).json({ message: 'Files uploaded successfully', assets });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to upload images' });
  }
};

export const startGeneration = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.campaign.update({
      where: { id: id as string },
      data: { status: 'generating' },
    });

    // We start generation asynchronously
    generateCampaignAssets(id as string).catch(console.error);

    res.status(200).json({ message: 'Generation started' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to start generation' });
  }
};

export const getCampaign = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const campaign = await prisma.campaign.findUnique({
      where: { id: id as string },
      include: {
        assets: true,
        generated: true,
        jobs: true,
      },
    });
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    res.status(200).json(campaign);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to retrieve campaign' });
  }
};

export const getOfflineTemplates = async (req: Request, res: Response) => {
  try {
    const templates = await prisma.offlineTemplate.findMany();
    res.status(200).json(templates);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
};

export const transcribeAudio = async (req: Request, res: Response) => {
  try {
    // For MVP, we mock the transcription response because we don't have
    // an OpenAI Whisper API key configured yet.
    // Normally we would use fs.createReadStream(req.file.path) and send to OpenAI.
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    res.status(200).json({ 
      text: "I sell homemade cakes in Yaoundé. I want a Valentine's Day promotion." 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to transcribe audio' });
  }
};
