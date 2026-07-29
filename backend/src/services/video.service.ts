import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import ffmpegPath from 'ffmpeg-static';

interface VideoResult {
  url: string;
  projectId: string;
}

/**
 * Creates a promotional video from the poster image using ffmpeg-static.
 * Produces a 10-second Ken Burns effect video with the campaign title overlay.
 * Uses the ffmpeg binary bundled via npm (no system install needed).
 */
export const createPromotionalVideo = async (
  title: string,
  description: string,
  posterUrl?: string,
  language: string = 'en'
): Promise<VideoResult> => {
  if (!posterUrl) {
    throw new Error('No poster URL provided for video generation');
  }

  if (!ffmpegPath) {
    throw new Error('ffmpeg-static binary not found');
  }

  console.log(`[Video] Using ffmpeg at: ${ffmpegPath}`);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adforge-video-'));
  const inputImage = path.join(tmpDir, 'input.jpg');
  const outputVideo = path.join(tmpDir, 'output.mp4');

  try {
    // Download the poster image
    console.log('[Video] Downloading poster image...');
    const response = await fetch(posterUrl);
    if (!response.ok) throw new Error(`Failed to download poster: ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(inputImage, buffer);
    console.log(`[Video] Poster downloaded (${buffer.length} bytes)`);

    // Create a Ken Burns effect video: slow zoom + pan with title overlay
    const duration = 10;
    const fps = 30;
    const totalFrames = duration * fps;

    // Escape special characters in the title for ffmpeg drawtext
    const escapeText = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/:/g, '\\:').replace(/%/g, '%%').replace(/\n/g, ' ');
    const escapedTitle = escapeText(title.substring(0, 50));
    const escapedDesc = escapeText(description.substring(0, 60));

    const ffmpegCmd = [
      `"${ffmpegPath}" -y`,
      `-loop 1 -i "${inputImage}"`,
      '-vf',
      `scale=1920:1920:force_original_aspect_ratio=increase,crop=1920:1920,` +
      `zoompan=z='min(zoom+0.001,1.2)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=1080x1080:fps=${fps},` +
      `drawtext=text='${escapedTitle}':fontcolor=white:fontsize=48:x=(w-text_w)/2:y=h-120:shadowcolor=black@0.8:shadowx=2:shadowy=2,` +
      `drawtext=text='${escapedDesc}':fontcolor=white@0.8:fontsize=28:x=(w-text_w)/2:y=h-60:shadowcolor=black@0.6:shadowx=1:shadowy=1`,
      '-c:v libx264',
      '-t', String(duration),
      '-pix_fmt yuv420p',
      '-preset fast',
      '-crf 23',
      `"${outputVideo}"`,
    ].join(' ');

    console.log('[Video] Generating video with ffmpeg-static...');
    execSync(ffmpegCmd, {
      timeout: 120000,
      stdio: 'pipe',
      maxBuffer: 50 * 1024 * 1024,
    });

    // Verify the video was created
    const stats = fs.statSync(outputVideo);
    console.log(`[Video] Video created: ${stats.size} bytes`);

    if (stats.size < 1000) {
      throw new Error('Video file too small, likely corrupt');
    }

    return { url: outputVideo, projectId: 'ffmpeg-static' };

  } catch (e: any) {
    console.error('[Video] Generation failed:', e?.message || e);
    throw e;
  }
};
