// @ts-ignore
import B2 from 'backblaze-b2';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const b2 = new B2({
  applicationKeyId: process.env.B2_APP_KEY_ID || '',
  applicationKey: process.env.B2_APP_KEY || '',
});

let isB2Authorized = false;
let b2DownloadUrl = '';

const authorizeB2 = async () => {
  if (isB2Authorized) return;
  try {
    if (process.env.B2_APP_KEY_ID) {
      const authResponse = await b2.authorize();
      b2DownloadUrl = authResponse.data.downloadUrl;
      isB2Authorized = true;
      console.log('[B2] Authorized successfully. Download URL:', b2DownloadUrl);
    } else {
      console.warn('[B2] Credentials missing. Storage service running in mock mode.');
    }
  } catch (error) {
    console.error('[B2] Authorization failed:', error);
  }
};

/**
 * Upload a file from disk to Backblaze B2
 */
export const uploadFile = async (filePath: string, fileName: string): Promise<string> => {
  await authorizeB2();
  
  if (!isB2Authorized) {
    return `https://mock-storage.com/${fileName}`;
  }

  try {
    const bucketId = process.env.B2_BUCKET_ID || '';
    const uploadUrl = await b2.getUploadUrl({ bucketId });
    const fileData = fs.readFileSync(filePath);
    
    await b2.uploadFile({
      uploadUrl: uploadUrl.data.uploadUrl,
      uploadAuthToken: uploadUrl.data.authorizationToken,
      fileName: fileName,
      data: fileData,
    });

    const downloadUrl = `${b2DownloadUrl}/file/${process.env.B2_BUCKET_NAME}/${fileName}`;
    console.log(`[B2] File uploaded: ${downloadUrl}`);
    return downloadUrl;
  } catch (error) {
    console.error('[B2] File upload failed:', error);
    throw error;
  }
};

/**
 * Upload a Buffer directly to Backblaze B2 (for generated images/videos)
 */
export const uploadBuffer = async (buffer: Buffer, fileName: string, mimeType: string = 'b2/x-auto'): Promise<string> => {
  await authorizeB2();
  
  if (!isB2Authorized) {
    console.warn('[B2] Not authorized, returning mock URL');
    return `https://mock-storage.com/${fileName}`;
  }

  try {
    const bucketId = process.env.B2_BUCKET_ID || '';
    const uploadUrl = await b2.getUploadUrl({ bucketId });
    
    await b2.uploadFile({
      uploadUrl: uploadUrl.data.uploadUrl,
      uploadAuthToken: uploadUrl.data.authorizationToken,
      fileName: fileName,
      data: buffer,
      mime: mimeType,
    });

    const downloadUrl = `${b2DownloadUrl}/file/${process.env.B2_BUCKET_NAME}/${fileName}`;
    console.log(`[B2] Buffer uploaded: ${downloadUrl}`);
    return downloadUrl;
  } catch (error) {
    console.error('[B2] Buffer upload failed:', error);
    throw error;
  }
};

/**
 * Download a file from a URL and upload it to Backblaze B2
 */
export const uploadFromUrl = async (sourceUrl: string, fileName: string): Promise<string> => {
  try {
    console.log(`[B2] Downloading from URL: ${sourceUrl}`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout

    const response = await fetch(sourceUrl, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    
    return await uploadBuffer(buffer, fileName, contentType);
  } catch (error) {
    console.error('[B2] Upload from URL failed:', error);
    throw error;
  }
};
