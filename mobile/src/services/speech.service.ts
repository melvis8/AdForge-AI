import { Audio } from 'expo-av';
import { uploadAudioForTranscription } from './api.service';

let recording: Audio.Recording | undefined;

export const startRecording = async (): Promise<void> => {
  try {
    console.log('Requesting permissions..');
    await Audio.requestPermissionsAsync();
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    }); 
    console.log('Starting recording..');
    const { recording: newRecording } = await Audio.Recording.createAsync(
      Audio.RecordingOptionsPresets.HIGH_QUALITY
    );
    recording = newRecording;
    console.log('Recording started');
  } catch (err) {
    console.error('Failed to start recording', err);
  }
};

export const stopRecording = async (): Promise<string> => {
  if (!recording) return '';
  
  console.log('Stopping recording..');
  await recording.stopAndUnloadAsync();
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
  });
  const uri = recording.getURI();
  console.log('Recording stopped and stored at', uri);
  recording = undefined;
  
  if (uri) {
    try {
      // We will send this to the backend API for transcription
      const transcribedText = await uploadAudioForTranscription(uri);
      return transcribedText || 'Could not transcribe the audio.';
    } catch (error) {
      console.error('Transcription error:', error);
      return 'Error transcribing audio. Please try typing instead.';
    }
  }
  return '';
};
