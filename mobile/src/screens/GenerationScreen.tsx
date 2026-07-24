import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { LinearGradient } from 'expo-linear-gradient';

type Props = NativeStackScreenProps<RootStackParamList, 'Generation'>;

const STEPS = [
  { text: 'Understanding your product...', icon: '🔍' },
  { text: 'Creating marketing strategy...', icon: '📊' },
  { text: 'Writing captions & hashtags...', icon: '✍️' },
  { text: 'Designing advertisement...', icon: '🎨' },
  { text: 'Rendering promotional video...', icon: '🎬' },
  { text: 'Finalizing your campaign...', icon: '✅' },
];

export default function GenerationScreen({ navigation, route }: Props) {
  const { campaignId } = route.params;
  const [currentStep, setCurrentStep] = useState(0);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const spinAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;

  // Continuous spinner rotation
  useEffect(() => {
    Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 1200,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  }, []);

  // Step progression
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentStep((prev) => {
        if (prev < STEPS.length - 1) return prev + 1;
        clearInterval(interval);
        setTimeout(() => {
          navigation.replace('Result', { campaignId });
        }, 1200);
        return prev;
      });
    }, 1500);

    return () => clearInterval(interval);
  }, []);

  // Fade + scale animation on step change
  useEffect(() => {
    fadeAnim.setValue(0);
    scaleAnim.setValue(0.8);
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 6,
        useNativeDriver: true,
      }),
    ]).start();
  }, [currentStep]);

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const progress = ((currentStep + 1) / STEPS.length) * 100;

  return (
    <LinearGradient colors={['#0f172a', '#1e1b4b']} style={styles.container}>
      <View style={styles.loaderContainer}>
        {/* Spinning ring */}
        <Animated.View style={[styles.spinner, { transform: [{ rotate: spin }] }]} />

        {/* Step icon */}
        <Animated.Text style={[styles.stepIcon, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
          {STEPS[currentStep].icon}
        </Animated.Text>

        {/* Step text */}
        <Animated.Text style={[styles.stepText, { opacity: fadeAnim }]}>
          {STEPS[currentStep].text}
        </Animated.Text>
        
        {/* Progress bar */}
        <View style={styles.progressContainer}>
          <LinearGradient
            colors={['#0ea5e9', '#6366f1']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.progressBar, { width: `${progress}%` }]}
          />
        </View>
        <Text style={styles.progressText}>{Math.round(progress)}%</Text>

        {/* Step indicators */}
        <View style={styles.stepDots}>
          {STEPS.map((_, index) => (
            <View
              key={index}
              style={[
                styles.dot,
                index <= currentStep && styles.dotActive,
                index === currentStep && styles.dotCurrent,
              ]}
            />
          ))}
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loaderContainer: {
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 40,
  },
  spinner: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 4,
    borderColor: '#38bdf8',
    borderTopColor: 'transparent',
    borderRightColor: '#6366f1',
    marginBottom: 40,
  },
  stepIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  stepText: {
    fontSize: 20,
    color: '#ffffff',
    fontWeight: '600',
    marginBottom: 40,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  progressContainer: {
    width: '100%',
    height: 8,
    backgroundColor: 'rgba(30, 41, 59, 0.8)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 4,
  },
  progressText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 12,
  },
  stepDots: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 40,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#334155',
  },
  dotActive: {
    backgroundColor: '#38bdf8',
  },
  dotCurrent: {
    backgroundColor: '#6366f1',
    width: 24,
    borderRadius: 5,
  },
});
