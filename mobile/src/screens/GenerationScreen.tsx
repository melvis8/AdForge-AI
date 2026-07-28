import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Alert, useWindowDimensions } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { LinearGradient } from 'expo-linear-gradient';
import { getCampaign } from '../services/api.service';

type Props = NativeStackScreenProps<RootStackParamList, 'Generation'>;

const STEPS = [
  'Analyzing your prompt...',
  'Generating your campaign image...',
  'Writing your marketing caption...',
  'Creating your strategy...',
  'Finalizing your campaign...',
];

export default function GenerationScreen({ navigation, route }: Props) {
  const { campaignId } = route.params;
  const { width, height } = useWindowDimensions();
  const [currentStep, setCurrentStep] = useState(0);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const spinAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const isSmallScreen = height < 700;
  const isTablet = width >= 768;

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

  useEffect(() => {
    let isMounted = true;
    let pollInterval: NodeJS.Timeout;

    const stepInterval = setInterval(() => {
      setCurrentStep((prev) => (prev < STEPS.length - 2 ? prev + 1 : prev));
    }, 3000);

    const checkStatus = async () => {
      try {
        const campaign = await getCampaign(campaignId);
        if (!isMounted) return;

        if (campaign.status === 'completed') {
          setCurrentStep(STEPS.length - 1);
          clearInterval(pollInterval);
          clearInterval(stepInterval);
          setTimeout(() => {
            if (isMounted) {
              navigation.replace('Result', { campaignId });
            }
          }, 1000);
        } else if (campaign.status === 'failed') {
          clearInterval(pollInterval);
          clearInterval(stepInterval);
          Alert.alert(
            'Oops',
            'Something went wrong while preparing your campaign. Please try again.',
            [{ text: 'OK', onPress: () => navigation.replace('CampaignCreation') }]
          );
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    };

    pollInterval = setInterval(checkStatus, 3000);
    checkStatus();

    return () => {
      isMounted = false;
      clearInterval(pollInterval);
      clearInterval(stepInterval);
    };
  }, [campaignId]);

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
  const spinnerSize = isTablet ? 120 : 90;

  return (
    <LinearGradient colors={['#0f172a', '#1e1b4b']} style={styles.container}>
      <View style={styles.loaderContainer}>
        <Animated.View style={[styles.spinner, {
          width: spinnerSize,
          height: spinnerSize,
          borderRadius: spinnerSize / 2,
          transform: [{ rotate: spin }]
        }]} />

        <Animated.Text style={[styles.stepText, {
          opacity: fadeAnim,
          fontSize: isTablet ? 24 : 20,
          paddingHorizontal: 20,
        }]}>
          {STEPS[currentStep]}
        </Animated.Text>
        
        <View style={styles.progressContainer}>
          <LinearGradient
            colors={['#0ea5e9', '#6366f1']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.progressBar, { width: `${progress}%` }]}
          />
        </View>
        <Text style={styles.progressText}>{Math.round(progress)}%</Text>

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
    borderWidth: 4,
    borderColor: '#38bdf8',
    borderTopColor: 'transparent',
    borderRightColor: '#6366f1',
    marginBottom: 40,
  },
  stepText: {
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
