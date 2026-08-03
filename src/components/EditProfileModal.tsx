import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { getFirestore, doc, updateDoc } from '@react-native-firebase/firestore';
import { getAuth } from '@react-native-firebase/auth';
import Input from './Input';
import Button from './Button';
import RulerPicker from './RulerPicker';
import { showAlert } from './CustomAlert';

import { useTheme } from '../theme/ThemeContext';

interface EditProfileModalProps {
  visible: boolean;
  userData: any;
  onClose: () => void;
  onSaved: () => void;
}

const EditProfileModal: React.FC<EditProfileModalProps> = ({ visible, userData, onClose, onSaved }) => {
  const { colors } = useTheme();
  const s = React.useMemo(() => getStyles(colors), [colors]);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [age, setAge] = useState<number>(25);
  const [weight, setWeight] = useState<number>(70);
  const [height, setHeight] = useState<number>(170);
  const [gender, setGender] = useState<'M' | 'F' | 'O' | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible && userData) {
      setFirstName(userData.firstName || '');
      setLastName(userData.lastName || '');
      if (userData.age) setAge(userData.age);
      if (userData.weightKg) setWeight(userData.weightKg);
      if (userData.heightCm) setHeight(userData.heightCm);
      setGender(userData.gender || null);
    }
  }, [visible, userData]);

  const handleSave = async () => {
    if (!firstName.trim() || !lastName.trim() || !gender) {
      showAlert('Error', 'Please fill out your name and select a gender.');
      return;
    }

    const user = getAuth().currentUser;
    if (!user) return;

    setLoading(true);
    try {
      await updateDoc(doc(getFirestore(), 'users', user.uid), {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        age: age,
        weightKg: weight,
        heightCm: height,
        gender: gender,
      });
      onSaved();
    } catch (e: any) {
      showAlert('Error', e.message || 'Failed to update profile.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.container}>
        <View style={s.header}>
          <Text style={s.title}>EDIT PROFILE</Text>
          <TouchableOpacity onPress={onClose} style={s.closeBtn}>
            <Ionicons name="close" size={20} color={colors.text} />
          </TouchableOpacity>
        </View>

        <ScrollView style={s.content} contentContainerStyle={{ paddingBottom: 60 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={s.label}>Name</Text>
          <View style={s.row}>
            <Input
              style={[s.input, { flex: 1, marginRight: 8 }]}
              placeholder="First name"
              value={firstName}
              onChangeText={setFirstName}
            />
            <Input
              style={[s.input, { flex: 1 }]}
              placeholder="Last name"
              value={lastName}
              onChangeText={setLastName}
            />
          </View>

          <Text style={s.label}>Body Metrics</Text>
          <RulerPicker min={10} max={100} value={age} onValueChange={setAge} label="Age" unit=" yrs" />
          <RulerPicker min={30} max={200} value={weight} onValueChange={setWeight} label="Weight" unit=" kg" />
          <RulerPicker min={100} max={250} value={height} onValueChange={setHeight} label="Height" unit=" cm" />

          <Text style={s.privacyText}>
            Your body metrics are kept private and are only used internally for highly accurate calorie and fitness calculations.
          </Text>

          <Text style={s.label}>Gender</Text>
          <View style={s.genderRow}>
            <Button variant={gender === 'M' ? 'primary' : 'ghost'} title="Male" onPress={() => setGender('M')} style={s.genderBtn} />
            <Button variant={gender === 'F' ? 'primary' : 'ghost'} title="Female" onPress={() => setGender('F')} style={s.genderBtn} />
            <Button variant={gender === 'O' ? 'primary' : 'ghost'} title="Other" onPress={() => setGender('O')} style={s.genderBtn} />
          </View>

          <View style={{height: 20}} />
          <Button title="Save Changes" onPress={handleSave} loading={loading} style={s.saveBtn} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const getStyles = (colors: any) => StyleSheet.create({
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    paddingTop: Platform.OS === 'ios' ? 20 : 40,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 2,
  },
  closeBtn: {
    position: 'absolute',
    right: 20,
    top: Platform.OS === 'ios' ? 20 : 40,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 16,
    textTransform: 'uppercase',
  },
  privacyText: {
    color: colors.textSecondary,
    fontSize: 10,
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 10,
  },
  input: {
    marginBottom: 0,
  },
  row: {
    flexDirection: 'row',
  },
  genderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  genderBtn: {
    flex: 1,
    marginHorizontal: 4,
  },
  saveBtn: {
    marginTop: 20,
    marginBottom: Platform.OS === 'ios' ? 40 : 20,
  }
});

export default EditProfileModal;
