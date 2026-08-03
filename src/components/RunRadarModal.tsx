import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ActivityIndicator, Animated, PermissionsAndroid, Platform } from 'react-native';
import MapboxGL from '@rnmapbox/maps';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { getAuth } from '@react-native-firebase/auth';
import { getFirestore, doc, collection, onSnapshot, setDoc, deleteDoc, updateDoc, query, where } from '@react-native-firebase/firestore';
import Geolocation from 'react-native-geolocation-service';
import Button from './Button';
import { showAlert } from './CustomAlert';
import { useTheme } from '../theme/ThemeContext';

const BG = '#000000';
const INK = '#FFFFFF';
// Removed ACCENT constant
const MUTE = '#6B6B6B';
const CARD = colors.surfaceLight;

// Haversine distance in km
const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {

  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

interface RunRadarModalProps {
  visible: boolean;
  onClose: () => void;
}

const PulsingRadar = () => {
  const { colors } = useTheme();
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.timing(anim, { toValue: 1, duration: 2000, useNativeDriver: true })).start();
  }, [anim]);
  return (
    <View style={{ width: 100, height: 100, justifyContent: 'center', alignItems: 'center' }}>
      <Animated.View style={{ position: 'absolute', width: 100, height: 100, borderRadius: 50, backgroundColor: colors.brand, opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }), transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.1, 1] }) }] }} />
      <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: colors.brand, borderWidth: 3, borderColor: '#000' }} />
    </View>
  );
};

