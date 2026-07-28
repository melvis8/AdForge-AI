import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { generateCampaignAssets } from '../services/genblaze.service';
import { transcribeAudioFile } from '../services/transcription.service';
import { uploadFile } from '../services/storage.service';
import fs from 'fs';

const prisma = new PrismaClient();

export const createCampaign = async (req: Request, res: Response) => {
  try {
    const { title, description } = req.body;
    
    // If title isn't explicitly provided, use the prompt/description to create a clear title
    const campaignTitle = title && title !== 'New Campaign' 
      ? title 
      : (description ? description.substring(0, 45) + (description.length > 45 ? '...' : '') : 'New Campaign');

    const campaign = await prisma.campaign.create({
      data: {
        title: campaignTitle,
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
    const assets = await Promise.all(
      files.map(async (file) => {
        let b2Url = '';
        try {
          b2Url = await uploadFile(file.path, file.filename);
        } catch (uploadError) {
          console.error('[Controller] B2 Upload failed, using source URL', uploadError);
          b2Url = ''; // Will use local file path as fallback
        }

        // Clean up local file after uploading to cloud
        try {
          fs.unlinkSync(file.path);
        } catch (e) {}

        return prisma.asset.create({
          data: {
            campaignId: id as string,
            url: b2Url,
            type: 'image',
          },
        });
      })
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
    const file = (req as any).file as Express.Multer.File | undefined;
    
    if (!file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    console.log(`[Controller] Transcribing uploaded file: ${file.path}`);
    const text = await transcribeAudioFile(file.path);
    
    res.status(200).json({ text });
  } catch (error) {
    console.error('[Controller] Transcription error:', error);
    res.status(500).json({ error: 'Failed to transcribe audio' });
  }
};
