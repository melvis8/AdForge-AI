// Minimal mock for Expo Speech implementation since native voice transcription needs a plugin like @react-native-voice/voice or expo-speech for dictation
// We'll use a mocked promise to simulate getting text from speech for this hackathon MVP

export const startRecording = async (): Promise<void> => {
  console.log('Started listening...');
  // In a real app, initialize native speech recognition here
};

export const stopRecording = async (): Promise<string> => {
  console.log('Stopped listening...');
  // Return mocked transcribed text
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve("I sell homemade cakes in Yaoundé. I want a Valentine's Day promotion.");
    }, 1500);
  });
};
