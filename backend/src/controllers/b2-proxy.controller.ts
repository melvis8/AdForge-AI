import { Request, Response } from 'express';
import { downloadFromB2 } from '../services/storage.service';

export const downloadB2File = async (req: Request, res: Response) => {
  try {
    const fileName = Array.isArray(req.params.fileName) ? req.params.fileName.join('/') : req.params.fileName;
    if (!fileName) {
      return res.status(400).json({ error: 'Missing file name' });
    }

    const bucketName = process.env.B2_BUCKET_NAME || 'AdForge-AI-bucket';
    const b2Url = `https://f005.backblazeb2.com/file/${bucketName}/${fileName}`;

    const buffer = await downloadFromB2(b2Url);

    const ext = (fileName.split('.').pop() || '').toLowerCase();
    const mimeTypes: Record<string, string> = {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
      gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
      mp4: 'video/mp4', webm: 'video/webm',
      mp3: 'audio/mpeg', wav: 'audio/wav',
    };
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    res.send(buffer);
  } catch (error: any) {
    console.error(`[B2Proxy] Failed to serve ${req.params.fileName}:`, error.message);
    res.status(404).json({ error: 'File not found' });
  }
};
