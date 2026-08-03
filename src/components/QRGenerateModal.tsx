import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import ViewShot from 'react-native-view-shot';
import Share from 'react-native-share';

import { getFirestore, doc, setDoc, collection } from '@react-native-firebase/firestore';
import { useTheme } from '../theme/ThemeContext';
import Button from './Button';
import { OutrunModal } from './OutrunModal';

interface QRGenerateModalProps {
  visible: boolean;
  onClose: () => void;
  type: 'club' | 'event';
  clubId: string;
  eventId?: string;
  secretCode?: string;
  title: string;
  existingUuid?: string;
}

export default function QRGenerateModal({ visible, onClose, type, clubId, eventId, secretCode, title, existingUuid }: QRGenerateModalProps) {
  const { colors } = useTheme();
  const [uuid, setUuid] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const viewShotRef = useRef<ViewShot>(null);

  useEffect(() => {
    if (visible) {
      if (existingUuid) {
        setUuid(existingUuid);
      } else if (!uuid) {
        generateInvite();
      }
    } else {
      // Reset when closed so it doesn't leak between opens
      setUuid(null);
    }
  }, [visible, existingUuid]);

  const generateInvite = async () => {
    setLoading(true);
    try {
      const db = getFirestore();
      // Generate a new document reference to get a unique ID
      const inviteRef = doc(collection(db, 'qrInvites'));
      
      const payload: any = {
        uuid: inviteRef.id,
        type,
        clubId,
        createdAt: Date.now(),
      };
      
      if (type === 'event') {
        payload.eventId = eventId;
        payload.secretCode = secretCode;
      }

      await setDoc(inviteRef, payload);
      setUuid(inviteRef.id);
    } catch (e: any) {
      console.error(e);
      Alert.alert('Error', 'Failed to generate QR Code invite.');
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const handleShare = async () => {
    if (!viewShotRef.current?.capture) return;
    try {
      const uri = await viewShotRef.current.capture();
      await Share.open({
        url: uri,
        title: `Join ${title}`,
        message: `Scan this QR code in the Outrun app to join ${title}!`,
      });
    } catch (e: any) {
      if (e.message !== 'User did not share') {
        console.error(e);
      }
    }
  };

  return (
    <OutrunModal 
      visible={visible} 
      onClose={onClose} 
      title={type === 'club' ? 'CLUB INVITE' : 'EVENT INVITE'}
    >
      <View style={{ alignItems: 'center', paddingBottom: 24, paddingHorizontal: 16 }}>
        <View style={[styles.qrContainer, { backgroundColor: colors.background }]}>
          {loading || !uuid ? (
            <ActivityIndicator size="large" color={colors.brand} />
          ) : (
            <ViewShot ref={viewShotRef} options={{ format: 'png', quality: 1 }}>
              <View style={[styles.qrWrapper, { paddingTop: 20, backgroundColor: colors.surface }]}>
                <QRCode
                  value={uuid}
                  size={200}
                  color={colors.text}
                  backgroundColor={colors.surface}
                />
                <Text style={[styles.qrFooterText, { color: colors.text }]}>Scan in Outrun App</Text>
              </View>
            </ViewShot>
          )}
        </View>

        <Text style={[styles.subtitle, { color: colors.text }]}>{title}</Text>

        <Button 
          title="SHARE OR SAVE QR" 
          variant="primary" 
          onPress={handleShare} 
          disabled={!uuid || loading}
          style={{ width: '100%', marginTop: 24 }}
        />
      </View>
    </OutrunModal>
  );
}

const styles = StyleSheet.create({
  subtitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginTop: 32,
    marginBottom: 8,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  qrContainer: {
    width: 260,
    height: 260,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 24,
  },
  qrWrapper: {
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
  },
  qrFooterText: {
    marginTop: 12,
    color: '#000',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  }
});
