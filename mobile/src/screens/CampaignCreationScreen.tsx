import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Image, ActivityIndicator } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { startRecording, stopRecording } from '../services/speech.service';
import { createCampaign, startGeneration, uploadCampaignImages } from '../services/api.service';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';

type Props = NativeStackScreenProps<RootStackParamList, 'CampaignCreation'>;

export default function CampaignCreationScreen({ navigation }: Props) {
  const [description, setDescription] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [images, setImages] = useState<string[]>([]);

  const handleVoiceInput = async () => {
    if (isRecording) {
      setIsRecording(false);
      const text = await stopRecording();
      setDescription(prev => prev ? `${prev} ${text}` : text);
    } else {
      setIsRecording(true);
      await startRecording();
    }
  };

  const pickImage = async (isLogo: boolean = false) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0].uri) {
      setImages([...images, result.assets[0].uri]);
    }
  };

  const removeImage = (index: number) => {
    setImages(images.filter((_, i) => i !== index));
  };

  const handleGenerate = async () => {
    setIsLoading(true);
    try {
      // 1. Create campaign first
      const campaign = await createCampaign('New Campaign', description);
      
      // 2. Upload images if we have any
      if (images.length > 0) {
        await uploadCampaignImages(campaign.id, images);
      }
      
      // 3. Start generation process
      await startGeneration(campaign.id);
      
      navigation.replace('Generation', { campaignId: campaign.id });
    } catch (e) {
      console.error(e);
      alert('Failed to start generation. Make sure backend is running.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <LinearGradient colors={['#0f172a', '#1e1b4b']} style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Create Campaign</Text>
        <Text style={styles.subtitle}>Let AI craft the perfect promotional content.</Text>
      </View>
      
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.label}>Describe your product or business</Text>
        
        <LinearGradient colors={['#1e293b', '#334155']} style={styles.inputContainer}>
          <TextInput
            style={styles.textInput}
            multiline
            placeholder="E.g. I sell homemade cakes in Yaoundé. I want a Valentine's Day promotion."
            placeholderTextColor="#94a3b8"
            value={description}
            onChangeText={setDescription}
          />
        </LinearGradient>
        
        <TouchableOpacity 
          style={[styles.micButton, isRecording && styles.micButtonActive]}
          onPress={handleVoiceInput}
          activeOpacity={0.7}
        >
          {isRecording ? (
            <ActivityIndicator color="#fff" style={{ marginRight: 8 }} />
          ) : (
            <Text style={styles.micIcon}>🎤</Text>
          )}
          <Text style={styles.micText}>
            {isRecording ? 'Listening... Tap to stop' : 'Tap to speak your prompt'}
          </Text>
        </TouchableOpacity>

        <Text style={styles.label}>Upload Assets (Images & Logos)</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imagePreviewContainer}>
          {images.map((uri, index) => (
            <View key={index} style={styles.imagePreviewWrapper}>
              <Image source={{ uri }} style={styles.imagePreview} />
              <TouchableOpacity style={styles.removeImageBtn} onPress={() => removeImage(index)}>
                <Text style={styles.removeImageText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity style={styles.uploadBox} onPress={() => pickImage()}>
            <Text style={styles.uploadIcon}>📸</Text>
            <Text style={styles.uploadText}>Add Photo</Text>
          </TouchableOpacity>
        </ScrollView>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity 
          style={[styles.generateButton, isLoading && styles.disabledButton]}
          onPress={handleGenerate}
          disabled={isLoading || !description.trim()}
        >
          <LinearGradient 
            colors={isLoading ? ['#3b82f6', '#3b82f6'] : ['#0ea5e9', '#3b82f6']} 
            style={styles.generateGradient}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.generateButtonText}>✨ Generate Campaign</Text>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    marginTop: 60,
    paddingHorizontal: 24,
    marginBottom: 20,
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    color: '#94a3b8',
    marginTop: 8,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#e2e8f0',
    marginBottom: 12,
    marginTop: 10,
  },
  inputContainer: {
    borderRadius: 20,
    minHeight: 140,
    padding: 16,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
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
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    paddingVertical: 18,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: '#38bdf8',
    marginBottom: 24,
  },
  micButtonActive: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderColor: '#ef4444',
  },
  micIcon: {
    fontSize: 22,
    marginRight: 10,
  },
  micText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  imagePreviewContainer: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  imagePreviewWrapper: {
    position: 'relative',
    marginRight: 12,
  },
  imagePreview: {
    width: 100,
    height: 100,
    borderRadius: 16,
  },
  removeImageBtn: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#ef4444',
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#0f172a',
  },
  removeImageText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  uploadBox: {
    width: 100,
    height: 100,
    backgroundColor: 'rgba(30, 41, 59, 0.5)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#475569',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadIcon: {
    fontSize: 28,
    marginBottom: 8,
  },
  uploadText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  footer: {
    padding: 24,
    paddingBottom: 40,
  },
  generateButton: {
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  generateGradient: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledButton: {
    opacity: 0.7,
  },
  generateButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
  },
});
