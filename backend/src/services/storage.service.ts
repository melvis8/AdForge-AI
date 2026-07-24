import B2 from 'backblaze-b2';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const b2 = new B2({
  applicationKeyId: process.env.B2_APP_KEY_ID || '',
  applicationKey: process.env.B2_APP_KEY || '',
});

let isB2Authorized = false;

const authorizeB2 = async () => {
  if (isB2Authorized) return;
  try {
    if (process.env.B2_APP_KEY_ID) {
      await b2.authorize();
      isB2Authorized = true;
    } else {
      console.warn('B2 credentials missing. Storage service running in mock mode.');
    }
  } catch (error) {
    console.error('B2 Authorization failed:', error);
  }
};

export const uploadFile = async (filePath: string, fileName: string): Promise<string> => {
  await authorizeB2();
  
  if (!isB2Authorized) {
    // Return a mock URL if not configured
    return `https://mock-storage.com/${fileName}`;
  }

  try {
    const bucketId = process.env.B2_BUCKET_ID || '';
    const uploadUrl = await b2.getUploadUrl({ bucketId });
    const fileData = fs.readFileSync(filePath);
    
    const uploadRes = await b2.uploadFile({
      uploadUrl: uploadUrl.data.uploadUrl,
      uploadAuthToken: uploadUrl.data.authorizationToken,
      fileName: fileName,
      data: fileData,
    });

    // We construct the download URL manually
    return `https://f000.backblazeb2.com/file/${process.env.B2_BUCKET_NAME}/${fileName}`;
  } catch (error) {
    console.error('File upload failed:', error);
    throw error;
  }
};
