// Deployed Render service API URL
const API_URL = 'https://adforge-api-hday.onrender.com/api';

export const checkBackendHealth = async () => {
  try {
    const response = await fetch(`${API_URL}/health`);
    return response.ok;
  } catch (error) {
    console.error('Health check failed:', error);
    return false;
  }
};

export const createCampaign = async (title: string, description: string) => {
  const response = await fetch(`${API_URL}/campaigns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, description }),
  });
  if (!response.ok) throw new Error('Failed to create campaign');
  return response.json();
};

export const startGeneration = async (campaignId: string) => {
  const response = await fetch(`${API_URL}/campaigns/${campaignId}/generate`, {
    method: 'POST',
  });
  if (!response.ok) throw new Error('Failed to start generation');
  return response.json();
};

export const getCampaign = async (campaignId: string) => {
  const response = await fetch(`${API_URL}/campaigns/${campaignId}`);
  if (!response.ok) throw new Error('Failed to fetch campaign');
  return response.json();
};

export const uploadCampaignImages = async (campaignId: string, imageUris: string[]) => {
  const formData = new FormData();
  imageUris.forEach((uri, index) => {
    const filename = uri.split('/').pop() || `image_${index}.jpg`;
    const match = /\.(\w+)$/.exec(filename);
    const type = match ? `image/${match[1]}` : 'image/jpeg';
    
    formData.append('files', {
      uri,
      name: filename,
      type,
    } as any);
  });

  const response = await fetch(`${API_URL}/campaigns/${campaignId}/upload`, {
    method: 'POST',
    body: formData,
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  if (!response.ok) throw new Error('Failed to upload images');
  return response.json();
};

export const uploadAudioForTranscription = async (audioUri: string): Promise<string> => {
  const formData = new FormData();
  const filename = audioUri.split('/').pop() || 'recording.m4a';
  
  formData.append('audio', {
    uri: audioUri,
    name: filename,
    type: 'audio/m4a',
  } as any);

  const response = await fetch(`${API_URL}/transcribe`, {
    method: 'POST',
    body: formData,
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  if (!response.ok) {
    const errorText = await response.text();
    console.error('Transcription API error:', errorText);
    throw new Error('Transcription failed: ' + errorText);
  }
  const data = await response.json();
  return data.text || '';
};
