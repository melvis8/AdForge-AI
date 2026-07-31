import { Platform } from 'react-native';

// Auto-detect: local dev vs production
// In dev, try local first; in production always use Render URL
const IS_DEV = __DEV__;
const LOCAL_IP = '192.168.1.130';
const LOCAL_URL = `http://${LOCAL_IP}:4000/api`;
const PRODUCTION_URL = 'https://adforge-api-hday.onrender.com/api';

const API_URL = IS_DEV ? LOCAL_URL : PRODUCTION_URL;
console.log(`[API] Mode: ${IS_DEV ? 'DEV' : 'PROD'} → ${API_URL}`);

const REQUEST_TIMEOUT = 30000;

const fetchWithTimeout = async (url: string, options: RequestInit = {}): Promise<Response> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeout);
  }
};

export const checkBackendHealth = async (): Promise<boolean> => {
  try {
    const res = await fetchWithTimeout(`${API_URL.replace('/api', '')}/api/health`);
    const data = await res.json();
    return data.status === 'ok';
  } catch {
    return false;
  }
};

export const createCampaign = async (description: string): Promise<any> => {
  const res = await fetchWithTimeout(`${API_URL}/campaigns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description }),
  });
  if (!res.ok) throw new Error(`Failed to create campaign: ${res.status}`);
  return res.json();
};

export const generateCampaign = async (campaignId: string): Promise<any> => {
  const res = await fetchWithTimeout(`${API_URL}/campaigns/${campaignId}/generate`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`Failed to start generation: ${res.status}`);
  return res.json();
};

export const getCampaign = async (campaignId: string): Promise<any> => {
  const res = await fetchWithTimeout(`${API_URL}/campaigns/${campaignId}`);
  if (!res.ok) throw new Error(`Failed to get campaign: ${res.status}`);
  return res.json();
};

export const listCampaigns = async (): Promise<any[]> => {
  const res = await fetchWithTimeout(`${API_URL}/campaigns`);
  if (!res.ok) throw new Error(`Failed to list campaigns: ${res.status}`);
  return res.json();
};

export const uploadAudio = async (uri: string): Promise<string> => {
  const formData = new FormData();
  formData.append('audio', {
    uri,
    type: 'audio/m4a',
    name: 'recording.m4a',
  } as any);

  const res = await fetchWithTimeout(`${API_URL}/transcribe`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) throw new Error(`Transcription failed: ${res.status}`);
  const data = await res.json();
  return data.text || '';
};

export const getOfflineTemplates = async (): Promise<any[]> => {
  const res = await fetchWithTimeout(`${API_URL}/templates`);
  if (!res.ok) throw new Error(`Failed to get templates: ${res.status}`);
  return res.json();
};
