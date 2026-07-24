import AsyncStorage from '@react-native-async-storage/async-storage';

export const saveCampaignLocally = async (campaign: any) => {
  try {
    const existing = await AsyncStorage.getItem('saved_campaigns');
    const campaigns = existing ? JSON.parse(existing) : [];
    campaigns.push(campaign);
    await AsyncStorage.setItem('saved_campaigns', JSON.stringify(campaigns));
  } catch (e) {
    console.error('Failed to save campaign locally', e);
  }
};

export const getSavedCampaigns = async () => {
  try {
    const existing = await AsyncStorage.getItem('saved_campaigns');
    return existing ? JSON.parse(existing) : [];
  } catch (e) {
    console.error('Failed to get saved campaigns', e);
    return [];
  }
};

// Mock Offline templates
export const getOfflineTemplates = () => {
  return [
    { category: 'Restaurant', type: 'caption', content: "Fresh meals prepared with love. Order today." },
    { category: 'Fashion', type: 'caption', content: "Discover elegant styles made for you." },
    { category: 'Beauty', type: 'caption', content: "Enhance your natural beauty." }
  ];
};
