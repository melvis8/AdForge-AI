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
let b2AuthToken = '';

const isPlaceholder = (val: string) => !val || val.startsWith('your_') || val === '';

const authorizeB2 = async () => {
  if (isB2Authorized) return;
  try {
    const keyId = process.env.B2_APP_KEY_ID || '';
    const key = process.env.B2_APP_KEY || '';
    const bucketId = process.env.B2_BUCKET_ID || '';

    if (isPlaceholder(keyId) || isPlaceholder(key) || isPlaceholder(bucketId)) {
      console.error('[B2] CRITICAL: Credentials are placeholders! Images will NOT be stored in B2.');
      console.error('[B2] Set real values in .env: B2_APP_KEY_ID, B2_APP_KEY, B2_BUCKET_ID');
      return;
    }

    const authResponse = await b2.authorize();
    b2DownloadUrl = authResponse.data.downloadUrl;
    b2AuthToken = authResponse.data.authorizationToken;
    isB2Authorized = true;
    console.log('[B2] Authorized successfully. Download URL:', b2DownloadUrl);
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
    // Return mock only as a last resort - callers should handle this
    throw new Error('B2 not authorized - cannot upload file');
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
 * Returns the proxy URL (for app consumption) on success, or throws on failure.
 */
export const uploadBuffer = async (buffer: Buffer, fileName: string, mimeType: string = 'b2/x-auto'): Promise<string> => {
  await authorizeB2();
  
  if (!isB2Authorized) {
    console.warn('[B2] Not authorized - cannot upload buffer, throwing for fallback');
    throw new Error('B2 not authorized');
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

    const b2Url = `${b2DownloadUrl}/file/${process.env.B2_BUCKET_NAME}/${fileName}`;
    const proxyUrl = `/api/files/${fileName}`;
    console.log(`[B2] Uploaded: ${b2Url} → proxy: ${proxyUrl}`);
    return proxyUrl;
  } catch (error) {
    console.error('[B2] Buffer upload failed:', error);
    throw error;
  }
};

/**
 * Get the raw B2 URL for a file (used internally for downloads)
 */
export const getB2Url = (fileName: string): string => {
  return `${b2DownloadUrl}/file/${process.env.B2_BUCKET_NAME}/${fileName}`;
};

/**
 * Download a file from a URL and upload it to Backblaze B2.
 * If B2 is not available, returns the original source URL so content still works.
 */
export const uploadFromUrl = async (sourceUrl: string, fileName: string): Promise<string> => {
  try {
    console.log(`[B2] Downloading from URL: ${sourceUrl}`);

    // Validate the source URL is reachable first
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    const response = await fetch(sourceUrl, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Source URL returned ${response.status}: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = response.headers.get('content-type') || 'application/octet-stream';

    // If B2 is not authorized, throw so caller knows the file is NOT in B2
    if (!isB2Authorized) {
      throw new Error('B2 not authorized - image will not be stored in B2 bucket');
    }
    
    return await uploadBuffer(buffer, fileName, contentType);
  } catch (error) {
    console.error('[B2] Upload from URL failed:', error);
    // Return the source URL so the content is still accessible
    console.log('[B2] Falling back to source URL');
    return sourceUrl;
  }
};

/**
 * Download a file from B2 using authenticated request.
 * Returns a Buffer for use by callers (e.g. video generation from poster).
 */
export const downloadFromB2 = async (b2Url: string): Promise<Buffer> => {
  await authorizeB2();

  if (!isB2Authorized) {
    throw new Error('B2 not authorized - cannot download');
  }

  const response = await fetch(b2Url, {
    headers: { Authorization: b2AuthToken },
  });
  if (!response.ok) throw new Error(`B2 download failed: ${response.status}`);

  const arrayBuffer = await response.arrayBuffer();
  console.log(`[B2] Downloaded: ${arrayBuffer.byteLength} bytes`);
  return Buffer.from(arrayBuffer);
};