export const RunRadarModal: React.FC<RunRadarModalProps> = ({ visible, onClose }) => {
  const { colors } = useTheme();
  const s = React.useMemo(() => getStyles(colors), [colors]);
  const [myLocation, setMyLocation] = useState<any>(null);
  const [broadcasters, setBroadcasters] = useState<any[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<any[]>([]);
  const [activeMatch, setActiveMatch] = useState<any>(null);
  const [pendingSentRequest, setPendingSentRequest] = useState<string | null>(null);

  const auth = getAuth();
  const db = getFirestore();
  const user = auth.currentUser;
  const cameraRef = useRef<MapboxGL.Camera>(null);

  // 1. Get location and start broadcasting
  useEffect(() => {
    if (!visible || !user) return;
    
    const startBroadcasting = async () => {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) return;
      }

      Geolocation.getCurrentPosition(
        async (pos) => {
          const loc = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
          setMyLocation(loc);
          if (cameraRef.current) {
            cameraRef.current.setCamera({ centerCoordinate: [loc.longitude, loc.latitude], zoomLevel: 13, animationDuration: 1000 });
          }
          
          // Broadcast to Firestore
          await setDoc(doc(db, 'broadcastingPartners', user.uid), {
            userId: user.uid,
            name: user.displayName || 'Runner',
            phone: user.phoneNumber || '',
            latitude: loc.latitude,
            longitude: loc.longitude,
            timestamp: Date.now()
          });
        },
        (err) => console.log(err),
        { enableHighAccuracy: true }
      );
    };

    startBroadcasting();

    // Cleanup broadcast on close
    return () => {
      deleteDoc(doc(db, 'broadcastingPartners', user.uid)).catch(console.error);
      setMyLocation(null);
      setBroadcasters([]);
      setActiveMatch(null);
      setPendingSentRequest(null);
    };
  }, [visible, user]);

  // 2. Listen to other broadcasters
  useEffect(() => {
    if (!visible || !myLocation || !user) return;
    const unsub = onSnapshot(collection(db, 'broadcastingPartners'), (snap) => {
      const others: any[] = [];
      snap.forEach(d => {
        if (d.id !== user.uid) {
          const data = d.data();
          if (Date.now() - data.timestamp < 30 * 60 * 1000) { // active in last 30 mins
            const dist = getDistance(myLocation.latitude, myLocation.longitude, data.latitude, data.longitude);
            if (dist <= 15) { // within 15km
              others.push({ ...data, distance: dist });
            }
          }
        }
      });
      setBroadcasters(others);
    });
    return () => unsub();
  }, [visible, myLocation, user]);

  // 3. Listen for requests involving me
  useEffect(() => {
    if (!visible || !user) return;
    const unsubIn = onSnapshot(query(collection(db, 'runPartnerRequests'), where('to', '==', user.uid)), (snap) => {
      const reqs: any[] = [];
      snap.forEach(d => reqs.push({ id: d.id, ...d.data() }));
      
      const match = reqs.find(r => r.status === 'accepted');
      if (match) {
        setActiveMatch(match);
      } else {
        setIncomingRequests(reqs.filter(r => r.status === 'pending'));
      }
    });

    const unsubOut = onSnapshot(query(collection(db, 'runPartnerRequests'), where('from', '==', user.uid)), (snap) => {
      const reqs: any[] = [];
      snap.forEach(d => reqs.push({ id: d.id, ...d.data() }));
      const match = reqs.find(r => r.status === 'accepted');
      if (match) {
        setActiveMatch(match);
      }
    });

    return () => { unsubIn(); unsubOut(); };
  }, [visible, user]);

  const handleSendRequest = async (targetUser: any) => {
    if (!user) return;
    try {
      const ref = doc(collection(db, 'runPartnerRequests'));
      await setDoc(ref, {
        from: user.uid,
        fromName: user.displayName || 'Runner',
        fromPhone: user.phoneNumber || '',
        to: targetUser.userId,
        toName: targetUser.name,
        toPhone: targetUser.phone,
        status: 'pending',
        timestamp: Date.now()
      });
      setPendingSentRequest(targetUser.userId);
      showAlert('Request Sent', `Asked ${targetUser.name} to run!`);
    } catch (e) {
      console.error(e);
    }
  };

  const handleAccept = (req: any) => {
    if (!user) return;
    const sharePhone = user.phoneNumber || 'Not provided';
    showAlert(
      'Share Phone Number?', 
      `To coordinate with ${req.fromName}, we will share your phone number (${sharePhone}). Proceed?`,
      [
        { text: 'CANCEL', style: 'cancel' },
        { text: 'SHARE & ACCEPT', onPress: async () => {
          await updateDoc(doc(db, 'runPartnerRequests', req.id), { status: 'accepted', toPhone: sharePhone });
        }}
      ]
    );
  };

  const handleDecline = async (req: any) => {
    await deleteDoc(doc(db, 'runPartnerRequests', req.id));
  };

  if (activeMatch) {
    const isMeFrom = activeMatch.from === user?.uid;
    const partnerName = isMeFrom ? activeMatch.toName : activeMatch.fromName;
    const partnerPhone = isMeFrom ? activeMatch.toPhone : activeMatch.fromPhone;
    
    return (
      <Modal visible={visible} animationType="slide">
        <View style={s.matchContainer}>
          <Text style={s.matchTitle}>IT'S A MATCH!</Text>
          <Text style={s.matchSub}>You are going running with {partnerName}!</Text>
          
          <View style={s.contactCard}>
            <Text style={s.contactLabel}>THEIR PHONE NUMBER</Text>
            <Text style={s.contactValue}>{partnerPhone || 'No number provided'}</Text>
          </View>
          
          <Text style={s.matchDisclaimer}>Text them to coordinate a meeting spot and time.</Text>
          
          <Button title="Close Radar" onPress={onClose} style={{ marginTop: 40, width: '80%' }} />
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={s.container}>
        <View style={s.header}>
          <Text style={s.title}>RADAR</Text>
          <TouchableOpacity onPress={onClose} style={s.closeBtn}>
            <Ionicons name="close" size={28} color={INK} />
          </TouchableOpacity>
        </View>

        {!myLocation ? (
          <View style={s.loadingBox}>
            <ActivityIndicator size="large" color={colors.brand} />
            <Text style={s.loadingText}>Locating you...</Text>
          </View>
        ) : (
          <View style={s.mapWrapper}>
            <MapboxGL.MapView style={{ flex: 1 }} styleURL="mapbox://styles/mapbox/dark-v11" logoEnabled={false} compassEnabled={false} attributionEnabled={false}>
              <MapboxGL.Camera ref={cameraRef} zoomLevel={13} centerCoordinate={[myLocation.longitude, myLocation.latitude]} />
              
              <MapboxGL.PointAnnotation id="me" coordinate={[myLocation.longitude, myLocation.latitude]}>
                <PulsingRadar />
              </MapboxGL.PointAnnotation>

              {broadcasters.map(b => (
                <MapboxGL.PointAnnotation key={b.userId} id={b.userId} coordinate={[b.longitude, b.latitude]}>
                  <TouchableOpacity activeOpacity={0.8} onPress={() => handleSendRequest(b)} style={s.otherMarker}>
                    <Ionicons name="person" size={14} color={colors.background} />
                  </TouchableOpacity>
                </MapboxGL.PointAnnotation>
              ))}
            </MapboxGL.MapView>

            <View style={s.bottomPanel}>
              <Text style={s.panelTitle}>Broadcasting...</Text>
              <Text style={s.panelSub}>Tap a dot on the map to ask them to run.</Text>
              
              {incomingRequests.length > 0 && (
                <View style={s.requestsList}>
                  {incomingRequests.map(r => (
                    <View key={r.id} style={s.reqCard}>
                      <Text style={s.reqText}><Text style={{fontWeight:'bold'}}>{r.fromName}</Text> wants to run!</Text>
                      <View style={{flexDirection:'row', gap:8, marginTop: 10}}>
                        <TouchableOpacity style={s.accBtn} onPress={() => handleAccept(r)}><Text style={s.accText}>Accept</Text></TouchableOpacity>
                        <TouchableOpacity style={s.decBtn} onPress={() => handleDecline(r)}><Text style={s.decText}>Decline</Text></TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
};

const getStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 20, paddingTop: Platform.OS === 'ios' ? 50 : 20, borderBottomWidth: 1, borderBottomColor: colors.border, zIndex: 10, backgroundColor: BG },
  title: { color: colors.brand, fontSize: 16, fontWeight: '900', letterSpacing: 3 },
  closeBtn: { position: 'absolute', right: 20, top: Platform.OS === 'ios' ? 45 : 15 },
  loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: MUTE, marginTop: 16, fontSize: 12, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' },
  mapWrapper: { flex: 1 },
  otherMarker: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.text, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: colors.brand },
  bottomPanel: { position: 'absolute', bottom: 0, width: '100%', backgroundColor: 'rgba(11,11,12,0.95)', padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  panelTitle: { color: colors.brand, fontSize: 14, fontWeight: '800', letterSpacing: 1.5 },
  panelSub: { color: MUTE, fontSize: 12, marginTop: 4 },
  requestsList: { marginTop: 16, gap: 10 },
  reqCard: { backgroundColor: colors.border, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  reqText: { color: INK, fontSize: 14 },
  accBtn: { flex: 1, backgroundColor: colors.brand, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  accText: { color: '#000', fontWeight: 'bold' },
  decBtn: { flex: 1, backgroundColor: colors.border, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  decText: { color: INK, fontWeight: 'bold' },
  matchContainer: { flex: 1, backgroundColor: BG, justifyContent: 'center', alignItems: 'center', padding: 30 },
  matchTitle: { color: colors.brand, fontSize: 32, fontWeight: '900', fontStyle: 'italic', marginBottom: 10 },
  matchSub: { color: INK, fontSize: 16, textAlign: 'center', marginBottom: 40 },
  contactCard: { backgroundColor: CARD, padding: 24, borderRadius: 16, width: '100%', alignItems: 'center', borderWidth: 1, borderColor: colors.brand },
  contactLabel: { color: MUTE, fontSize: 10, fontWeight: '800', letterSpacing: 2, marginBottom: 8 },
  contactValue: { color: INK, fontSize: 24, fontWeight: 'bold', letterSpacing: 2 },
  matchDisclaimer: { color: MUTE, fontSize: 12, textAlign: 'center', marginTop: 24, paddingHorizontal: 20 }
});
