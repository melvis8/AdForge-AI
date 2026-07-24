import React from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { LinearGradient } from 'expo-linear-gradient';

type Props = NativeStackScreenProps<RootStackParamList, 'Welcome'>;

export default function WelcomeScreen({ navigation }: Props) {
  return (
    <View style={styles.container}>
      {/* Dynamic background effect simulation */}
      <View style={styles.header}>
        <Text style={styles.logoText}>AdForge AI</Text>
      </View>
      
      <View style={styles.content}>
        <Text style={styles.title}>Turn your product photos into professional advertisements using AI.</Text>
        <Text style={styles.subtitle}>Create campaigns in seconds with just your voice and a picture.</Text>
      </View>
      
      <View style={styles.footer}>
        <TouchableOpacity 
          style={styles.primaryButton}
          onPress={() => navigation.navigate('CampaignCreation')}
        >
          <Text style={styles.primaryButtonText}>Create Campaign</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.secondaryButton}
          onPress={() => alert('Offline mode gives you access to templates without internet!')}
        >
          <Text style={styles.secondaryButtonText}>Try Offline Mode</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    padding: 24,
    justifyContent: 'space-between',
  },
  header: {
    marginTop: 60,
    alignItems: 'center',
  },
  logoText: {
    fontSize: 32,
    fontWeight: '800',
    color: '#38bdf8',
    letterSpacing: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: 40,
    fontWeight: 'bold',
    color: '#ffffff',
    lineHeight: 48,
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 18,
    color: '#94a3b8',
    lineHeight: 28,
  },
  footer: {
    marginBottom: 40,
    gap: 16,
  },
  primaryButton: {
    backgroundColor: '#38bdf8',
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#38bdf8',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  primaryButtonText: {
    color: '#0f172a',
    fontSize: 18,
    fontWeight: 'bold',
  },
  secondaryButton: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
  },
});
