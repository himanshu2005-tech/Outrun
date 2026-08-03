import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, PermissionsAndroid, Keyboard, ScrollView, Image } from 'react-native';
import { getAuth } from '@react-native-firebase/auth';
import { getFirestore, collection, addDoc, serverTimestamp, query, where, getDocs, doc, updateDoc, setDoc } from '@react-native-firebase/firestore';
import Geolocation from 'react-native-geolocation-service';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { launchImageLibrary } from 'react-native-image-picker';
import storage from '@react-native-firebase/storage';
import { useTheme } from '../theme/ThemeContext';
import Button from './Button';
import { showAlert } from './CustomAlert';
import { OutrunModal } from './OutrunModal';
import { GOOGLE_API_KEY } from '../config';

interface CreateClubModalProps {
  visible: boolean;
  onClose: () => void;
  onCreated: (clubId: string) => void;
}

const generateInviteCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();

const CreateClubModal: React.FC<CreateClubModalProps> = ({ visible, onClose, onCreated }) => {
  const { colors } = useTheme();
  const s = React.useMemo(() => getStyles(colors), [colors]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'online' | 'offline'>('online');
  const [city, setCity] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchingMap, setSearchingMap] = useState(false);
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null);

  const [bannerUri, setBannerUri] = useState<string | null>(null);
  const [profileUri, setProfileUri] = useState<string | null>(null);

  const handleSelectImage = async (imageType: 'banner' | 'profile') => {
    const result = await launchImageLibrary({ mediaType: 'photo', quality: 0.8 });
    if (result.didCancel || !result.assets || result.assets.length === 0) return;
    const uri = result.assets[0].uri;
    if (uri) {
      if (imageType === 'banner') setBannerUri(uri);
      else setProfileUri(uri);
    }
  };

  const handleCityChange = (text: string) => {
    setCity(text);
    if (!text.trim()) {
      setSearchResults([]);
      return;
    }
    if (searchTimeout) clearTimeout(searchTimeout);
    setSearchTimeout(setTimeout(async () => {
      setSearchingMap(true);
      try {
        const res = await fetch(`https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(text)}&types=(cities)&key=${GOOGLE_API_KEY}`);
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

  const resetForm = () => {
    setName('');
    setDescription('');
    setType('online');
    setCity('');
    setBannerUri(null);
    setProfileUri(null);
  };

  const handleCreate = async () => {
    if (!name.trim()) return showAlert('Error', 'Please enter a club name.');
    if (type === 'offline' && !city.trim()) return showAlert('Error', 'Please enter a city for your offline club.');

    const user = getAuth().currentUser;
    if (!user) return;

    setLoading(true);
    try {
      let location = null;
      let inviteCode = null;

      if (type === 'offline') {
        if (Platform.OS === 'android') {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
          );
          if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
            throw new Error('Location permission denied. Cannot create offline club.');
          }
        }

        const db = getFirestore();
        let isUnique = false;
        
        while (!isUnique) {
          inviteCode = generateInviteCode();
          const q = query(collection(db, 'clubs'), where('inviteCode', '==', inviteCode));
          const snapshot = await getDocs(q);
          if (snapshot.empty) {
            isUnique = true;
          }
        }
        
        // Request Location
        location = await new Promise((resolve, reject) => {
          Geolocation.getCurrentPosition(
            (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
            (error) => reject(error),
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
          );
        });
      }

      const db = getFirestore();
      const clubData: any = {
        name: name.trim(),
        description: description.trim(),
        type,
        managerId: user.uid,
        createdAt: serverTimestamp(),
      };

      if (type === 'offline') {
        clubData.city = city.trim();
        clubData.location = location;
        clubData.inviteCode = inviteCode;
      }

      // Create Club
      const clubRef = await addDoc(collection(db, 'clubs'), clubData);

      // Upload Images if any
      const updates: any = {};
      if (bannerUri) {
         const filename = `${clubRef.id}_banner_${Date.now()}.jpg`;
         const reference = storage().ref(`clubs/${clubRef.id}/${filename}`);
         await reference.putFile(bannerUri);
         updates.bannerURL = await reference.getDownloadURL();
      }
      if (profileUri) {
         const filename = `${clubRef.id}_profile_${Date.now()}.jpg`;
         const reference = storage().ref(`clubs/${clubRef.id}/${filename}`);
         await reference.putFile(profileUri);
         updates.photoURL = await reference.getDownloadURL();
      }
      
      if (Object.keys(updates).length > 0) {
        await updateDoc(doc(db, 'clubs', clubRef.id), updates);
      }

      // Create Membership for Manager
      await addDoc(collection(db, 'clubMembers'), {
        clubId: clubRef.id,
        userId: user.uid,
        role: 'manager'
      });

      // Generate a permanent QR Invite UUID for offline clubs
      if (type === 'offline') {
        const inviteRef = doc(collection(db, 'qrInvites'));
        await setDoc(inviteRef, {
          uuid: inviteRef.id,
          type: 'club',
          clubId: clubRef.id,
          secretCode: inviteCode,
          createdAt: Date.now(),
        });
        
        await updateDoc(doc(db, 'clubs', clubRef.id), {
          qrInviteUuid: inviteRef.id
        });
      }

      onCreated(clubRef.id);
      resetForm();
    } catch (e: any) {
      console.error(e);
      showAlert('Error', e.message || 'Failed to create club. Did you grant location permission?');
    } finally {
      setLoading(false);
    }
  };

  return (
    <OutrunModal visible={visible} onClose={onClose} title="CREATE RUN CLUB" height="90%">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.container}>
        

        <ScrollView style={s.content} keyboardShouldPersistTaps="handled">
          
          {/* Images Section */}
          <View style={s.imagesSection}>
            <TouchableOpacity style={s.bannerPicker} onPress={() => handleSelectImage('banner')} activeOpacity={0.8}>
              {bannerUri ? (
                <Image source={{ uri: bannerUri }} style={s.bannerPreview} />
              ) : (
                <View style={s.bannerPlaceholder}>
                  <Ionicons name="image-outline" size={24} color={colors.textSecondary} />
                  <Text style={s.imageText}>Add Background Banner</Text>
                </View>
              )}
            </TouchableOpacity>
            
            <TouchableOpacity style={s.profilePicker} onPress={() => handleSelectImage('profile')} activeOpacity={0.8}>
              {profileUri ? (
                <Image source={{ uri: profileUri }} style={s.profilePreview} />
              ) : (
                <View style={s.profilePlaceholder}>
                  <Ionicons name="camera-outline" size={20} color={colors.textSecondary} />
                  <Text style={s.imageTextSmall}>Profile</Text>
                </View>
              )}
              <View style={s.editBadge}>
                <Ionicons name="add" size={14} color={colors.background} />
              </View>
            </TouchableOpacity>
          </View>

          <Text style={s.label}>CLUB TYPE</Text>
          <View style={s.typeSelector}>
            <TouchableOpacity 
              style={[s.typeBtn, type === 'online' && s.typeBtnActive]} 
              onPress={() => setType('online')}
            >
              <Text style={[s.typeText, type === 'online' && s.typeTextActive]}>ONLINE</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[s.typeBtn, type === 'offline' && s.typeBtnActive]} 
              onPress={() => setType('offline')}
            >
              <Text style={[s.typeText, type === 'offline' && s.typeTextActive]}>OFFLINE</Text>
            </TouchableOpacity>
          </View>

          <Text style={s.label}>CLUB NAME</Text>
          <TextInput
            style={s.input}
            placeholder="e.g. Neo Tokyo Runners"
            placeholderTextColor={colors.textSecondary}
            value={name}
            onChangeText={setName}
            maxLength={30}
          />

          <Text style={s.label}>DESCRIPTION</Text>
          <TextInput
            style={[s.input, s.textArea]}
            placeholder="What is this club about?"
            placeholderTextColor={colors.textSecondary}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            maxLength={150}
          />

          {type === 'offline' && (
            <View style={s.offlineInfoCard}>
              <View style={s.offlineInfoHeader}>
                <Ionicons name="location" size={16} color={colors.brand} />
                <Text style={s.offlineInfoTitle}>OFFLINE LOCATION</Text>
              </View>
              <Text style={s.offlineInfoText}>
                <Text style={{fontWeight: '700', color: colors.text}}>Attention: </Text>
                We use the current GPS location of your device right now to set the exact meetup spot for this offline club. 
                {"\n\n"}
                Only users who physically visit this exact GPS coordinate will be able to unlock the invite code to join this club.
                {"\n\n"}
                <Text style={{fontWeight: '700', color: colors.text}}>Safety Rule: </Text>
                Offline Run Clubs generate a unique Invite Code. This code should ONLY be shared with trusted members of your club. The app does not assume any accountability or liability for offline, real-world events.
              </Text>
              
              <Text style={[s.label, {marginTop: 16}]}>SEARCH CITY TO DISPLAY (For Discovery)</Text>
              <View style={s.searchContainer}>
                <TextInput
                  style={s.input}
                  placeholder="e.g. Los Angeles"
                  placeholderTextColor={colors.textSecondary}
                  value={city}
                  onChangeText={handleCityChange}
                />
                {searchingMap && <ActivityIndicator size="small" color={colors.brand} style={s.searchSpinner} />}
              </View>

              {searchResults.length > 0 && (
                <ScrollView style={s.resultsContainer} keyboardShouldPersistTaps="handled" nestedScrollEnabled={true}>
                  {searchResults.map((res: any, idx: number) => (
                    <TouchableOpacity key={idx} style={s.resultItem} onPress={() => { setCity(res.description); setSearchResults([]); Keyboard.dismiss(); }}>
                      <Ionicons name="location-outline" size={16} color={colors.textSecondary} />
                      <View style={{ flex: 1 }}>
                        <Text style={s.resultText} numberOfLines={1}>{res.structured_formatting?.main_text || res.description}</Text>
                        <Text style={s.resultSubtext} numberOfLines={1}>{res.structured_formatting?.secondary_text || ''}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>
          )}

          <View style={{ marginTop: 32, marginBottom: 40 }}>
            {loading ? (
              <ActivityIndicator size="large" color={colors.brand} />
            ) : (
              <Button title="CREATE CLUB" onPress={handleCreate} />
            )}
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
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 1,
  },
  content: {
    padding: 20,
  },
  imagesSection: {
    position: 'relative',
    marginBottom: 24,
    alignItems: 'center',
  },
  bannerPicker: {
    width: '100%',
    height: 120,
    backgroundColor: colors.surface,
    borderRadius: 12,
    overflow: 'hidden',
  },
  bannerPreview: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  bannerPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    borderStyle: 'dashed',
    paddingBottom: 24,
  },
  profilePicker: {
    position: 'absolute',
    bottom: -30,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.surfaceLight,
    borderWidth: 4,
    borderColor: colors.background,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 5,
  },
  profilePreview: {
    width: '100%',
    height: '100%',
    borderRadius: 40,
  },
  profilePlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 40,
  },
  editBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.brand,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.background,
  },
  imageText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 6,
  },
  imageTextSmall: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 16,
    letterSpacing: 1,
  },
  input: {
      backgroundColor: colors.surfaceLight,
      borderWidth: 1,
      borderColor: colors.border,
    color: colors.text,
    padding: 16,
    borderRadius: 8,
    fontSize: 16,
    fontWeight: '500',
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  typeSelector: {
    flexDirection: 'row',
    gap: 12,
  },
  typeBtn: {
    flex: 1,
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  typeBtnActive: {
    borderColor: colors.brand,
    backgroundColor: colors.surfaceLight, 
  },
  typeText: {
    color: colors.textSecondary,
    fontWeight: '700',
    letterSpacing: 1,
  },
  typeTextActive: {
    color: colors.brand,
  },
  offlineInfoCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 16,
    marginTop: 24,
  },
  offlineInfoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  offlineInfoTitle: {
    color: colors.brand,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
  offlineInfoText: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
  },
  searchContainer: {
    justifyContent: 'center',
  },
  searchSpinner: {
    position: 'absolute',
    right: 16,
  },
  resultsContainer: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    marginTop: 4,
    borderWidth: 1,
    borderColor: colors.border,
    maxHeight: 150,
    overflow: 'hidden',
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 12,
  },
  resultText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  resultSubtext: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
});

export default CreateClubModal;
