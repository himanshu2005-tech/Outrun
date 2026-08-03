import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing, KeyboardAvoidingView, ScrollView, Platform, TouchableOpacity } from 'react-native';
import { getAuth } from '@react-native-firebase/auth';
import { getFirestore, doc, setDoc, serverTimestamp } from '@react-native-firebase/firestore';
import { useTheme } from '../theme/ThemeContext';
import { showAlert } from '../components/CustomAlert';
import Input from '../components/Input';
import Button from '../components/Button';
import Logo from '../components/Logo';
import RulerPicker from '../components/RulerPicker';
import Ionicons from 'react-native-vector-icons/Ionicons';

const ProfileSetupScreen = () => {
  const { colors } = useTheme();
  const styles = React.useMemo(() => getStyles(colors), [colors]);

  const [step, setStep] = useState(1);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [age, setAge] = useState<number>(25);
  const [weight, setWeight] = useState<number>(70);
  const [height, setHeight] = useState<number>(170);
  const [gender, setGender] = useState<'M' | 'F' | 'O' | null>(null);
  const [loading, setLoading] = useState(false);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    fadeAnim.setValue(0);
    slideAnim.setValue(30);
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [step]);

  const handleNext = () => {
    if (step === 1) {
      if (!firstName.trim() || !lastName.trim()) {
        showAlert('Error', 'Please enter your full name.');
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (!gender) {
        showAlert('Error', 'Please select a gender.');
        return;
      }
      setStep(3);
    }
  };

  const handleSaveProfile = async () => {
    if (!firstName.trim() || !lastName.trim() || !gender) {
      showAlert('Error', 'Please fill out all required fields.');
      return;
    }

    const user = getAuth().currentUser;
    if (!user) return;

    setLoading(true);
    try {
      await setDoc(doc(getFirestore(), 'users', user.uid), {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        age: age,
        weightKg: weight,
        heightCm: height,
        gender: gender,
        phoneNumber: user.phoneNumber,
        photoURL: user.photoURL || null,
        createdAt: serverTimestamp(),
      });
    } catch (error: any) {
      console.error('Error saving profile:', error);
      showAlert('Error', 'Failed to save profile. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
      {step > 1 && (
        <TouchableOpacity style={styles.backBtn} onPress={() => setStep(step - 1)}>
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </TouchableOpacity>
      )}
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Animated.View
          style={[
            styles.content,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          <Logo />
          
          <Text style={styles.title}>
            {step === 1 ? 'What should we call you?' : step === 2 ? 'Tell us about yourself' : 'Your body metrics'}
          </Text>
          
          {step === 1 && (
            <View>
              <Input
                style={styles.input}
                placeholder="First name"
                value={firstName}
                onChangeText={setFirstName}
                autoCapitalize="words"
              />
              <Input
                style={styles.input}
                placeholder="Last name"
                value={lastName}
                onChangeText={setLastName}
                autoCapitalize="words"
              />
            </View>
          )}

          {step === 2 && (
            <View>
              <RulerPicker min={10} max={100} value={age} onValueChange={setAge} label="Age" unit=" yrs" />
              <Text style={{color: colors.textSecondary, marginBottom: 12, textAlign: 'center', fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase'}}>Gender</Text>
              <View style={styles.genderRow}>
                <Button variant={gender === 'M' ? 'primary' : 'ghost'} title="Male" onPress={() => setGender('M')} style={styles.genderBtn} />
                <Button variant={gender === 'F' ? 'primary' : 'ghost'} title="Female" onPress={() => setGender('F')} style={styles.genderBtn} />
                <Button variant={gender === 'O' ? 'primary' : 'ghost'} title="Other" onPress={() => setGender('O')} style={styles.genderBtn} />
              </View>
            </View>
          )}

          {step === 3 && (
            <View>
              <RulerPicker min={30} max={200} value={weight} onValueChange={setWeight} label="Weight" unit=" kg" />
              <RulerPicker min={100} max={250} value={height} onValueChange={setHeight} label="Height" unit=" cm" />
              <Text style={styles.privacyText}>
                Your body metrics are kept private and are only used internally for highly accurate calorie and fitness calculations.
              </Text>
            </View>
          )}

          <Button
            title={step === 3 ? "Complete Setup" : "Next"}
            onPress={step === 3 ? handleSaveProfile : handleNext}
            loading={loading}
            style={{ marginTop: 32 }}
          />
        </Animated.View>
      </ScrollView>

      {/* Step Counter in Bottom Left */}
      <View style={styles.stepCounterContainer}>
        <Text style={styles.stepCounterText}>STEP {step} OF 3</Text>
        <View style={styles.progressRow}>
          {[1, 2, 3].map((s) => (
            <View key={s} style={[styles.progressDot, step === s && styles.progressDotActive]} />
          ))}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};

const getStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 40,
    justifyContent: 'center',
    paddingVertical: 60,
  },
  content: {
    width: '100%',
  },
  title: {
    fontSize: 14,
    fontWeight: '300',
    color: colors.textSecondary,
    textAlign: 'center',
    letterSpacing: 0.5,
    marginTop: -32,
    marginBottom: 40,
  },
  input: {
    marginBottom: 24,
  },
  privacyText: {
    color: colors.textSecondary,
    fontSize: 10,
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 10,
  },
  row: {
    flexDirection: 'row',
  },
  genderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  genderBtn: {
    flex: 1,
    marginHorizontal: 4,
  },
  backBtn: {
    position: 'absolute',
    top: 60,
    left: 20,
    zIndex: 10,
    padding: 8,
  },
  progressRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
  },
  progressDot: {
    width: 24,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
  progressDotActive: {
    backgroundColor: colors.brand,
  },
  stepCounterContainer: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 40 : 30,
    left: 40,
    zIndex: 10,
  },
  stepCounterText: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
});

export default ProfileSetupScreen;
