import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'Generation'>;

const STEPS = [
  'Understanding your product...',
  'Creating marketing strategy...',
  'Writing captions...',
  'Designing advertisement...',
  'Creating voice-over...',
  'Preparing campaign...'
];

export default function GenerationScreen({ navigation, route }: Props) {
  const { campaignId } = route.params;
  const [currentStep, setCurrentStep] = useState(0);
  const fadeAnim = useState(new Animated.Value(0))[0];

  useEffect(() => {
    // Simulate AI generation process with intervals
    const interval = setInterval(() => {
      setCurrentStep((prev) => {
        if (prev < STEPS.length - 1) return prev + 1;
        clearInterval(interval);
        // Navigate to result after last step
        setTimeout(() => {
          navigation.replace('Result', { campaignId });
        }, 1000);
        return prev;
      });
    }, 1200);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    Animated.sequence([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 0.5,
        duration: 400,
        useNativeDriver: true,
      })
    ]).start();
  }, [currentStep]);

  return (
    <View style={styles.container}>
      <View style={styles.loaderContainer}>
        <View style={styles.spinner} />
        <Animated.Text style={[styles.stepText, { opacity: fadeAnim }]}>
          {STEPS[currentStep]}
        </Animated.Text>
        
        <View style={styles.progressContainer}>
          <View 
            style={[
              styles.progressBar, 
              { width: `${((currentStep + 1) / STEPS.length) * 100}%` }
            ]} 
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loaderContainer: {
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 40,
  },
  spinner: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: '#38bdf8',
    borderTopColor: 'transparent',
    marginBottom: 40,
    // Note: React Native needs Reanimated or Animated.loop for proper rotation
    // using basic styling for hackathon MVP representation
  },
  stepText: {
    fontSize: 20,
    color: '#ffffff',
    fontWeight: '600',
    marginBottom: 40,
    textAlign: 'center',
  },
  progressContainer: {
    width: '100%',
    height: 6,
    backgroundColor: '#1e293b',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#38bdf8',
  },
});
