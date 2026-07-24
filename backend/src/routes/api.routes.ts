import { Router } from 'express';
import {
  createCampaign,
  uploadImages,
  startGeneration,
  getCampaign,
  getOfflineTemplates
} from '../controllers/campaign.controller';
import multer from 'multer';

const router = Router();
const upload = multer({ dest: 'uploads/' });

// Create campaign
router.post('/campaigns', createCampaign);

// Upload images
router.post('/campaigns/:id/upload', upload.array('files'), uploadImages);

// Start AI workflow
router.post('/campaigns/:id/generate', startGeneration);

// Retrieve campaign
router.get('/campaigns/:id', getCampaign);

// Get offline templates
router.get('/templates/offline', getOfflineTemplates);

export default router;
