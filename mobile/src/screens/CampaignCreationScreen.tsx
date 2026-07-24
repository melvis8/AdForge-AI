import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { startRecording, stopRecording } from '../services/speech.service';
import { createCampaign, startGeneration } from '../services/api.service';

type Props = NativeStackScreenProps<RootStackParamList, 'CampaignCreation'>;

export default function CampaignCreationScreen({ navigation }: Props) {
  const [description, setDescription] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleVoiceInput = async () => {
    if (isRecording) {
      setIsRecording(false);
      const text = await stopRecording();
      setDescription(text);
    } else {
      setIsRecording(true);
      await startRecording();
    }
  };

  const handleGenerate = async () => {
    setIsLoading(true);
    try {
      // Mock generation for hackathon if backend is offline
      // const campaign = await createCampaign('New Campaign', description);
      // await startGeneration(campaign.id);
      
      // Simulate network request
      await new Promise(resolve => setTimeout(resolve, 1000));
      const mockCampaignId = 'cam-123';
      
      navigation.replace('Generation', { campaignId: mockCampaignId });
    } catch (e) {
      console.error(e);
      alert('Failed to start generation. Make sure backend is running.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Create Campaign</Text>
      </View>
      
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.label}>Describe your product or business</Text>
        
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.textInput}
            multiline
            placeholder="E.g. I sell homemade cakes in Yaoundé. I want a Valentine's Day promotion."
            placeholderTextColor="#64748b"
            value={description}
            onChangeText={setDescription}
          />
        </View>
        
        <TouchableOpacity 
          style={[styles.micButton, isRecording && styles.micButtonActive]}
          onPress={handleVoiceInput}
        >
          <Text style={styles.micIcon}>{isRecording ? '🛑' : '🎤'}</Text>
          <Text style={styles.micText}>
            {isRecording ? 'Listening... Tap to stop' : 'Tap to speak'}
          </Text>
        </TouchableOpacity>

        <View style={styles.uploadSection}>
          <TouchableOpacity style={styles.uploadBox}>
            <Text style={styles.uploadIcon}>📸</Text>
            <Text style={styles.uploadText}>Upload Product Image</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.uploadBox}>
            <Text style={styles.uploadIcon}>✨</Text>
            <Text style={styles.uploadText}>Upload Logo</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity 
          style={[styles.generateButton, isLoading && styles.disabledButton]}
          onPress={handleGenerate}
          disabled={isLoading || !description.trim()}
        >
          <Text style={styles.generateButtonText}>
            {isLoading ? 'Preparing...' : 'Generate Campaign'}
          </Text>
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
    marginBottom: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  label: {
    fontSize: 16,
    color: '#cbd5e1',
    marginBottom: 12,
  },
  inputContainer: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#334155',
    minHeight: 120,
    padding: 16,
    marginBottom: 24,
  },
  textInput: {
    color: '#ffffff',
    fontSize: 16,
    lineHeight: 24,
  },
  micButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1e293b',
    paddingVertical: 16,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: '#38bdf8',
    marginBottom: 32,
  },
  micButtonActive: {
    backgroundColor: '#ef4444',
    borderColor: '#ef4444',
  },
  micIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  micText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  uploadSection: {
    flexDirection: 'row',
    gap: 16,
  },
  uploadBox: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#334155',
    borderStyle: 'dashed',
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadIcon: {
    fontSize: 32,
    marginBottom: 12,
  },
  uploadText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  footer: {
    padding: 24,
    paddingBottom: 40,
  },
  generateButton: {
    backgroundColor: '#38bdf8',
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
  },
  disabledButton: {
    backgroundColor: '#0ea5e9',
    opacity: 0.7,
  },
  generateButtonText: {
    color: '#0f172a',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
