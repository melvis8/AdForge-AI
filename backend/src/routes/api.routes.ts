import { Router } from 'express';
import {
  createCampaign,
  uploadImages,
  startGeneration,
  getCampaign,
  getOfflineTemplates,
  transcribeAudio
} from '../controllers/campaign.controller';
import { downloadB2File } from '../controllers/b2-proxy.controller';
import multer from 'multer';

const router = Router();
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 25 * 1024 * 1024, files: 10 },
});

// Health check
router.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// B2 file proxy — streams private B2 files through backend auth
router.get('/files/{*fileName}', downloadB2File);

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

// Transcribe audio
router.post('/transcribe', upload.single('audio'), transcribeAudio);

export default router;
