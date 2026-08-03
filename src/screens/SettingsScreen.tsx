import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useTheme } from '../theme/ThemeContext';
import { useNavigation } from '@react-navigation/native';
import { OutrunSwitch } from '../components/OutrunSwitch';

import { getAuth } from '@react-native-firebase/auth';
import { getFirestore, doc, onSnapshot, updateDoc } from '@react-native-firebase/firestore';

export default function SettingsScreen({ route }: any) {
  const navigation = useNavigation<any>();
  const { theme, toggleTheme, colors } = useTheme();
  const user = getAuth().currentUser;
  
  // Local state for preferences
  const [locationEnabled, setLocationEnabled] = useState(true);
  const [isPrivate, setIsPrivate] = useState(false);

  React.useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(getFirestore(), 'users', user.uid), (snap) => {
      if (snap.exists) {
        setIsPrivate(!!snap.data()?.isPrivate);
      }
    });
    return unsub;
  }, [user]);

  const togglePrivate = async (val: boolean) => {
    setIsPrivate(val);
    if (user) {
      await updateDoc(doc(getFirestore(), 'users', user.uid), { isPrivate: val });
    }
  };

  // Dynamic styles
  const s = React.useMemo(() => getStyles(colors), [colors]);

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={s.title}>Settings</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Sections */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>ACCOUNT</Text>
        <TouchableOpacity style={s.row} onPress={() => {
          navigation.navigate('UserProfile', { triggerEdit: true });
        }}>
          <View style={s.rowLeft}>
            <Ionicons name="person-outline" size={20} color={colors.text} />
            <Text style={s.rowText}>Edit Profile</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <View style={s.section}>
        <Text style={s.sectionTitle}>PREFERENCES</Text>
        
        {/* App Look (Theme Toggle) */}
        <View style={s.row}>
          <View style={s.rowLeft}>
            <Ionicons name={theme === 'dark' ? "moon-outline" : "sunny-outline"} size={20} color={colors.text} />
            <Text style={s.rowText}>Dark Mode</Text>
          </View>
          <OutrunSwitch 
            value={theme === 'dark'} 
            onValueChange={toggleTheme}
          />
        </View>

        {/* Private Account Toggle */}
        <View style={s.row}>
          <View style={s.rowLeft}>
            <Ionicons name={isPrivate ? "lock-closed-outline" : "lock-open-outline"} size={20} color={colors.text} />
            <Text style={s.rowText}>Private Account</Text>
          </View>
          <OutrunSwitch 
            value={isPrivate} 
            onValueChange={togglePrivate}
          />
        </View>

        {/* Location Permissions */}
        <View style={s.row}>
          <View style={s.rowLeft}>
            <Ionicons name="location-outline" size={20} color={colors.text} />
            <Text style={s.rowText}>Share Location on Runs</Text>
          </View>
          <OutrunSwitch 
            value={locationEnabled} 
            onValueChange={setLocationEnabled}
          />
        </View>
      </View>

    </View>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    padding: 4,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  section: {
    marginTop: 24,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
});
