import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'Result'>;

export default function ResultScreen({ navigation }: Props) {
  // Using hardcoded mock data for the hackathon MVP
  const campaignData = {
    title: "Valentine's Day Cake Promo",
    poster: "https://images.unsplash.com/photo-1542442828-287217bfb87f?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    caption: "Celebrate love with our homemade cakes! 💖 Pre-order your Valentine's special today and make it a day to remember. #ValentinesDay #CakeLove #YaoundeEats",
    hashtags: "#ValentinesDay #CakeLove #YaoundeEats #HandmadeDesserts",
    marketingSuggestions: [
      "Post this on Instagram Stories around 6 PM.",
      "Offer a 10% discount for the first 20 pre-orders.",
      "Send a voice note to your loyal customers on WhatsApp."
    ]
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.navigate('Welcome')} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Home</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Your Campaign</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        {/* Poster Section */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Generated Poster</Text>
          <Image 
            source={{ uri: campaignData.poster }} 
            style={styles.posterImage}
            resizeMode="cover"
          />
        </View>

        {/* Caption Section */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Social Media Caption</Text>
          <Text style={styles.bodyText}>{campaignData.caption}</Text>
        </View>

        {/* Voice and Video Placeholders */}
        <View style={styles.mediaRow}>
          <TouchableOpacity style={styles.mediaButton}>
            <Text style={styles.mediaIcon}>▶️</Text>
            <Text style={styles.mediaText}>Play Voice Ad</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.mediaButton}>
            <Text style={styles.mediaIcon}>🎬</Text>
            <Text style={styles.mediaText}>View Video</Text>
          </TouchableOpacity>
        </View>

        {/* Suggestions Section */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Marketing Suggestions</Text>
          {campaignData.marketingSuggestions.map((suggestion, index) => (
            <View key={index} style={styles.suggestionRow}>
              <Text style={styles.bullet}>•</Text>
              <Text style={styles.bodyText}>{suggestion}</Text>
            </View>
          ))}
        </View>

      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Save Campaign</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Share</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  header: {
    marginTop: 60,
    paddingHorizontal: 24,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    color: '#94a3b8',
    fontSize: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#38bdf8',
    marginBottom: 12,
  },
  posterImage: {
    width: '100%',
    height: 300,
    borderRadius: 12,
  },
  bodyText: {
    fontSize: 16,
    color: '#e2e8f0',
    lineHeight: 24,
  },
  suggestionRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  bullet: {
    color: '#38bdf8',
    fontSize: 18,
    marginRight: 8,
  },
  mediaRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 20,
  },
  mediaButton: {
    flex: 1,
    backgroundColor: '#1e293b',
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  mediaIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  mediaText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    padding: 24,
    gap: 16,
  },
  primaryButton: {
    flex: 2,
    backgroundColor: '#38bdf8',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: 'bold',
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
