import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, Animated, Image, useWindowDimensions } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { LinearGradient } from 'expo-linear-gradient';
import { getOfflineCampaigns, OfflineCampaign } from '../services/offline.service';

type Props = NativeStackScreenProps<RootStackParamList, 'Welcome'>;

export default function WelcomeScreen({ navigation }: Props) {
  const { width, height } = useWindowDimensions();
  const [offlineCampaigns, setOfflineCampaigns] = useState<OfflineCampaign[]>([]);
  const [showOffline, setShowOffline] = useState(false);
  const fadeAnim = useState(new Animated.Value(0))[0];
  const isSmallScreen = height < 700;
  const isTablet = width >= 768;

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
      style={[styles.offlineCard, { width: isTablet ? 280 : 220 }]}
      onPress={() => navigation.navigate('Result', { campaignId: item.id, offlineData: item })}
    >
      {item.poster ? (
        <Image source={{ uri: item.poster }} style={[styles.offlineCardImage, { height: isTablet ? 160 : 120 }]} resizeMode="cover" />
      ) : null}
      <View style={styles.offlineCardContent}>
        <Text style={styles.offlineCardTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.offlineCardCaption} numberOfLines={2}>{item.caption || item.description}</Text>
        <Text style={styles.offlineCardDate}>{new Date(item.createdAt).toLocaleDateString()}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <LinearGradient colors={['#0f172a', '#1e1b4b', '#0f172a']} style={styles.container}>
      <Animated.View style={[styles.header, { marginTop: isSmallScreen ? 30 : 50 }]}>
        <Image 
          source={require('../../assets/logo.png')} 
          style={[styles.logoImage, { width: isTablet ? 320 : 220, height: isTablet ? 160 : 110 }]}
          resizeMode="contain" 
        />
      </Animated.View>
      
      <Animated.View style={[styles.content, { opacity: fadeAnim, paddingHorizontal: isTablet ? 48 : 24 }]}>
        <Text style={[styles.title, {
          fontSize: isTablet ? 44 : isSmallScreen ? 28 : 34,
          lineHeight: isTablet ? 56 : isSmallScreen ? 36 : 44,
        }]}>Turn your product{'\n'}photos into{'\n'}
          <Text style={styles.titleAccent}>professional ads</Text>
          {'\n'}using AI.
        </Text>
        <Text style={[styles.subtitle, {
          fontSize: isTablet ? 18 : 16,
          lineHeight: isTablet ? 30 : 26,
        }]}>Create campaigns in seconds with just your voice and a picture. Works on Android & iPhone.</Text>
      </Animated.View>

      {showOffline && offlineCampaigns.length > 0 && (
        <View style={[styles.offlineSection, { paddingHorizontal: isTablet ? 48 : 24 }]}>
          <Text style={styles.offlineSectionTitle}>Saved Campaigns ({offlineCampaigns.length})</Text>
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
        <View style={[styles.offlineEmpty, { marginHorizontal: isTablet ? 48 : 24 }]}>
          <Text style={styles.offlineEmptyText}>No saved campaigns yet. Create one first!</Text>
        </View>
      )}
      
      <View style={[styles.footer, { paddingHorizontal: isTablet ? 48 : 24, marginBottom: isSmallScreen ? 16 : 30 }]}>
        <TouchableOpacity 
          style={styles.primaryButton}
          onPress={() => navigation.navigate('CampaignCreation')}
          activeOpacity={0.8}
        >
          <LinearGradient colors={['#0ea5e9', '#6366f1']} style={[styles.primaryGradient, { paddingVertical: isSmallScreen ? 16 : 20 }]}>
            <Text style={[styles.primaryButtonText, { fontSize: isTablet ? 22 : 19 }]}>Create Campaign</Text>
          </LinearGradient>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.secondaryButton}
          onPress={loadOfflineCampaigns}
          activeOpacity={0.7}
        >
          <Text style={[styles.secondaryButtonText, { paddingVertical: isSmallScreen ? 14 : 18 }]}>
            {showOffline ? 'Close' : 'View Offline Campaigns'}
          </Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
  },
  header: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImage: {
    // dimensions set dynamically
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 16,
    letterSpacing: -0.5,
  },
  titleAccent: {
    color: '#38bdf8',
  },
  subtitle: {
    color: '#94a3b8',
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
    padding: 0,
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#334155',
    overflow: 'hidden',
  },
  offlineCardImage: {
    width: '100%',
  },
  offlineCardContent: {
    padding: 16,
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '800',
  },
  secondaryButton: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  secondaryButtonText: {
    color: '#e2e8f0',
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
});
