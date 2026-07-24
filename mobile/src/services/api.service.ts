const API_URL = 'https://shaky-weeks-give.loca.lt/api';

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
