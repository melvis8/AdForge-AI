import AsyncStorage from '@react-native-async-storage/async-storage';

const CAMPAIGNS_KEY = '@campaigns_cache';

export interface OfflineCampaign {
  id: string;
  title: string;
  description: string;
  poster?: string;
  caption?: string;
  video?: string;
  strategy?: string;
  createdAt: string;
}

export const saveCampaignOffline = async (campaign: OfflineCampaign) => {
  try {
    const existingStr = await AsyncStorage.getItem(CAMPAIGNS_KEY);
    const existing: OfflineCampaign[] = existingStr ? JSON.parse(existingStr) : [];
    
    const index = existing.findIndex(c => c.id === campaign.id);
    if (index >= 0) {
      existing[index] = campaign;
    } else {
      existing.unshift(campaign);
    }
    
    await AsyncStorage.setItem(CAMPAIGNS_KEY, JSON.stringify(existing));
  } catch (error) {
    console.error('Failed to save offline campaign', error);
  }
};

export const getOfflineCampaigns = async (): Promise<OfflineCampaign[]> => {
  try {
    const existingStr = await AsyncStorage.getItem(CAMPAIGNS_KEY);
    return existingStr ? JSON.parse(existingStr) : [];
  } catch (error) {
    console.error('Failed to load offline campaigns', error);
    return [];
  }
};

export const getOfflineCampaignById = async (id: string): Promise<OfflineCampaign | null> => {
  try {
    const campaigns = await getOfflineCampaigns();
    return campaigns.find(c => c.id === id) || null;
  } catch (error) {
    console.error('Failed to get offline campaign by id', error);
    return null;
  }
};
