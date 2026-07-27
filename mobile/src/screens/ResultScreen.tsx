import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { getCampaign } from '../services/api.service';
import { saveCampaignOffline } from '../services/offline.service';
import { Video, ResizeMode } from 'expo-av';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { LinearGradient } from 'expo-linear-gradient';

type Props = NativeStackScreenProps<RootStackParamList, 'Result'>;

export default function ResultScreen({ route, navigation }: Props) {
  const { campaignId } = route.params;
  const [campaign, setCampaign] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCampaign = async () => {
      try {
        const data = await getCampaign(campaignId);
        setCampaign(data);
        
        // Extract assets
        const poster = data.generated?.find((f: any) => f.type === 'poster')?.url || "https://images.unsplash.com/photo-1542442828-287217bfb87f?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80";
        const video = data.generated?.find((f: any) => f.type === 'video')?.url || "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4";
        const captionObj = data.generated?.find((f: any) => f.type === 'caption' && !f.content?.startsWith('STRATEGY:'));
        
        // Save offline automatically
        await saveCampaignOffline({
          id: data.id,
          title: data.title,
          description: data.description,
          poster: poster,
          video: video,
          caption: captionObj?.content || "Check out our latest AI generated promotion! 🔥 #AdForge",
          createdAt: new Date().toISOString()
        });
        
      } catch (e) {
        console.error(e);
        Alert.alert('Error', 'Could not load campaign details from server.');
      } finally {
        setLoading(false);
      }
    };

    fetchCampaign();
  }, [campaignId]);

  const handleShare = async () => {
    if (!campaign) return;
    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert("Sharing Not Available", "Sharing is not supported on this device.");
        return;
      }
      
      const mediaUrl = campaign.video || campaign?.generated?.find((f: any) => f.type === 'video')?.url || campaign?.generated?.find((f: any) => f.type === 'poster')?.url;
      if (!mediaUrl) {
        Alert.alert("Error", "No media available to share.");
        return;
      }

      setLoading(true);
      const fileExt = mediaUrl.includes('.mp4') ? '.mp4' : '.jpg';
      const fileUri = FileSystem.cacheDirectory + 'adforge_share' + fileExt;
      const { uri } = await FileSystem.downloadAsync(mediaUrl, fileUri);
      setLoading(false);

      await Sharing.shareAsync(uri, {
        dialogTitle: 'Share your AdForge AI Campaign',
      });
    } catch (e) {
      setLoading(false);
      console.error(e);
      Alert.alert('Error', 'Failed to share campaign media');
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#38bdf8" />
        <Text style={styles.loadingText}>Fetching your AI generated campaign...</Text>
      </View>
    );
  }

  const videoUrl = campaign?.video || campaign?.generated?.find((f: any) => f.type === 'video')?.url || "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4";
  const posterUrl = campaign?.poster || campaign?.generated?.find((f: any) => f.type === 'poster')?.url || "https://images.unsplash.com/photo-1542442828-287217bfb87f?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80";
  const caption = campaign?.caption || campaign?.generated?.find((f: any) => f.type === 'caption' && !f.content?.startsWith('STRATEGY:'))?.content || "Discover our amazing product! 🔥 #Marketing #AI #AdForge";
  
  const rawStrategy = campaign?.generated?.find((f: any) => f.content?.startsWith('STRATEGY:'))?.content?.replace('STRATEGY:', '');
  const suggestions = rawStrategy 
    ? rawStrategy.split('\n').filter((s: string) => s.trim().length > 0)
    : ["Post this on Instagram Stories at peak hours.", "Run a short 48hr promo.", "Share on WhatsApp Status for local reach."];

  return (
    <LinearGradient colors={['#0f172a', '#1e1b4b']} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.navigate('Welcome')} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Home</Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>{campaign?.title || 'Your Campaign'}</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Video Section */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Promotional Video (JSON2Video + Cloud Storage)</Text>
          <View style={styles.videoContainer}>
             <Video
              source={{ uri: videoUrl }}
              style={styles.video}
              useNativeControls
              resizeMode={ResizeMode.COVER}
              isLooping
            />
          </View>
        </View>

        {/* Poster Section */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>AI Generated Poster (Gemini AI + Backblaze Cloud)</Text>
          <Image 
            source={{ uri: posterUrl }} 
            style={styles.posterImage}
            resizeMode="cover"
          />
        </View>

        {/* Caption Section */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Social Media Caption</Text>
          <Text style={styles.bodyText}>{caption}</Text>
        </View>

        {/* Suggestions Section */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Marketing Strategy</Text>
          {suggestions.map((suggestion: string, index: number) => (
            <View key={index} style={styles.suggestionRow}>
              <Text style={styles.bullet}>•</Text>
              <Text style={[styles.bodyText, { flex: 1 }]}>{suggestion}</Text>
            </View>
          ))}
        </View>

      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.primaryButton} onPress={() => Alert.alert('Saved', 'Campaign saved to local offline storage!')}>
          <LinearGradient colors={['#0ea5e9', '#3b82f6']} style={styles.btnGradient}>
            <Text style={styles.primaryButtonText}>Saved ✓</Text>
          </LinearGradient>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={handleShare}>
          <Text style={styles.secondaryButtonText}>Share 🚀</Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#94a3b8',
    marginTop: 16,
    fontSize: 16,
  },
  header: {
    marginTop: 50,
    paddingHorizontal: 24,
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
  backButtonText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '600',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
    flex: 1,
    textAlign: 'center',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: 'rgba(30, 41, 59, 0.6)',
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#334155',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#38bdf8',
    marginBottom: 16,
  },
  posterImage: {
    width: '100%',
    height: 300,
    borderRadius: 12,
  },
  videoContainer: {
    width: '100%',
    height: 220,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  bodyText: {
    fontSize: 16,
    color: '#e2e8f0',
    lineHeight: 26,
  },
  suggestionRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  bullet: {
    color: '#38bdf8',
    fontSize: 18,
    marginRight: 10,
  },
  footer: {
    flexDirection: 'row',
    padding: 24,
    gap: 16,
  },
  primaryButton: {
    flex: 2,
    borderRadius: 16,
    overflow: 'hidden',
  },
  btnGradient: {
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)'
  },
  secondaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
