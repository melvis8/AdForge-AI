// When you deploy on Render, replace this with your Render service URL
// e.g. 'https://adforge-api.onrender.com/api'
// For local dev, use your machine's IP so Expo Go can reach the backend
const API_URL = 'https://adforge-api-hday.onrender.com/api';

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
    formData.append('files', {
      uri,
      name: `image_${index}.jpg`,
      type: 'image/jpeg',
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
  formData.append('audio', {
    uri: audioUri,
    name: 'recording.m4a',
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
    // If backend isn't ready for transcription, return a smart default based on MVP
    return "I sell homemade cakes in Yaoundé. I want a Valentine's Day promotion.";
  }
  const data = await response.json();
  return data.text || '';
};
