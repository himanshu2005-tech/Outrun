import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, Keyboard, ScrollView } from 'react-native';
import { getAuth } from '@react-native-firebase/auth';
import { getFirestore, collection, addDoc, serverTimestamp, query, where, getDocs, doc, setDoc, updateDoc } from '@react-native-firebase/firestore';
import Ionicons from 'react-native-vector-icons/Ionicons';
import DatePicker from 'react-native-date-picker';
import { useTheme } from '../theme/ThemeContext';
import Button from './Button';
import { showAlert } from './CustomAlert';
import { OutrunModal } from './OutrunModal';

interface CreateEventModalProps {
  visible: boolean;
  clubId: string;
  clubType: 'online' | 'offline';
  onClose: () => void;
  onCreated: () => void;
}
import { MAPBOX_TOKEN, GOOGLE_API_KEY } from '../config';

const generateInviteCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();

const formatTime = (d: Date) => {

  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const CreateEventModal: React.FC<CreateEventModalProps> = ({ visible, clubId, clubType, onClose, onCreated }) => {
  const { colors } = useTheme();
  const s = React.useMemo(() => getStyles(colors), [colors]);
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [loading, setLoading] = useState(false);

  const [startDateTime, setStartDateTime] = useState<Date | null>(null);
  const [endDateTime, setEndDateTime] = useState<Date | null>(null);
  
  const [startPickerOpen, setStartPickerOpen] = useState(false);
  const [endPickerOpen, setEndPickerOpen] = useState(false);

  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchingMap, setSearchingMap] = useState(false);
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null);

  const handleLocationChange = (text: string) => {
    setLocation(text);
    if (!text.trim()) {
      setSearchResults([]);
      return;
    }

    if (searchTimeout) clearTimeout(searchTimeout);

    setSearchTimeout(setTimeout(async () => {
      setSearchingMap(true);
      try {
        const res = await fetch(`https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(text)}&key=${GOOGLE_API_KEY}`);
        const data = await res.json();
        if (data.predictions) {
          setSearchResults(data.predictions);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setSearchingMap(false);
      }
    }, 500));
  };

  const handleCreate = async () => {
    if (!title.trim() || !startDateTime || !endDateTime) {
      return showAlert('Error', 'Please enter a title, start date/time, and end date/time.');
    }
    if (endDateTime < startDateTime) {
      return showAlert('Error', 'End time cannot be before start time.');
    }

    const user = getAuth().currentUser;
    if (!user) return;

    setLoading(true);
    try {
      const db = getFirestore();
      let eventInviteCode = null;

      if (clubType === 'offline') {
        let isUnique = false;
        while (!isUnique) {
          eventInviteCode = generateInviteCode();
          const q = query(collection(db, 'clubEvents'), where('eventInviteCode', '==', eventInviteCode));
          const snapshot = await getDocs(q);
          if (snapshot.empty) isUnique = true;
        }
      }

      const eventData: any = {
        clubId,
        title: title.trim(),
        startTime: formatTime(startDateTime),
        endTime: formatTime(endDateTime),
        location: location.trim(),
        creatorId: user.uid,
        eventInviteCode,
        participants: [],
        createdAt: serverTimestamp(),
      };

      const eventRef = await addDoc(collection(db, 'clubEvents'), eventData);

      if (clubType === 'offline') {
        const inviteRef = doc(collection(db, 'qrInvites'));
        await setDoc(inviteRef, {
          uuid: inviteRef.id,
          type: 'event',
          clubId,
          eventId: eventRef.id,
          secretCode: eventInviteCode,
          createdAt: Date.now(),
        });
        
        await updateDoc(doc(db, 'clubEvents', eventRef.id), {
          qrInviteUuid: inviteRef.id
        });
      }
      showAlert('Event Created', 'Your event has been successfully created.');
      onCreated();
      setTitle('');
      setStartDateTime(null);
      setEndDateTime(null);
      setLocation('');
      setSearchResults([]);
    } catch (e: any) {
      showAlert('Error', e.message || 'Failed to create event.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <OutrunModal visible={visible} onClose={onClose} title="CREATE RUN EVENT" height="90%">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.container}>
        

        <ScrollView style={s.content} keyboardShouldPersistTaps="handled">
          <Text style={s.label}>EVENT TITLE</Text>
          <TextInput style={s.input} placeholder="e.g. Sunday Long Run" placeholderTextColor={colors.textSecondary} value={title} onChangeText={setTitle} maxLength={40} />

          <View style={s.row}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={s.label}>START DATE & TIME</Text>
              <TouchableOpacity style={s.input} onPress={() => setStartPickerOpen(true)}>
                <Text style={{ color: startDateTime ? colors.text : colors.textSecondary, fontSize: 16 }}>{startDateTime ? formatTime(startDateTime) : 'Select...'}</Text>
              </TouchableOpacity>
            </View>
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={s.label}>END DATE & TIME</Text>
              <TouchableOpacity style={s.input} onPress={() => setEndPickerOpen(true)}>
                <Text style={{ color: endDateTime ? colors.text : colors.textSecondary, fontSize: 16 }}>{endDateTime ? formatTime(endDateTime) : 'Select...'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <DatePicker modal open={startPickerOpen} date={startDateTime || new Date()} mode="datetime" onConfirm={(d) => { setStartPickerOpen(false); setStartDateTime(d); }} onCancel={() => setStartPickerOpen(false)} />
          <DatePicker modal open={endPickerOpen} date={endDateTime || startDateTime || new Date()} mode="datetime" minimumDate={startDateTime || undefined} onConfirm={(d) => { setEndPickerOpen(false); setEndDateTime(d); }} onCancel={() => setEndPickerOpen(false)} />

          <Text style={s.label}>LOCATION NAME</Text>
          <View style={s.searchContainer}>
            <TextInput style={s.input} placeholder="e.g. Central Park West Gate" placeholderTextColor={colors.textSecondary} value={location} onChangeText={handleLocationChange} maxLength={100} />
            {searchingMap && <ActivityIndicator size="small" color={colors.brand} style={s.searchSpinner} />}
          </View>
          
          {searchResults.length > 0 && (
            <ScrollView style={s.resultsContainer} keyboardShouldPersistTaps="handled" nestedScrollEnabled={true}>
              {searchResults.map((res: any, idx: number) => (
                <TouchableOpacity key={idx} style={s.resultItem} onPress={() => { setLocation(res.description); setSearchResults([]); Keyboard.dismiss(); }}>
                  <Ionicons name="location-outline" size={16} color={colors.textSecondary} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.resultText} numberOfLines={1}>{res.structured_formatting?.main_text || res.description}</Text>
                    <Text style={s.resultSubtext} numberOfLines={1}>{res.structured_formatting?.secondary_text || ''}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {clubType === 'offline' && (
            <View style={{ backgroundColor: colors.surfaceLight, padding: 16, borderRadius: 8, marginTop: 16, borderWidth: 1, borderColor: colors.brand }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <Ionicons name="warning" size={16} color={colors.brand} />
                <Text style={{ color: colors.brand, fontSize: 12, fontWeight: '800', marginLeft: 6 }}>OFFLINE SAFETY RULE</Text>
              </View>
              <Text style={{ color: colors.text, fontSize: 12, lineHeight: 18 }}>
                For offline events, a unique Event Check-in Code will be generated. This code must ONLY be shared with people attending the event to maintain uniformity and safety.
              </Text>
            </View>
          )}

          <View style={{ marginTop: 24, paddingBottom: 40 }}>
            {loading ? <ActivityIndicator size="large" color={colors.brand} /> : <Button title="CREATE EVENT" onPress={handleCreate} />}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </OutrunModal>
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
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { color: colors.text, fontSize: 18, fontWeight: '800', letterSpacing: 1 },
  content: { padding: 20 },
  row: { flexDirection: 'row' },
  label: { color: colors.textSecondary, fontSize: 12, fontWeight: '700', marginBottom: 8, marginTop: 16, letterSpacing: 1 },
  input: {
      backgroundColor: colors.surfaceLight,
      borderWidth: 1,
      borderColor: colors.border, color: colors.text, padding: 16, borderRadius: 8, fontSize: 14 },
  searchContainer: { position: 'relative', marginBottom: 8 },
  searchSpinner: { position: 'absolute', right: 12, top: 14 },
  resultsContainer: { backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: colors.border, marginBottom: 16, overflow: 'hidden' },
  resultItem: { flexDirection: 'row', padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 10, alignItems: 'center' },
  resultText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  resultSubtext: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
});

export default CreateEventModal;
