import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, Animated } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { LinearGradient } from 'expo-linear-gradient';
import { getOfflineCampaigns, OfflineCampaign } from '../services/offline.service';

type Props = NativeStackScreenProps<RootStackParamList, 'Welcome'>;

export default function WelcomeScreen({ navigation }: Props) {
  const [offlineCampaigns, setOfflineCampaigns] = useState<OfflineCampaign[]>([]);
  const [showOffline, setShowOffline] = useState(false);
  const fadeAnim = useState(new Animated.Value(0))[0];

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();
  }, []);

  const loadOfflineCampaigns = async () => {
    const campaigns = await getOfflineCampaigns();
    setOfflineCampaigns(campaigns);
    setShowOffline(!showOffline);
  };

  const renderOfflineCampaign = ({ item }: { item: OfflineCampaign }) => (
    <TouchableOpacity 
      style={styles.offlineCard}
      onPress={() => navigation.navigate('Result', { campaignId: item.id })}
    >
      <Text style={styles.offlineCardTitle}>{item.title}</Text>
      <Text style={styles.offlineCardCaption} numberOfLines={2}>{item.caption || item.description}</Text>
      <Text style={styles.offlineCardDate}>{new Date(item.createdAt).toLocaleDateString()}</Text>
    </TouchableOpacity>
  );

  return (
    <LinearGradient colors={['#0f172a', '#1e1b4b', '#0f172a']} style={styles.container}>
      <Animated.View style={[styles.header, { opacity: fadeAnim }]}>
        <Text style={styles.logoText}>AdForge AI</Text>
        <Text style={styles.tagline}>🚀</Text>
      </Animated.View>
      
      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        <Text style={styles.title}>Turn your product{'\n'}photos into{'\n'}
          <Text style={styles.titleAccent}>professional ads</Text>
          {'\n'}using AI.
        </Text>
        <Text style={styles.subtitle}>Create campaigns in seconds with just your voice and a picture. Works on Android & iPhone.</Text>
      </Animated.View>

      {showOffline && offlineCampaigns.length > 0 && (
        <View style={styles.offlineSection}>
          <Text style={styles.offlineSectionTitle}>📂 Saved Campaigns ({offlineCampaigns.length})</Text>
          <FlatList
            data={offlineCampaigns}
            renderItem={renderOfflineCampaign}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 4 }}
          />
        </View>
      )}

      {showOffline && offlineCampaigns.length === 0 && (
        <View style={styles.offlineEmpty}>
          <Text style={styles.offlineEmptyText}>No saved campaigns yet. Create one first!</Text>
        </View>
      )}
      
      <View style={styles.footer}>
        <TouchableOpacity 
          style={styles.primaryButton}
          onPress={() => navigation.navigate('CampaignCreation')}
          activeOpacity={0.8}
        >
          <LinearGradient colors={['#0ea5e9', '#6366f1']} style={styles.primaryGradient}>
            <Text style={styles.primaryButtonText}>✨ Create Campaign</Text>
          </LinearGradient>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.secondaryButton}
          onPress={loadOfflineCampaigns}
          activeOpacity={0.7}
        >
          <Text style={styles.secondaryButtonText}>
            {showOffline ? '✕ Close' : '📱 View Offline Campaigns'}
          </Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'space-between',
  },
  header: {
    marginTop: 60,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  logoText: {
    fontSize: 34,
    fontWeight: '900',
    color: '#38bdf8',
    letterSpacing: 1.5,
  },
  tagline: {
    fontSize: 28,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: 36,
    fontWeight: '800',
    color: '#ffffff',
    lineHeight: 46,
    marginBottom: 16,
    letterSpacing: -0.5,
  },
  titleAccent: {
    color: '#38bdf8',
  },
  subtitle: {
    fontSize: 17,
    color: '#94a3b8',
    lineHeight: 28,
  },
  offlineSection: {
    marginBottom: 16,
  },
  offlineSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#e2e8f0',
    marginBottom: 12,
  },
  offlineCard: {
    backgroundColor: 'rgba(30, 41, 59, 0.8)',
    borderRadius: 16,
    padding: 16,
    marginRight: 12,
    width: 220,
    borderWidth: 1,
    borderColor: '#334155',
  },
  offlineCardTitle: {
    color: '#38bdf8',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6,
  },
  offlineCardCaption: {
    color: '#cbd5e1',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 8,
  },
  offlineCardDate: {
    color: '#64748b',
    fontSize: 11,
  },
  offlineEmpty: {
    backgroundColor: 'rgba(30, 41, 59, 0.5)',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
  },
  offlineEmptyText: {
    color: '#94a3b8',
    fontSize: 14,
  },
  footer: {
    marginBottom: 40,
    gap: 14,
  },
  primaryButton: {
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  primaryGradient: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 19,
    fontWeight: '800',
  },
  secondaryButton: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingVertical: 18,
    borderRadius: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  secondaryButtonText: {
    color: '#e2e8f0',
    fontSize: 17,
    fontWeight: '600',
  },
});
