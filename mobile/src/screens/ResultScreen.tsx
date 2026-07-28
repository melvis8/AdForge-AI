import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image,
  ActivityIndicator, Alert, useWindowDimensions, Share, Modal, Platform,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { getCampaign } from '../services/api.service';
import { saveCampaignOffline, getOfflineCampaignById } from '../services/offline.service';
import { Video, ResizeMode } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { LinearGradient } from 'expo-linear-gradient';
import { Linking } from 'react-native';

type Props = NativeStackScreenProps<RootStackParamList, 'Result'>;

interface CampaignData {
  id: string;
  title: string;
  description: string;
  poster: string;
  video: string;
  caption: string;
  strategy: string;
}

export default function ResultScreen({ route, navigation }: Props) {
  const { campaignId, offlineData } = route.params;
  const { width, height } = useWindowDimensions();
  const [campaignData, setCampaignData] = useState<CampaignData | null>(null);
  const [loading, setLoading] = useState(true);
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [sharingInProgress, setSharingInProgress] = useState(false);
  const isSmallScreen = height < 700;
  const isTablet = width >= 768;

  const loadCampaign = useCallback(async () => {
    setLoading(true);
    try {
      // If offline data was passed directly, use it first
      if (offlineData) {
        setCampaignData({
          id: offlineData.id,
          title: offlineData.title,
          description: offlineData.description || '',
          poster: offlineData.poster || '',
          video: offlineData.video || '',
          caption: offlineData.caption || '',
          strategy: offlineData.strategy || '',
        });
        // Still try to refresh from backend in background
        try {
          const data = await getCampaign(campaignId);
          if (data && data.generated) {
            const poster = data.generated.find((f: any) => f.type === 'poster')?.url || offlineData.poster || '';
            const video = data.generated.find((f: any) => f.type === 'video')?.url || offlineData.video || '';
            const captionObj = data.generated.find((f: any) => f.type === 'caption' && !f.content?.startsWith('STRATEGY:'));
            const strategyObj = data.generated.find((f: any) => f.content?.startsWith('STRATEGY:'));
            
            setCampaignData({
              id: data.id,
              title: data.title || offlineData.title,
              description: data.description || offlineData.description || '',
              poster,
              video,
              caption: captionObj?.content || offlineData.caption || '',
              strategy: strategyObj?.content?.replace('STRATEGY:', '') || offlineData.strategy || '',
            });
          }
        } catch {
          // Offline data is fine, don't show error
        }
        setLoading(false);
        return;
      }

      // Try backend
      try {
        const data = await getCampaign(campaignId);
        if (data && data.generated) {
          const poster = data.generated.find((f: any) => f.type === 'poster')?.url || '';
          const video = data.generated.find((f: any) => f.type === 'video')?.url || '';
          const captionObj = data.generated.find((f: any) => f.type === 'caption' && !f.content?.startsWith('STRATEGY:'));
          const strategyObj = data.generated.find((f: any) => f.content?.startsWith('STRATEGY:'));
          
          const result: CampaignData = {
            id: data.id,
            title: data.title || 'Your Campaign',
            description: data.description || '',
            poster,
            video,
            caption: captionObj?.content || '',
            strategy: strategyObj?.content?.replace('STRATEGY:', '') || '',
          };
          setCampaignData(result);

          // Save offline for future access
          await saveCampaignOffline({
            id: data.id,
            title: data.title || '',
            description: data.description || '',
            poster,
            video,
            caption: captionObj?.content || '',
            strategy: strategyObj?.content?.replace('STRATEGY:', '') || '',
            createdAt: data.createdAt || new Date().toISOString(),
          });
        }
      } catch (backendErr) {
        // Try offline storage
        const offline = await getOfflineCampaignById(campaignId);
        if (offline) {
          setCampaignData({
            id: offline.id,
            title: offline.title,
            description: offline.description || '',
            poster: offline.poster || '',
            video: offline.video || '',
            caption: offline.caption || '',
            strategy: offline.strategy || '',
          });
        } else {
          Alert.alert('Error', 'Could not load campaign details.');
        }
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Could not load campaign details.');
    } finally {
      setLoading(false);
    }
  }, [campaignId, offlineData]);

  useEffect(() => {
    loadCampaign();
  }, [loadCampaign]);

  const copyCaption = async () => {
    if (!campaignData?.caption) return;
    try {
      await navigator.clipboard?.writeText(campaignData.caption);
      Alert.alert('Copied', 'Caption copied to clipboard!');
    } catch {
      Alert.alert('Copy', campaignData.caption);
    }
  };

  const downloadMedia = async (url: string, filename: string): Promise<string | null> => {
    try {
      const ext = url.includes('.mp4') ? '.mp4' : url.includes('.png') ? '.png' : '.jpg';
      const fileUri = (FileSystem.cacheDirectory || '') + filename + ext;
      const { uri } = await FileSystem.downloadAsync(url, fileUri);
      return uri;
    } catch (e) {
      console.error('Download failed:', e);
      return null;
    }
  };

  // Share via the system share sheet (works with all social media apps)
  const handleSystemShare = async (mediaType: 'all' | 'poster' | 'video' | 'caption') => {
    if (!campaignData) return;
    setSharingInProgress(true);
    setShareModalVisible(false);

    try {
      if (mediaType === 'caption') {
        await Share.share({
          message: `${campaignData.title}\n\n${campaignData.caption}`,
          title: campaignData.title,
        });
        setSharingInProgress(false);
        return;
      }

      const urlMap: Record<string, string> = {
        poster: campaignData.poster,
        video: campaignData.video,
      };

      let mediaUrl = urlMap[mediaType];
      if (mediaType === 'all') {
        mediaUrl = campaignData.video || campaignData.poster;
      }

      if (!mediaUrl) {
        Alert.alert('No media', 'No media available to share for this campaign.');
        setSharingInProgress(false);
        return;
      }

      const fileUri = await downloadMedia(mediaUrl, `adforge_${mediaType}_${campaignData.id}`);
      if (fileUri) {
        await Sharing.shareAsync(fileUri, {
          dialogTitle: `Share ${campaignData.title}`,
          mimeType: mediaUrl.includes('.mp4') ? 'video/mp4' : 'image/jpeg',
          UTI: mediaUrl.includes('.mp4') ? 'public.movie' : 'public.image',
        });
      }
    } catch (e) {
      console.error('Share failed:', e);
      Alert.alert('Error', 'Failed to share. Please try again.');
    } finally {
      setSharingInProgress(false);
    }
  };

  // Share directly to specific social media apps
  const shareToSocial = async (platform: string) => {
    if (!campaignData) return;
    setSharingInProgress(true);
    setShareModalVisible(false);

    try {
      const captionText = `${campaignData.title}\n\n${campaignData.caption}`;
      const hasMedia = campaignData.poster || campaignData.video;

      if (!hasMedia) {
        // Text-only share
        await Share.share({ message: captionText, title: campaignData.title });
        setSharingInProgress(false);
        return;
      }

      // Download the media file first
      const mediaUrl = campaignData.video || campaignData.poster;
      const fileUri = await downloadMedia(mediaUrl, `adforge_share_${campaignData.id}`);
      
      if (!fileUri) {
        Alert.alert('Error', 'Failed to download media for sharing.');
        setSharingInProgress(false);
        return;
      }

      // Try platform-specific deep links, fall back to system share
      const encodedCaption = encodeURIComponent(captionText);
      const platformUrls: Record<string, string> = {
        instagram: '',
        whatsapp: `whatsapp://send?text=${encodedCaption}`,
        facebook: '',
        twitter: `twitter://post?message=${encodedCaption}`,
        telegram: `tg://msg?text=${encodedCaption}`,
        tiktok: '',
      };

      const shareOptions: any = {
        title: campaignData.title,
        excludedActivityTypes: [],
      };

      if (Platform.OS === 'ios') {
        shareOptions.UTI = campaignData.video ? 'public.movie' : 'public.image';
        shareOptions.mimeType = campaignData.video ? 'video/mp4' : 'image/jpeg';
      }

      // Use system share sheet — it shows all installed social media apps
      await Sharing.shareAsync(fileUri, shareOptions);
    } catch (e) {
      console.error('Social share failed:', e);
      Alert.alert('Error', 'Failed to share. Please try again.');
    } finally {
      setSharingInProgress(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#38bdf8" />
        <Text style={styles.loadingText}>Loading your campaign...</Text>
      </View>
    );
  }

  if (!campaignData) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.loadingText}>Campaign not found.</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Welcome')} style={{ marginTop: 20 }}>
          <Text style={{ color: '#38bdf8', fontSize: 16, fontWeight: '600' }}>Go Home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const suggestions = campaignData.strategy
    ? campaignData.strategy.split('\n').filter((s: string) => s.trim().length > 0)
    : [];

  const horizontalPad = isTablet ? 48 : 24;

  return (
    <LinearGradient colors={['#0f172a', '#1e1b4b']} style={styles.container}>
      <View style={[styles.header, { marginTop: isSmallScreen ? 30 : 50, paddingHorizontal: horizontalPad }]}>
        <TouchableOpacity onPress={() => navigation.navigate('Welcome')} style={styles.backButton}>
          <Text style={styles.backButtonText}>Home</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { fontSize: isTablet ? 24 : 20 }]} numberOfLines={1}>
          {campaignData.title}
        </Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingHorizontal: horizontalPad, paddingBottom: isSmallScreen ? 100 : 120 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Video Section */}
        {campaignData.video ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Promotional Video</Text>
            <View style={[styles.videoContainer, { height: isTablet ? 340 : 220 }]}>
              <Video
                source={{ uri: campaignData.video }}
                style={styles.video}
                useNativeControls
                resizeMode={ResizeMode.CONTAIN}
                isLooping
              />
            </View>
          </View>
        ) : null}

        {/* Poster Section */}
        {campaignData.poster ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>AI Generated Poster</Text>
            <Image
              source={{ uri: campaignData.poster }}
              style={[styles.posterImage, { height: isTablet ? 450 : 300 }]}
              resizeMode="contain"
            />
          </View>
        ) : null}

        {/* Caption Section */}
        {campaignData.caption ? (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Social Media Caption</Text>
              <TouchableOpacity onPress={copyCaption} style={styles.copyButton}>
                <Text style={styles.copyButtonText}>Copy</Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.bodyText, { fontSize: isTablet ? 18 : 16 }]}>{campaignData.caption}</Text>
          </View>
        ) : null}

        {/* Description Section */}
        {campaignData.description ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Campaign Description</Text>
            <Text style={[styles.bodyText, { fontSize: isTablet ? 18 : 16, color: '#94a3b8' }]}>{campaignData.description}</Text>
          </View>
        ) : null}

        {/* Marketing Strategy Section */}
        {suggestions.length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Marketing Strategy</Text>
            {suggestions.map((suggestion: string, index: number) => (
              <View key={index} style={styles.suggestionRow}>
                <Text style={styles.bullet}>{index + 1}.</Text>
                <Text style={[styles.bodyText, { flex: 1, fontSize: isTablet ? 18 : 16 }]}>{suggestion}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>

      {/* Fixed Footer */}
      <View style={[styles.footer, { paddingHorizontal: horizontalPad, paddingBottom: isSmallScreen ? 16 : 24 }]}>
        <TouchableOpacity
          style={styles.shareButton}
          onPress={() => setShareModalVisible(true)}
        >
          <LinearGradient colors={['#0ea5e9', '#6366f1']} style={[styles.shareGradient, { paddingVertical: isSmallScreen ? 14 : 16 }]}>
            <Text style={styles.shareButtonText}>Share Campaign</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Share Modal */}
      <Modal
        visible={shareModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setShareModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShareModalVisible(false)}
        >
          <View style={[styles.modalContent, { paddingBottom: isSmallScreen ? 20 : 30 }]}>
            <Text style={styles.modalTitle}>Share Campaign</Text>
            <Text style={styles.modalSubtitle}>Choose how you want to share</Text>

            {/* Quick share options */}
            <View style={styles.shareGrid}>
              <TouchableOpacity style={styles.shareOption} onPress={() => handleSystemShare('all')}>
                <View style={[styles.shareIcon, { backgroundColor: '#0ea5e9' }]}>
                  <Text style={styles.shareIconText}>All</Text>
                </View>
                <Text style={styles.shareOptionText}>Everything</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.shareOption} onPress={() => handleSystemShare('poster')}>
                <View style={[styles.shareIcon, { backgroundColor: '#8b5cf6' }]}>
                  <Text style={styles.shareIconText}>IMG</Text>
                </View>
                <Text style={styles.shareOptionText}>Poster Only</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.shareOption} onPress={() => handleSystemShare('video')}>
                <View style={[styles.shareIcon, { backgroundColor: '#ef4444' }]}>
                  <Text style={styles.shareIconText}>VID</Text>
                </View>
                <Text style={styles.shareOptionText}>Video Only</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.shareOption} onPress={() => handleSystemShare('caption')}>
                <View style={[styles.shareIcon, { backgroundColor: '#10b981' }]}>
                  <Text style={styles.shareIconText}>TXT</Text>
                </View>
                <Text style={styles.shareOptionText}>Caption</Text>
              </TouchableOpacity>
            </View>

            {/* Social media apps */}
            <Text style={styles.modalSectionTitle}>Share to App</Text>
            <View style={styles.socialGrid}>
              {[
                { name: 'WhatsApp', color: '#25D366', icon: 'WA' },
                { name: 'Instagram', color: '#E4405F', icon: 'IG' },
                { name: 'Facebook', color: '#1877F2', icon: 'FB' },
                { name: 'X / Twitter', color: '#000000', icon: 'X' },
                { name: 'Telegram', color: '#0088cc', icon: 'TG' },
                { name: 'TikTok', color: '#010101', icon: 'TT' },
              ].map((app) => (
                <TouchableOpacity
                  key={app.name}
                  style={styles.socialOption}
                  onPress={() => shareToSocial(app.name.toLowerCase().replace(/ \/ .*/, ''))}
                >
                  <View style={[styles.socialIcon, { backgroundColor: app.color }]}>
                    <Text style={styles.socialIconText}>{app.icon}</Text>
                  </View>
                  <Text style={styles.socialOptionText}>{app.name}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={styles.modalCancelButton}
              onPress={() => setShareModalVisible(false)}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {sharingInProgress && (
        <View style={styles.sharingOverlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.sharingText}>Preparing to share...</Text>
        </View>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#94a3b8', marginTop: 16, fontSize: 16 },
  header: {
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    padding: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
  },
  backButtonText: { color: '#94a3b8', fontSize: 14, fontWeight: '600' },
  title: { fontWeight: 'bold', color: '#ffffff', flex: 1, textAlign: 'center' },
  scrollContent: {},
  card: {
    backgroundColor: 'rgba(30, 41, 59, 0.6)',
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#334155',
    elevation: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardTitle: { fontSize: 17, fontWeight: '700', color: '#38bdf8', marginBottom: 16 },
  copyButton: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 16,
  },
  copyButtonText: { color: '#38bdf8', fontSize: 13, fontWeight: '600' },
  posterImage: { width: '100%', borderRadius: 12 },
  videoContainer: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  video: { width: '100%', height: '100%' },
  bodyText: { color: '#e2e8f0', lineHeight: 26 },
  suggestionRow: { flexDirection: 'row', marginBottom: 12 },
  bullet: { color: '#38bdf8', fontSize: 18, marginRight: 10, fontWeight: '700' },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  shareButton: { borderRadius: 16, overflow: 'hidden' },
  shareGradient: { alignItems: 'center', justifyContent: 'center' },
  shareButtonText: { color: '#ffffff', fontSize: 17, fontWeight: '800' },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1e293b',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 24,
    paddingHorizontal: 24,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#ffffff',
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 20,
  },
  modalSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748b',
    marginTop: 20,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  shareGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  shareOption: { alignItems: 'center', width: 72 },
  shareIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  shareIconText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  shareOptionText: { color: '#cbd5e1', fontSize: 11, fontWeight: '600', textAlign: 'center' },
  socialGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  socialOption: {
    alignItems: 'center',
    width: '30%',
    marginBottom: 16,
  },
  socialIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  socialIconText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  socialOptionText: { color: '#cbd5e1', fontSize: 11, fontWeight: '600', textAlign: 'center' },
  modalCancelButton: {
    marginTop: 16,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  modalCancelText: { color: '#94a3b8', fontSize: 16, fontWeight: '600' },
  sharingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sharingText: { color: '#fff', marginTop: 12, fontSize: 16, fontWeight: '600' },
});
