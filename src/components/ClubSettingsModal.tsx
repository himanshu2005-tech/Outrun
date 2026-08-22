import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, Keyboard, ScrollView, Image } from 'react-native';
import { getFirestore, doc, updateDoc } from '@react-native-firebase/firestore';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { launchImageLibrary } from 'react-native-image-picker';
import storage from '@react-native-firebase/storage';
import { useTheme } from '../theme/ThemeContext';
import Button from './Button';
import { showAlert } from './CustomAlert';
import { OutrunModal } from './OutrunModal';
import OutrunLoader from './OutrunLoader';
import { GOOGLE_API_KEY } from '../config';

interface ClubSettingsModalProps {
  visible: boolean;
  club: any;
  onClose: () => void;
}

const ClubSettingsModal: React.FC<ClubSettingsModalProps> = ({ visible, club, onClose }) => {
  const { colors } = useTheme();
  const s = React.useMemo(() => getStyles(colors), [colors]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [city, setCity] = useState('');
  const [loading, setLoading] = useState(false);
  
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchingMap, setSearchingMap] = useState(false);
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null);

  const [bannerUri, setBannerUri] = useState<string | null>(null);
  const [profileUri, setProfileUri] = useState<string | null>(null);

  useEffect(() => {
    if (club) {
      setName(club.name || '');
      setDescription(club.description || '');
      setCity(club.city || '');
      setBannerUri(club.bannerURL || null);
      setProfileUri(club.photoURL || null);
    }
  }, [club]);

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

  const handleSave = async () => {
    if (!name.trim()) return showAlert('Error', 'Please enter a club name.');
    if (club?.type === 'offline' && !city.trim()) return showAlert('Error', 'Please enter a city for your offline club.');

    setLoading(true);
    try {
      const db = getFirestore();
      
      const updates: any = {
        name: name.trim(),
        description: description.trim(),
      };

      if (club?.type === 'offline') {
        updates.city = city.trim();
      }

      if (bannerUri && bannerUri !== club.bannerURL) {
         const filename = `${club.id}_banner_${Date.now()}.jpg`;
         const reference = storage().ref(`clubs/${club.id}/${filename}`);
         await reference.putFile(bannerUri);
         updates.bannerURL = await reference.getDownloadURL();
      }
      
      if (profileUri && profileUri !== club.photoURL) {
         const filename = `${club.id}_profile_${Date.now()}.jpg`;
         const reference = storage().ref(`clubs/${club.id}/${filename}`);
         await reference.putFile(profileUri);
         updates.photoURL = await reference.getDownloadURL();
      }
      
      await updateDoc(doc(db, 'clubs', club.id), updates);

      showAlert('Success', 'Club details updated successfully.');
      onClose();
    } catch (e: any) {
      console.error(e);
      showAlert('Error', e.message || 'Failed to update club.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <OutrunModal visible={visible} onClose={onClose} title="CLUB SETTINGS" height="90%">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.container}>
        

        <ScrollView style={s.content} keyboardShouldPersistTaps="handled">
          
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
              <View style={s.bannerEditBadge}>
                <Ionicons name="camera" size={16} color={colors.background} />
              </View>
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
                <Ionicons name="camera" size={14} color={colors.background} />
              </View>
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

          {club?.type === 'offline' && (
            <View style={s.offlineInfoCard}>
              <Text style={s.label}>SEARCH CITY TO DISPLAY (For Discovery)</Text>
              <View style={s.searchContainer}>
                <TextInput
                  style={s.input}
                  placeholder="e.g. Los Angeles"
                  placeholderTextColor={colors.textSecondary}
                  value={city}
                  onChangeText={handleCityChange}
                />
                {searchingMap && <OutrunLoader size="small" label={false} style={s.searchSpinner} />}
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
              <OutrunLoader size="large" label="SAVING CHANGES" />
            ) : (
              <Button title="SAVE CHANGES" onPress={handleSave} />
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
  bannerEditBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.brand,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.background,
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
  offlineInfoCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 16,
    marginTop: 24,
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

export default ClubSettingsModal;
