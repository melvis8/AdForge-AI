import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Image, ActivityIndicator, Alert, useWindowDimensions } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { startRecording, stopRecording } from '../services/speech.service';
import { createCampaign, startGeneration, uploadCampaignImages } from '../services/api.service';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';

type Props = NativeStackScreenProps<RootStackParamList, 'CampaignCreation'>;

export default function CampaignCreationScreen({ navigation }: Props) {
  const { width, height } = useWindowDimensions();
  const [description, setDescription] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const isSmallScreen = height < 700;
  const isTablet = width >= 768;
  const imageSize = isTablet ? 130 : 100;

  const handleVoiceInput = async () => {
    if (isRecording) {
      setIsRecording(false);
      const text = await stopRecording();
      if (text && !text.includes('Error transcribing')) {
        setDescription(prev => prev ? `${prev} ${text}` : text);
      } else if (text) {
        Alert.alert('Speech Recognition', text);
      }
    } else {
      setIsRecording(true);
      await startRecording();
    }
  };

  const pickImage = async () => {
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
    if (!description.trim()) {
      Alert.alert('Required Field', 'Please provide a campaign description or speak your prompt.');
      return;
    }

    setIsLoading(true);
    try {
      const promptTitle = description.length > 40 ? `${description.substring(0, 40)}...` : description;
      const campaign = await createCampaign(promptTitle, description);
      
      if (images.length > 0) {
        await uploadCampaignImages(campaign.id, images);
      }
      
      await startGeneration(campaign.id);
      navigation.replace('Generation', { campaignId: campaign.id });
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        'Connection Error', 
        'Could not reach the AdForge AI backend. Please check your internet connection and try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const horizontalPad = isTablet ? 48 : 24;

  return (
    <LinearGradient colors={['#0f172a', '#1e1b4b']} style={styles.container}>
      <View style={[styles.header, { marginTop: isSmallScreen ? 30 : 50, paddingHorizontal: horizontalPad }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { fontSize: isTablet ? 40 : 34 }]}>Create Campaign</Text>
        <Text style={styles.subtitle}>Describe your product & let AI do the rest.</Text>
      </View>
      
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingHorizontal: horizontalPad, paddingBottom: isSmallScreen ? 20 : 40 }]} showsVerticalScrollIndicator={false}>
        <Text style={styles.label}>Campaign Prompt / Description</Text>
        
        <LinearGradient colors={['#1e293b', '#334155']} style={[styles.inputContainer, { minHeight: isSmallScreen ? 100 : 140 }]}>
          <TextInput
            style={[styles.textInput, { fontSize: isTablet ? 18 : 16 }]}
            multiline
            placeholder="Describe your product or service. The more details you give, the better your campaign will be. Example: Organic skincare brand launching a new Vitamin C serum with 30% off for the first 100 customers"
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
            <Text style={styles.micIcon}>MIC</Text>
          )}
          <Text style={styles.micText}>
            {isRecording ? 'Listening... Tap to stop & transcribe' : 'Tap to speak your campaign prompt'}
          </Text>
        </TouchableOpacity>

        <Text style={styles.label}>Upload Product Photos (Optional)</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imagePreviewContainer}>
          {images.map((uri, index) => (
            <View key={index} style={styles.imagePreviewWrapper}>
              <Image source={{ uri }} style={[styles.imagePreview, { width: imageSize, height: imageSize }]} />
              <TouchableOpacity style={styles.removeImageBtn} onPress={() => removeImage(index)}>
                <Text style={styles.removeImageText}>X</Text>
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity style={[styles.uploadBox, { width: imageSize, height: imageSize }]} onPress={pickImage}>
            <Text style={styles.uploadIcon}>+</Text>
            <Text style={styles.uploadText}>Add Photo</Text>
          </TouchableOpacity>
        </ScrollView>
      </ScrollView>

      <View style={[styles.footer, { padding: horizontalPad, paddingBottom: isSmallScreen ? 16 : 40 }]}>
        <TouchableOpacity 
          style={[styles.generateButton, (isLoading || !description.trim()) && styles.disabledButton]}
          onPress={handleGenerate}
          disabled={isLoading || !description.trim()}
        >
          <LinearGradient 
            colors={isLoading ? ['#3b82f6', '#3b82f6'] : ['#0ea5e9', '#3b82f6']} 
            style={[styles.generateGradient, { paddingVertical: isSmallScreen ? 16 : 20 }]}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={[styles.generateButtonText, { fontSize: isTablet ? 20 : 18 }]}>Generate Campaign</Text>
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
    marginBottom: 20,
  },
  backButton: {
    marginBottom: 10,
  },
  backButtonText: {
    color: '#38bdf8',
    fontSize: 16,
    fontWeight: '600',
  },
  title: {
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
    fontSize: 14,
    fontWeight: '800',
    color: '#38bdf8',
    marginRight: 10,
  },
  micText: {
    color: '#ffffff',
    fontSize: 15,
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
    color: '#94a3b8',
    marginBottom: 4,
  },
  uploadText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  footer: {
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledButton: {
    opacity: 0.5,
  },
  generateButtonText: {
    color: '#ffffff',
    fontWeight: '800',
  },
});
