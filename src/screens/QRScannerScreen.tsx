import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, Alert, TouchableOpacity } from 'react-native';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import { useBarcodeScannerOutput } from 'react-native-vision-camera-barcode-scanner';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { getFirestore, doc, getDoc, collection, query, where, getDocs, addDoc, updateDoc, arrayUnion } from '@react-native-firebase/firestore';
import { getAuth } from '@react-native-firebase/auth';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useTheme } from '../theme/ThemeContext';
import Button from '../components/Button';
import { OutrunModal } from '../components/OutrunModal';

export default function QRScannerScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<any>();
  const isFocused = useIsFocused();
  const device = useCameraDevice('back');

  const { hasPermission, requestPermission } = useCameraPermission();
  const [scanned, setScanned] = useState(false);
  const [offlineClubModal, setOfflineClubModal] = useState<{ visible: boolean, clubData: any, clubId: string | null }>({ visible: false, clubData: null, clubId: null });
  const [messageModal, setMessageModal] = useState<{ visible: boolean, title: string, message: string, onClose?: () => void }>({ visible: false, title: '', message: '' });
  const db = getFirestore();
  const user = getAuth().currentUser;

  useEffect(() => {
    if (!hasPermission) {
      requestPermission();
    }
  }, [hasPermission, requestPermission]);

  const processQRCode = async (uuid: string) => {
    if (!user) return;
    try {
      // 1. Look up the UUID in qrInvites collection
      const inviteRef = doc(db, 'qrInvites', uuid);
      const inviteSnap = await getDoc(inviteRef);

      if (!inviteSnap.exists()) {
        setMessageModal({
          visible: true,
          title: 'INVALID QR CODE',
          message: 'This QR code is not recognized or has expired.',
          onClose: () => setScanned(false)
        });
        return;
      }

      const inviteData = inviteSnap.data();
      const { type, clubId, eventId, secretCode } = inviteData as any;

      if (type === 'club') {
        // Handle Club Join
        const clubSnap = await getDoc(doc(db, 'clubs', clubId));
        if (!clubSnap.exists()) {
          throw new Error('Club not found.');
        }

        // Check if already a member
        const memberQ = query(collection(db, 'clubMembers'), where('clubId', '==', clubId), where('userId', '==', user.uid));
        const memberSnap = await getDocs(memberQ);

        if (!memberSnap.empty) {
          setMessageModal({
            visible: true,
            title: 'ALREADY JOINED',
            message: 'You are already a member of this club.',
            onClose: () => navigation.goBack()
          });
          return;
        }

        const clubData = clubSnap.data() as any;

        const joinClub = async () => {
          await addDoc(collection(db, 'clubMembers'), {
            clubId,
            userId: user.uid,
            role: 'member'
          });
          setMessageModal({
            visible: true,
            title: 'SUCCESS',
            message: `You have joined ${clubData.name}!`,
            onClose: () => navigation.replace('ClubDetails', { clubId })
          });
        };

        if (clubData.type === 'offline') {
          setOfflineClubModal({ visible: true, clubData, clubId });
        } else {
          await joinClub();
        }

      } else if (type === 'event') {
        // Handle Event Join
        // 1. Verify user is in the club
        const memberQ = query(collection(db, 'clubMembers'), where('clubId', '==', clubId), where('userId', '==', user.uid));
        const memberSnap = await getDocs(memberQ);

        if (memberSnap.empty) {
          setMessageModal({
            visible: true,
            title: 'ACCESS DENIED',
            message: 'You must join the club before you can join its events.',
            onClose: () => setScanned(false)
          });
          return;
        }

        // 2. Join Event using secretCode
        const eventRef = doc(db, 'clubEvents', eventId);
        const eventSnap = await getDoc(eventRef);

        if (!eventSnap.exists()) {
          throw new Error('Event not found.');
        }

        const eventData = eventSnap.data() as any;
        if (eventData.eventInviteCode !== secretCode) {
          throw new Error('QR Code code mismatch. The event code may have been reset.');
        }

        if (eventData.participants?.includes(user.uid)) {
          setMessageModal({
            visible: true,
            title: 'ALREADY JOINED',
            message: 'You are already in this event.',
            onClose: () => navigation.replace('Main', { screen: 'NewOutrun', params: { eventId, clubId } })
          });
          return;
        }

        await updateDoc(eventRef, {
          participants: arrayUnion(user.uid)
        });

        setMessageModal({
          visible: true,
          title: 'SUCCESS',
          message: 'You have joined the event! Your tracker is now ready.',
          onClose: () => navigation.replace('Main', { screen: 'NewOutrun', params: { eventId, clubId } })
        });

      } else {
        throw new Error('Unknown invite type.');
      }

    } catch (e: any) {
      console.error(e);
      setMessageModal({
        visible: true,
        title: 'ERROR',
        message: e.message || 'Failed to process QR code',
        onClose: () => setScanned(false)
      });
    }
  };

  const objectOutput = useBarcodeScannerOutput({
    barcodeFormats: ['qr-code'],
    onBarcodeScanned: (barcodes) => {
      if (scanned || barcodes.length === 0) return;

      const code = barcodes[0];
      if (code && code.rawValue) {
        setScanned(true);
        processQRCode(code.rawValue);
      }
    },
    onError: (error) => {
      console.error('Barcode scanning error:', error);
    }
  });

  if (!hasPermission) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: colors.text }}>Requesting camera permission...</Text>
      </View>
    );
  }

  if (device == null) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: colors.text }}>No camera found on this device.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={isFocused && !scanned}
        outputs={[objectOutput]}
      />

      {/* Overlay */}
      <View style={styles.overlay} pointerEvents="box-none">
        <View style={styles.centerArea} pointerEvents="none">
          <View style={styles.maskBox}>
            <View style={styles.scanBox}>
              <View style={[styles.corner, styles.cornerTL, { borderColor: colors.brand }]} />
              <View style={[styles.corner, styles.cornerTR, { borderColor: colors.brand }]} />
              <View style={[styles.corner, styles.cornerBL, { borderColor: colors.brand }]} />
              <View style={[styles.corner, styles.cornerBR, { borderColor: colors.brand }]} />
            </View>
          </View>
        </View>

        <View style={styles.header} pointerEvents="box-none">
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="close" size={28} color="#FFF" />
          </TouchableOpacity>
        </View>

        <View style={styles.footer} pointerEvents="none">
          <Text style={styles.helpText}>Point your camera at a Club or Event QR Code</Text>
        </View>
      </View>

      <OutrunModal
        visible={offlineClubModal.visible}
        onClose={() => {
          setOfflineClubModal({ visible: false, clubData: null, clubId: null });
          setScanned(false);
        }}
        title="OFFLINE SAFETY RULE"
        height={320}
      >
        <View style={{ padding: 20 }}>
          <Text style={{ color: colors.text, fontSize: 16, marginBottom: 30, textAlign: 'center', lineHeight: 24 }}>
            By joining this offline run club, you agree that the app holds no accountability for real-world interactions. Do you wish to proceed?
          </Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Button variant="ghost" title="CANCEL" onPress={() => {
              setOfflineClubModal({ visible: false, clubData: null, clubId: null });
              setScanned(false);
            }} style={{ flex: 1 }} />
            <Button variant="primary" title="AGREE & JOIN" onPress={async () => {
              const { clubId, clubData } = offlineClubModal;
              if (clubId && clubData && user) {
                setOfflineClubModal({ visible: false, clubData: null, clubId: null });
                try {
                  await addDoc(collection(db, 'clubMembers'), {
                    clubId,
                    userId: user.uid,
                    role: 'member'
                  });
                  setMessageModal({
                    visible: true,
                    title: 'SUCCESS',
                    message: `You have joined ${clubData.name}!`,
                    onClose: () => navigation.replace('ClubDetails', { clubId })
                  });
                } catch (e: any) {
                  setMessageModal({
                    visible: true,
                    title: 'ERROR',
                    message: e.message,
                    onClose: () => setScanned(false)
                  });
                }
              }
            }} style={{ flex: 1 }} />
          </View>
        </View>
      </OutrunModal>

      <OutrunModal 
        visible={messageModal.visible} 
        onClose={() => {
          const cb = messageModal.onClose;
          setMessageModal({ visible: false, title: '', message: '' });
          if (cb) cb();
        }}
        title={messageModal.title}
        height={260}
      >
        <View style={{ padding: 20 }}>
          <Text style={{ color: colors.text, fontSize: 16, marginBottom: 30, textAlign: 'center', lineHeight: 24 }}>
            {messageModal.message}
          </Text>
          <Button variant="primary" title="OK" onPress={() => {
            const cb = messageModal.onClose;
            setMessageModal({ visible: false, title: '', message: '' });
            if (cb) cb();
          }} style={{ width: '100%' }} />
        </View>
      </OutrunModal>
    </View>
  );
}

const CORNER_SIZE = 32;
const CORNER_THICKNESS = 4;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  header: {
    position: 'absolute',
    top: 60,
    left: 20,
    right: 20,
    flexDirection: 'row',
    zIndex: 10,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerArea: {
    // This is the fix: it's a full-screen flex container that
    // actually centers its child because the child is NOT absolutely positioned.
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  maskBox: {
    // A regular (non-absolute) flex child, so justifyContent/alignItems
    // on centerArea actually applies and centers this on screen.
    width: 3000,
    height: 3000,
    borderWidth: 1375, // (3000 - 250) / 2
    borderColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanBox: {
    width: 250,
    height: 250,
    backgroundColor: 'transparent',
  },
  corner: {
    position: 'absolute',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
    borderTopLeftRadius: 16,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
    borderTopRightRadius: 16,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
    borderBottomLeftRadius: 16,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
    borderBottomRightRadius: 16,
  },
  footer: {
    position: 'absolute',
    bottom: 60,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
    width: '100%',
  },
  helpText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    overflow: 'hidden',
    textAlign: 'center',
    maxWidth: '85%'
  }
});