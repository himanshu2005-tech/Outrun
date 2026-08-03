import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Animated, Easing, KeyboardAvoidingView, Platform } from 'react-native';
import { getAuth, signInWithPhoneNumber, FirebaseAuthTypes } from '@react-native-firebase/auth';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import CountryPicker, { CountryCode, Country, DARK_THEME } from 'react-native-country-picker-modal';
import { useTheme } from '../theme/ThemeContext';
import { showAlert } from '../components/CustomAlert';
import Button from '../components/Button';
import Input from '../components/Input';
import Logo from '../components/Logo';
import OtpInput from '../components/OtpInput';

const LoginScreen = () => {
  const { colors } = useTheme();
  const styles = React.useMemo(() => getStyles(colors), [colors]);

  const [confirm, setConfirm] = useState<FirebaseAuthTypes.ConfirmationResult | null>(null);
  const [code, setCode] = useState('');
  
  const [countryCode, setCountryCode] = useState<CountryCode>('IN');
  const [callingCode, setCallingCode] = useState('91');
  const [pickerVisible, setPickerVisible] = useState(false);
  
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(false);

  // Animations
  const logoFade = useRef(new Animated.Value(0)).current;
  const logoSlide = useRef(new Animated.Value(30)).current;
  
  const inputFade = useRef(new Animated.Value(0)).current;
  const inputSlide = useRef(new Animated.Value(30)).current;
  
  const buttonFade = useRef(new Animated.Value(0)).current;
  const buttonSlide = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    const animate = (fade: Animated.Value, slide: Animated.Value) =>
      Animated.parallel([
        Animated.timing(fade, {
          toValue: 1,
          duration: 700,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(slide, {
          toValue: 0,
          duration: 700,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]);

    Animated.stagger(120, [
      animate(logoFade, logoSlide),
      animate(inputFade, inputSlide),
      animate(buttonFade, buttonSlide),
    ]).start();
  }, []);

  const onSelectCountry = (country: Country) => {
    setCountryCode(country.cca2);
    setCallingCode(country.callingCode[0]);
    setPickerVisible(false);
  };

  async function handleSignIn() {
    if (!phoneNumber) {
      showAlert('Error', 'Please enter a valid phone number');
      return;
    }
    
    setLoading(true);
    try {
      const formattedNumber = `+${callingCode}${phoneNumber}`;
      const confirmation = await signInWithPhoneNumber(getAuth(), formattedNumber);
      setConfirm(confirmation);
    } catch (error: any) {
      console.error(error);
      showAlert('Error', error.message || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  }

  async function confirmCode() {
    if (!code) {
      showAlert('Error', 'Please enter the OTP');
      return;
    }

    setLoading(true);
    try {
      await confirm?.confirm(code);
    } catch (error: any) {
      console.error(error);
      showAlert('Error', 'Invalid code.');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  if (!confirm) {
    return (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>


        <View style={styles.content}>
          <Animated.View style={[styles.fullWidth, { opacity: logoFade, transform: [{ translateY: logoSlide }], marginBottom: 60 }]}>
            <Logo />
          </Animated.View>
          
          <Animated.View style={[styles.fullWidth, { opacity: inputFade, transform: [{ translateY: inputSlide }] }]}>
            <View style={styles.phoneRow}>
              <View style={styles.countryPicker}>
                <CountryPicker
                  theme={{
                    ...DARK_THEME,
                    backgroundColor: colors.surface,
                    onBackgroundTextColor: colors.text,
                    fontSize: 16,
                    filterPlaceholderTextColor: colors.textMuted,
                    flagSizeButton: 20,
                  }}
                  countryCode={countryCode}
                  withFilter
                  withFlag
                  withCallingCodeButton
                  withAlphaFilter
                  withCallingCode
                  withEmoji
                  onSelect={onSelectCountry}
                  visible={pickerVisible}
                  onClose={() => setPickerVisible(false)}
                />
              </View>
              <View style={styles.divider} />
              <Input
                style={styles.phoneInput}
                placeholder="Phone number"
                placeholderTextColor={colors.textMuted}
                value={phoneNumber}
                onChangeText={setPhoneNumber}
                keyboardType="phone-pad"
              />
            </View>
          </Animated.View>
          
          <Animated.View style={[styles.fullWidth, { opacity: buttonFade, transform: [{ translateY: buttonSlide }] }]}>
            <Button title="Continue" onPress={handleSignIn} />
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>


      <View style={styles.content}>
        <Animated.View style={[styles.fullWidth, { opacity: logoFade, transform: [{ translateY: logoSlide }], marginBottom: 40 }]}>
          <Logo />
        </Animated.View>
        
        <Animated.View style={[styles.fullWidth, { opacity: inputFade, transform: [{ translateY: inputSlide }] }]}>
          <OtpInput code={code} setCode={setCode} />
          <Text style={styles.instructionText}>Enter the secure code sent to your device.</Text>
        </Animated.View>
        
        <Animated.View style={[styles.fullWidth, { opacity: buttonFade, transform: [{ translateY: buttonSlide }] }]}>
          <Button title="Verify" onPress={confirmCode} />
          <Button
            title="Back"
            variant="ghost"
            onPress={() => setConfirm(null)}
            style={{ marginTop: 16 }}
          />
        </Animated.View>
      </View>
    </KeyboardAvoidingView>
  );
};

const getStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  content: {
    flex: 1,
    paddingHorizontal: 40,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1, // Stay above absolute SVG background
  },
  fullWidth: {
    width: '100%',
  },
  instructionText: {
    color: colors.textSecondary,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 40,
    letterSpacing: 1,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 32,
    paddingHorizontal: 16,
    height: 60,
  },
  countryPicker: {
    paddingRight: 12,
  },
  divider: {
    width: 1,
    height: 24,
    backgroundColor: colors.border,
    marginRight: 16,
  },
  phoneInput: {
    flex: 1,
    borderBottomWidth: 0,
    height: '100%',
    paddingHorizontal: 0,
    marginBottom: 0,
    fontSize: 18,
    color: colors.text,
    letterSpacing: 2,
  },
});

export default LoginScreen;
