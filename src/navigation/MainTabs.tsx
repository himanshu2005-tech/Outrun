import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useTheme } from '../theme/ThemeContext';

import ClubsScreen from '../screens/ClubsScreen';
import NewOutrunScreen from '../screens/NewOutrunScreen';
import ProfileScreen from '../screens/ProfileScreen';

const Tab = createBottomTabNavigator();

export function MainTabs({ route }: any) {
  const { userData } = route.params || {};
  const { colors } = useTheme();

  return (
    <Tab.Navigator
    initialRouteName='NewOutrun'
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          borderTopWidth: 0.5,
          height: 70,
          paddingBottom: 12,
          paddingTop: 12,
          elevation: 0,
        },
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '700',
          letterSpacing: 2,
          textTransform: 'uppercase',
          marginTop: 4,
        },
        tabBarIcon: ({ focused, color, size }) => {
          let iconName = '';
          if (route.name === 'Clubs') {
            iconName = focused ? 'people' : 'people-outline';
          } else if (route.name === 'NewOutrun') {
            iconName = focused ? 'flash' : 'flash-outline';
          } else if (route.name === 'Profile') {
            iconName = focused ? 'person' : 'person-outline';
          }
          // The icons might not load immediately until android is rebuilt, so we use a fallback if needed, but Ionicons is bundled in the standard link.
          return <Ionicons name={iconName} size={24} color={color} />;
        },
      })}
    >
      <Tab.Screen 
        name="Clubs" 
        component={ClubsScreen} 
        options={{ title: 'Clubs' }}
      />
      <Tab.Screen 
        name="NewOutrun" 
        component={NewOutrunScreen} 
        options={{ title: 'New Run' }}
      />
      <Tab.Screen 
        name="Profile" 
        component={ProfileScreen}
        initialParams={{ userData }}
        options={{ title: 'Profile' }}
      />
    </Tab.Navigator>
  );
};

export default MainTabs;
