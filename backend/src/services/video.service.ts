import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import ffmpegPath from 'ffmpeg-static';
import { downloadFromB2 } from './storage.service';

interface VideoResult {
  url: string;
  projectId: string;
}

export const createPromotionalVideo = async (
  title: string,
  description: string,
  posterUrl: string
): Promise<VideoResult> => {
  if (!posterUrl) throw new Error('No poster URL for video generation');
  if (!ffmpegPath) throw new Error('ffmpeg-static binary not found');

  console.log(`[Video] ffmpeg at: ${ffmpegPath}`);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adforge-video-'));
  const inputImage = path.join(tmpDir, 'input.jpg');
  const outputVideo = path.join(tmpDir, 'output.mp4');

  try {
    // Download poster — try B2 auth first, then direct fetch
    console.log('[Video] Downloading poster...');
    let buffer: Buffer;
    if (posterUrl.includes('backblazeb2.com')) {
      buffer = await downloadFromB2(posterUrl);
    } else {
      const response = await fetch(posterUrl);
      if (!response.ok) throw new Error(`Poster download failed: ${response.status}`);
      buffer = Buffer.from(await response.arrayBuffer());
    }
    fs.writeFileSync(inputImage, buffer);
    console.log(`[Video] Poster: ${buffer.length} bytes`);

    // Ken Burns effect: 10s zoom + pan
    const duration = 10;
    const fps = 30;
    const totalFrames = duration * fps;
    const vf = [
      'scale=1920:1920:force_original_aspect_ratio=increase,crop=1920:1920',
      `zoompan=z='min(zoom+0.001,1.2)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=1080x1080:fps=${fps}`,
    ].join(',');

    console.log('[Video] Generating...');
    execFileSync(ffmpegPath, [
      '-y',
      '-loop', '1', '-i', inputImage,
      '-vf', vf,
      '-c:v', 'libx264',
      '-t', String(duration),
      '-pix_fmt', 'yuv420p',
      '-preset', 'fast',
      '-crf', '23',
      outputVideo,
    ], { timeout: 120000, stdio: 'pipe', maxBuffer: 50 * 1024 * 1024 });

    const stats = fs.statSync(outputVideo);
    console.log(`[Video] Created: ${stats.size} bytes`);
    if (stats.size < 1000) throw new Error('Video too small');

    // Clean up input
    try { fs.unlinkSync(inputImage); } catch {}
    try { fs.rmdirSync(tmpDir); } catch {}

    return { url: outputVideo, projectId: 'ffmpeg-static' };
  } catch (e: any) {
    // Clean up on failure
    try { fs.unlinkSync(inputImage); } catch {}
    try { fs.unlinkSync(outputVideo); } catch {}
    try { fs.rmdirSync(tmpDir); } catch {}
    console.error('[Video] Failed:', e?.message || e);
    throw e;
  }
};
