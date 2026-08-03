import React, { useState, useEffect } from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { getAuth, onAuthStateChanged, FirebaseAuthTypes } from '@react-native-firebase/auth';
import { getFirestore, doc, onSnapshot } from '@react-native-firebase/firestore';
import { ActivityIndicator, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

// Screens
import LoginScreen from '../screens/LoginScreen';
import ProfileSetupScreen from '../screens/ProfileSetupScreen';
import MainTabs from './MainTabs';
import ClubDetailsScreen from '../screens/ClubDetailsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import SettingsScreen from '../screens/SettingsScreen';
import QRScannerScreen from '../screens/QRScannerScreen';

const Stack = createNativeStackNavigator();

// We will dynamically create the theme inside the component

export default function AppNavigator() {
  const { colors, theme } = useTheme();
  const [initializing, setInitializing] = useState(true);
  const [user, setUser] = useState<FirebaseAuthTypes.User | null>(null);
  const [userData, setUserData] = useState<any>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);

  const CustomTheme = React.useMemo(() => {
    const baseTheme = theme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...baseTheme,
      colors: {
        ...baseTheme.colors,
        background: colors.background,
        card: colors.surface,
        text: colors.text,
        border: colors.border,
      },
    };
  }, [colors, theme]);

  // Handle user state changes
  useEffect(() => {
    const subscriber = onAuthStateChanged(getAuth(), (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        setUserData(null);
        setLoadingProfile(false);
      }
      if (initializing) setInitializing(false);
    });
    return subscriber; // unsubscribe on unmount
  }, [initializing]);

  // Handle firestore user profile fetch
  useEffect(() => {
    if (!user) return;
    
    setLoadingProfile(true);
    const subscriber = onSnapshot(
      doc(getFirestore(), 'users', user.uid),
      (documentSnapshot) => {
        if (documentSnapshot.exists) {
          setUserData(documentSnapshot.data());
        } else {
          setUserData(null);
        }
        setLoadingProfile(false);
      },
      (error) => {
        console.error("Error fetching user data:", error);
        setLoadingProfile(false);
      }
    );

    return () => subscriber();
  }, [user]);

  if (initializing || (user && loadingProfile)) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // Check if profile is complete (e.g. has firstName)
  const isProfileComplete = userData && userData.firstName;

  return (
    <NavigationContainer theme={CustomTheme}>
      <Stack.Navigator 
        screenOptions={{ 
          headerShown: false, 
          contentStyle: { backgroundColor: colors.background },
          animation: 'fade',
        }}
      >
        {!user ? (
          // Unauthenticated
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : !isProfileComplete ? (
          // Authenticated but no profile
          <Stack.Screen name="ProfileSetup" component={ProfileSetupScreen} />
        ) : (
          // Authenticated and profile complete
          <>
            <Stack.Screen 
              name="Main" 
              component={MainTabs} 
              initialParams={{ userData }} 
            />
            <Stack.Screen
              name="ClubDetails"
              component={ClubDetailsScreen}
            />
            <Stack.Screen
              name="UserProfile"
              component={ProfileScreen}
              options={{ presentation: 'modal' }}
            />
            <Stack.Screen
              name="Settings"
              component={SettingsScreen}
              options={{ presentation: 'modal' }}
            />
            <Stack.Screen
              name="QRScanner"
              component={QRScannerScreen}
              options={{ presentation: 'fullScreenModal' }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
