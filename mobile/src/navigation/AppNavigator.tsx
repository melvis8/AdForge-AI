import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import WelcomeScreen from '../screens/WelcomeScreen';
import CampaignCreationScreen from '../screens/CampaignCreationScreen';
import GenerationScreen from '../screens/GenerationScreen';
import ResultScreen from '../screens/ResultScreen';

export type RootStackParamList = {
  Welcome: undefined;
  CampaignCreation: undefined;
  Generation: { campaignId: string };
  Result: { campaignId: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0f172a' } }}>
        <Stack.Screen name="Welcome" component={WelcomeScreen} />
        <Stack.Screen name="CampaignCreation" component={CampaignCreationScreen} />
        <Stack.Screen name="Generation" component={GenerationScreen} />
        <Stack.Screen name="Result" component={ResultScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
