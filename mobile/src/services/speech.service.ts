import { Platform } from 'react-native';
import { uploadAudioForTranscription } from './api.service';
import { Audio } from 'expo-av';

let recording: any = undefined;

// Web: Use Web Speech API (built into browsers)
let webRecognition: any = null;
let webResolve: ((value: string) => void) | null = null;

const startWebRecording = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      reject(new Error('Speech recognition not supported in this browser. Use Chrome or Edge.'));
      return;
    }

    webRecognition = new SpeechRecognition();
    webRecognition.continuous = false;
    webRecognition.interimResults = false;
    webRecognition.lang = navigator.language || 'en-US';

    webRecognition.onresult = (event: any) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      if (webResolve) {
        webResolve(transcript);
        webResolve = null;
      }
    };

    webRecognition.onerror = (event: any) => {
      console.error('[Speech] Web recognition error:', event.error);
      if (webResolve) {
        if (event.error === 'no-speech') {
          webResolve('No speech detected. Please try again.');
        } else {
          webResolve(`Speech error: ${event.error}. Please type instead.`);
        }
        webResolve = null;
      }
    };

    webRecognition.onend = () => {
      if (webResolve) {
        webResolve('');
        webResolve = null;
      }
    };

    try {
      webRecognition.start();
      resolve();
    } catch (e) {
      reject(e);
    }
  });
};

const stopWebRecording = (): Promise<string> => {
  return new Promise((resolve) => {
    webResolve = resolve;
    if (webRecognition) {
      webRecognition.stop();
      setTimeout(() => {
        if (webResolve) {
          webResolve('');
          webResolve = null;
        }
      }, 2000);
    } else {
      resolve('');
    }
  });
};

export const startRecording = async (): Promise<void> => {
  try {
    if (Platform.OS === 'web') {
      await startWebRecording();
    } else {
      console.log('[Speech] Requesting permissions...');
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        throw new Error('Microphone permission denied. Please enable it in Settings.');
      }
      console.log('[Speech] Setting audio mode...');
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      console.log('[Speech] Starting recording...');
      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recording = newRecording;
      console.log('[Speech] Recording started, URI:', recording.getURI());
    }
  } catch (err) {
    recording = undefined;
    console.error('[Speech] Failed to start recording', err);
    throw err;
  }
};

export const stopRecording = async (): Promise<string> => {
  try {
    if (Platform.OS === 'web') {
      return await stopWebRecording();
    }

    if (!recording) return 'No recording active. Tap the mic to start.';
    
    console.log('[Speech] Stopping recording...');
    await recording.stopAndUnloadAsync();
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
    });
    const uri = recording.getURI();
    console.log('[Speech] Recording stopped, URI:', uri);
    recording = undefined;
    
    if (uri) {
      try {
        console.log('[Speech] Uploading audio for transcription...');
        const transcribedText = await uploadAudioForTranscription(uri);
        console.log('[Speech] Transcription result:', transcribedText?.substring(0, 100));
        return transcribedText || 'Could not transcribe the audio.';
      } catch (error) {
        console.error('[Speech] Transcription error:', error);
        return 'Error transcribing audio. Please try typing instead.';
      }
    }
    return '';
  } catch (err) {
    recording = undefined;
    console.error('[Speech] Failed to stop recording', err);
    return 'Error with recording. Please try typing instead.';
  }
};
