import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Platform, Animated, TouchableOpacity, Vibration, PermissionsAndroid, PanResponder, Modal, AppState, Pressable } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import MapboxGL from '@rnmapbox/maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MAPBOX_TOKEN } from '../config';

MapboxGL.setAccessToken(MAPBOX_TOKEN);
import { getAuth } from '@react-native-firebase/auth';
import { getFirestore, getDocs, collection, query, orderBy, doc, getDoc, setDoc } from '@react-native-firebase/firestore';
import Geolocation from 'react-native-geolocation-service';
import { trackingService } from '../services/TrackingService';
import { dbService } from '../services/DatabaseService';
import { GPSPoint, haversineDistance } from '../utils/geoUtils';
import { Lap, detectAutoLap } from '../utils/lapDetection';
import { useTheme } from '../theme/ThemeContext';
import Button from '../components/Button';
import { StartRunButton } from '../components/StartRunButton';
import { showAlert } from '../components/CustomAlert';
import { OutrunModal } from '../components/OutrunModal';
import { OutrunSwitch } from '../components/OutrunSwitch';
import { MyRunsModal } from '../components/MyRunsModal';
import { MapStyleModal, MapStyleType } from '../components/MapStyleModal';
import RunDetailsModal from './RunDetailsModal';
import Ionicons from 'react-native-vector-icons/Ionicons';
import ViewShot from 'react-native-view-shot';
import Share from 'react-native-share';

// ---- GenZ-minimal palette (kept local so nothing outside this file changes) ----
const PulsingDot = ({ color = "#FF6B1A" }: { color?: string }) => {
  const { colors } = useTheme();
  const s = React.useMemo(() => getStyles(colors), [colors]);

  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.timing(anim, {
        toValue: 1,
        duration: 2000,
        useNativeDriver: true,
      })
    ).start();
  }, [anim]);

  return (
    <View style={{ width: 60, height: 60, justifyContent: 'center', alignItems: 'center' }}>
      <Animated.View
        style={{
          position: 'absolute',
          width: 60,
          height: 60,
          borderRadius: 30,
          backgroundColor: color,
          opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
          transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] }) }]
        }}
      />
      <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: color, borderWidth: 2, borderColor: colors.background }} />
    </View>
  );
};

const NewOutrunScreen = () => {
  const { colors, theme } = useTheme();
  const s = React.useMemo(() => getStyles(colors), [colors]);

  const insets = useSafeAreaInsets();
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { clubId, eventId } = (route.params as any) || {};

  const [activeClubId, setActiveClubId] = useState<string | null>(clubId || null);
  const [activeEventId, setActiveEventId] = useState<string | null>(eventId || null);
  const [clubName, setClubName] = useState<string | null>(route.params?.clubName || null);

  useEffect(() => {
    setActiveClubId(clubId || null);
    setActiveEventId(eventId || null);
    if (route.params?.clubName) {
      setClubName(route.params.clubName);
    } else if (clubId) {
      const db = getFirestore();
      getDoc(doc(db, 'clubs', clubId)).then(snap => {
        if (snap.exists) {
          setClubName(snap.data()?.name || null);
        }
      }).catch(console.error);
    }
  }, [clubId, eventId, route.params?.clubName]);

  const [isRunning, setIsRunning] = useState(false);
  const [points, setPoints] = useState<GPSPoint[]>([]);
  const [liveDistance, setLiveDistance] = useState(0);
  const [hasCompletedRun, setHasCompletedRun] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [myRunsVisible, setMyRunsVisible] = useState(false);
  const [isStyleModalVisible, setStyleModalVisible] = useState(false);
  const [mapStyle, setMapStyle] = useState<MapStyleType>('outrun');
  
  // Global Radar State
  const [isBroadcastingGlobal, setIsBroadcastingGlobal] = useState(false);
  const isClubOrEvent = !!(activeClubId || activeEventId);
  // Global radar is always visible if we are NOT in a club/event
  const isRadarGlobalVisible = !isClubOrEvent;
  const [globalRunners, setGlobalRunners] = useState<any[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<any[]>([]);
  const [activeMatch, setActiveMatch] = useState<any>(null);
  const [pendingSentRequest, setPendingSentRequest] = useState<string | null>(null);

  const [isOverlayCollapsed, setIsOverlayCollapsed] = useState(false);
  const overlayTranslateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(overlayTranslateY, {
      toValue: isOverlayCollapsed ? 190 : 0,
      useNativeDriver: true,
      bounciness: 4,
    }).start();
  }, [isOverlayCollapsed, overlayTranslateY]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (e, gestureState) => Math.abs(gestureState.dy) > 10,
      onPanResponderRelease: (e, gestureState) => {
        if (gestureState.dy > 30) {
          setIsOverlayCollapsed(true);
        } else if (gestureState.dy < -30) {
          setIsOverlayCollapsed(false);
        } else {
          setIsOverlayCollapsed(!isOverlayCollapsed);
        }
      }
    })
  ).current;

  const [viewingRun, setViewingRun] = useState<any>(null);
  const [currentRunId, setCurrentRunId] = useState<string>('');
  const [idleLocation, setIdleLocation] = useState<any>(null);
  const currentChunkIndexRef = useRef<number>(0);
  const currentChunkPointsRef = useRef<GPSPoint[]>([]);
  const cameraRef = useRef<MapboxGL.Camera>(null);
  const runStartTimeRef = useRef<number>(0);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const isTrackingRef = useRef<boolean>(true);

  // ---- Live Tracking state ----
  const [liveRunners, setLiveRunners] = useState<any[]>([]);
  const lastSyncIndexRef = useRef<number>(0);
  const lastProcessedIndexRef = useRef<number>(0);
  const syncBacklogRef = useRef<GPSPoint[]>([]);
  const pointsRef = useRef<GPSPoint[]>([]);

  // ---- Lap tracking state ----
  const [laps, setLaps] = useState<Lap[]>([]);
  const [lapToast, setLapToast] = useState<string | null>(null);
  const [raceMode, setRaceMode] = useState(false);
  const lapToastAnim = useRef(new Animated.Value(0)).current;
  const raceLapAnim = useRef(new Animated.Value(0)).current;
  const [raceFlashText, setRaceFlashText] = useState('');
  const raceStopAnim = useRef(new Animated.Value(0)).current;
  const cumulativeDistancesRef = useRef<number[]>([0]);
  const currentLapStartIndexRef = useRef<number>(0);
  const currentLapStartTimeRef = useRef<number>(0);
  const currentLapDistanceRef = useRef<number>(0);

  // Post-Run Summary State
  const [showRunSummary, setShowRunSummary] = useState(false);
  const [isAnimatingRoute, setIsAnimatingRoute] = useState(false);
  const animatedRouteCoords = useRef<Array<{longitude: number, latitude: number}>>([]);
  const [drawProgressIndex, setDrawProgressIndex] = useState(0);
  const [summaryStats, setSummaryStats] = useState<any>(null);
  const [completedRunData, setCompletedRunData] = useState<any>(null);
  const [isSavingRun, setIsSavingRun] = useState(false);
  const summaryViewShotRef = useRef<any>(null);

  useEffect(() => {
    if (hasCompletedRun && !showRunSummary) {
      const t = setTimeout(() => {
        setHasCompletedRun(false);
        setActiveClubId(null);
        setActiveEventId(null);
        setClubName(null);
        setPoints([]);
        setLiveDistance(0);
        setElapsedTime(0);
        setLaps([]);
        setLiveRunners([]);
      }, 5000);
      return () => clearTimeout(t);
    }
  }, [hasCompletedRun, showRunSummary]);

  // Helper to calculate bearing between two coordinates
  const getBearing = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const toRad = Math.PI / 180;
    const toDeg = 180 / Math.PI;
    const dLon = (lon2 - lon1) * toRad;
    const y = Math.sin(dLon) * Math.cos(lat2 * toRad);
    const x = Math.cos(lat1 * toRad) * Math.sin(lat2 * toRad) -
              Math.sin(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.cos(dLon);
    return (Math.atan2(y, x) * toDeg + 360) % 360;
  };

  // Route Drawing Animation Loop (Drone Chase Cam)
  useEffect(() => {
    if (isAnimatingRoute && points.length > 0) {
      animatedRouteCoords.current = [];
      setDrawProgressIndex(0);

      let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
      points.forEach(p => {
        if (p.latitude < minLat) minLat = p.latitude;
        if (p.latitude > maxLat) maxLat = p.latitude;
        if (p.longitude < minLon) minLon = p.longitude;
        if (p.longitude > maxLon) maxLon = p.longitude;
      });

      const totalPoints = points.length;
      const animationDurationMs = 2500;
      const frameDurationMs = 16;
      const totalFrames = animationDurationMs / frameDurationMs;
      const pointsPerFrame = Math.max(1, Math.floor(totalPoints / totalFrames));

      // Start the Cinematic Flyover
      if (cameraRef.current && totalPoints > 0) {
        // Initial setup: quickly zoom out to fit the bounding box
        cameraRef.current.setCamera({
          bounds: {
            ne: [maxLon, maxLat],
            sw: [minLon, minLat],
            paddingTop: 120,
            paddingRight: 60,
            paddingBottom: 350, // Huge bottom padding to avoid the summary modal!
            paddingLeft: 60
          },
          pitch: 50,
          bearing: 0,
          animationDuration: 0 // Snap to bounds immediately
        });

        // After snapping to bounds, execute a slow, graceful orbit while the route draws
        setTimeout(() => {
          if (cameraRef.current) {
            cameraRef.current.setCamera({
              bounds: {
                ne: [maxLon, maxLat],
                sw: [minLon, minLat],
                paddingTop: 80, // slightly zoom in
                paddingRight: 40,
                paddingBottom: 280, // Huge bottom padding here too
                paddingLeft: 40
              },
              pitch: 45,
              bearing: 25, // gracefully orbit the map by 25 degrees
              animationDuration: 2500 // smoothly plays out over the entire drawing time
            });
          }
        }, 50);
      }

      let currentIndex = 0;
      const interval = setInterval(() => {
        currentIndex += pointsPerFrame;

        if (currentIndex >= totalPoints) {
          currentIndex = totalPoints;
          clearInterval(interval);
          setTimeout(() => {
            setIsAnimatingRoute(false);
            setShowRunSummary(true);
          }, 600); // Brief pause at the end of drawing before UI appears
        }

        setDrawProgressIndex(currentIndex);
      }, frameDurationMs);

      return () => clearInterval(interval);
    }
  }, [isAnimatingRoute, points]);
  const lapsRef = useRef<Lap[]>([]);
  const [currentLapDistance, setCurrentLapDistance] = useState(0);
  const [currentLapNumber, setCurrentLapNumber] = useState(1);
  
  // Initial location fetch to center the map on open
  useEffect(() => {
    const fetchInitialLocation = async () => {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          console.log('Location permission denied on load');
          return;
        }
      }
      Geolocation.getCurrentPosition(
        (pos) => {
          const { latitude: lat, longitude: lon } = pos.coords;
          setIdleLocation({ latitude: lat, longitude: lon });
          if (cameraRef.current) {
            cameraRef.current.setCamera({
              centerCoordinate: [lon, lat],
              zoomLevel: 16,
              animationDuration: 1000
            });
          }
        },
        (error) => console.log(error),
        { enableHighAccuracy: true }
      );
    };
    fetchInitialLocation();
  }, []);

  // Timer effect
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRunning) {
      interval = setInterval(() => {
        const seconds = Math.floor((Date.now() - runStartTimeRef.current) / 1000);
        setElapsedTime(seconds);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRunning]);

  // Handle idle location tracking (blue dot replacement)
  useEffect(() => {
    let watchId: number | null = null;
    if (!isRunning) {
      watchId = Geolocation.watchPosition(
        (position) => {
          setIdleLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        (error) => console.log(error),
        { enableHighAccuracy: true, distanceFilter: 1, interval: 1000, fastestInterval: 500 }
      );
    }
    return () => {
      if (watchId !== null) Geolocation.clearWatch(watchId);
    };
  }, [isRunning]);

  // ---- Live Tracking: Uploads ----
  useEffect(() => {
    if (!isRunning) return;
    const trackingId = activeEventId || activeClubId;
    if (!trackingId && !isBroadcastingGlobal) return;
    const user = getAuth().currentUser;
    if (!user) return;

    const uploadLiveLocation = async () => {
      const db = getFirestore();
      const currentPts = pointsRef.current;
      const syncIdx = lastSyncIndexRef.current;
      
      let latestPoint: any = null;
      if (currentPts.length > syncIdx) {
        const newBatch = currentPts.slice(syncIdx);
        lastSyncIndexRef.current = currentPts.length;
        latestPoint = newBatch[newBatch.length - 1];
      } else if (currentPts.length > 0) {
        // Fallback if stationary (emulator)
        latestPoint = currentPts[currentPts.length - 1];
      }
      
      if (latestPoint) {
        try {
          const payload = {
            id: user.uid,
            name: user.displayName || 'Runner',
            phone: user.phoneNumber || '',
            currentLocation: { latitude: latestPoint.latitude, longitude: latestPoint.longitude },
            timestamp: Date.now(),
            active: true,
            recentPoints: currentPts.length > 0 
              ? currentPts.slice(Math.max(0, currentPts.length - 120)).map(p => ({ lon: p.longitude, lat: p.latitude }))
              : [{ lon: latestPoint.longitude, lat: latestPoint.latitude }]
          };
          
          if (activeEventId) {
            await db.collection('liveTracking').doc(activeEventId).collection('runners').doc(user.uid).set(payload, { merge: true });
          }
          if (isBroadcastingGlobal) {
            await db.collection('broadcastingPartners').doc(user.uid).set({
              ...payload,
              userId: user.uid,
              latitude: latestPoint.latitude,
              longitude: latestPoint.longitude
            }, { merge: true });
          }
        } catch (e) {
          console.error('Live upload error', e);
        }
      }
    };

    // Upload immediately and then every 15s
    uploadLiveLocation();
    const interval = setInterval(uploadLiveLocation, 15000);

    return () => clearInterval(interval);
  }, [isRunning, activeEventId, activeClubId, isBroadcastingGlobal]);

  // ---- AppState Cleanup: mark inactive on background, delete on unmount ----
  useEffect(() => {
    const user = getAuth().currentUser;
    if (!user) return;
    const db = getFirestore();

    const markInactive = async () => {
      try {
        const trackingId = activeEventId || activeClubId;
        if (trackingId) {
          await db.collection('liveTracking').doc(trackingId).collection('runners').doc(user.uid).set({ active: false }, { merge: true });
        }
        if (isBroadcastingGlobal) {
          await db.collection('broadcastingPartners').doc(user.uid).set({ active: false }, { merge: true });
        }
      } catch (e) {
        console.error('[Cleanup] markInactive error', e);
      }
    };

    const markActive = async () => {
      try {
        const trackingId = activeEventId || activeClubId;
        if (trackingId) {
          await db.collection('liveTracking').doc(trackingId).collection('runners').doc(user.uid).set({ active: true, timestamp: Date.now() }, { merge: true });
        }
        if (isBroadcastingGlobal) {
          await db.collection('broadcastingPartners').doc(user.uid).set({ active: true, timestamp: Date.now() }, { merge: true });
        }
      } catch (e) {
        console.error('[Cleanup] markActive error', e);
      }
    };

    const handleAppState = (nextState: string) => {
      if (nextState === 'background' || nextState === 'inactive') {
        if (isRunning) markInactive();
      } else if (nextState === 'active') {
        if (isRunning) markActive();
      }
    };

    const sub = AppState.addEventListener('change', handleAppState);

    return () => {
      sub.remove();
      // On unmount (navigating away), fully delete Firestore entries
      const trackingId = activeEventId || activeClubId;
      if (isRunning) {
        if (trackingId) {
          db.collection('liveTracking').doc(trackingId).collection('runners').doc(user.uid).delete().catch(console.error);
        }
        if (isBroadcastingGlobal) {
          db.collection('broadcastingPartners').doc(user.uid).delete().catch(console.error);
        }
      }
    };
  }, [isRunning, activeEventId, activeClubId, isBroadcastingGlobal]);

  // ---- Live Cheering Listener ----
  const [incomingCheer, setIncomingCheer] = useState<string | null>(null);
  const cheerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const user = getAuth().currentUser;
    if (!user) return;
    const db = getFirestore();
    const unsub = db.collection('cheers').doc(user.uid).onSnapshot(snap => {
      if (snap.exists) {
        const data = snap.data();
        if (data && Date.now() - data.timestamp < 30000) {
          Vibration.vibrate([0, 100, 100, 100]); // Buzz-buzz
          setIncomingCheer(data.fromName);
          cheerAnim.setValue(0);
          Animated.sequence([
            Animated.spring(cheerAnim, { toValue: 1, useNativeDriver: true, tension: 50 }),
            Animated.delay(3000),
            Animated.timing(cheerAnim, { toValue: 0, duration: 300, useNativeDriver: true })
          ]).start(() => setIncomingCheer(null));
        }
      }
    });
    return () => unsub();
  }, [cheerAnim]);

  const lastCheerRef = useRef<Record<string, number>>({});
  const handleCheer = async (targetUser: any) => {
    const user = getAuth().currentUser;
    if (!user) return;
    const targetId = targetUser.userId || targetUser.id; // handle both global and club runners
    
    const now = Date.now();
    if (lastCheerRef.current[targetId] && now - lastCheerRef.current[targetId] < 30000) {
      showAlert('Chill!', "You can only cheer someone every 30 seconds.");
      return;
    }
    lastCheerRef.current[targetId] = now;
    
    try {
      await getFirestore().collection('cheers').doc(targetId).set({
        from: user.uid,
        fromName: user.displayName || 'A runner',
        timestamp: Date.now()
      });
    } catch (e) {
      console.error(e);
    }
  };

  // ---- Live Tracking: Downloads ----
  useEffect(() => {
    const trackingId = activeEventId || activeClubId;
    if (!trackingId) {
      setLiveRunners([]);
      return;
    }
    const db = getFirestore();
    const user = getAuth().currentUser;
    const unsubscribe = db.collection('liveTracking')
      .doc(trackingId)
      .collection('runners')
      .where('active', '==', true)
      .onSnapshot(snap => {
        const runners: any[] = [];
        snap.forEach(d => {
          if (d.id !== user?.uid) {
            const data = d.data();
            // Show only runners active in the last 2 minutes
            if (Date.now() - data.timestamp < 2 * 60 * 1000) {
              runners.push(data);
            }
          }
        });
        setLiveRunners(runners);
      }, err => {
        console.error('Live download error', err);
      });
    return () => unsubscribe();
  }, [activeEventId, activeClubId]);

  // ---- Global Radar Downloads (nearest 100, 5-min staleness) ----
  useEffect(() => {
    if (!isRadarGlobalVisible) {
      setGlobalRunners([]);
      return;
    }
    const db = getFirestore();
    const user = getAuth().currentUser;
    let queryRef = db.collection('broadcastingPartners');

    const unsub = queryRef.onSnapshot((snap: any) => {
      const others: any[] = [];
      snap.forEach((d: any) => {
        if (d.id !== user?.uid) {
          const data = d.data();
          // Tightened: only show runners active in the last 5 minutes
          if (Date.now() - data.timestamp < 5 * 60 * 1000) {
            others.push(data);
          }
        }
      });

      // Sort by distance from user and cap at nearest 100
      const myLat = idleLocation?.latitude || pointsRef.current[pointsRef.current.length - 1]?.latitude;
      const myLon = idleLocation?.longitude || pointsRef.current[pointsRef.current.length - 1]?.longitude;
      let capped = others;
      if (myLat != null && myLon != null && others.length > 100) {
        capped = others
          .map(r => ({
            ...r,
            _dist: haversineDistance(myLat, myLon, r.currentLocation?.latitude || r.latitude, r.currentLocation?.longitude || r.longitude)
          }))
          .sort((a, b) => a._dist - b._dist)
          .slice(0, 100);
      }

      console.log('[Radar] Found', others.length, 'active, showing', capped.length);
      setGlobalRunners(capped);
    }, (err: any) => {
      console.error('[Radar] Download error:', err);
    });
    return () => unsub();
  }, [isRadarGlobalVisible, activeEventId, activeClubId]);

  // ---- Run Requests Listener ----
  useEffect(() => {
    const user = getAuth().currentUser;
    if (!user) return;
    const db = getFirestore();
    const unsubIn = db.collection('runPartnerRequests').where('to', '==', user.uid).onSnapshot((snap) => {
      const reqs: any[] = [];
      snap.forEach(d => reqs.push({ id: d.id, ...d.data() }));
      const match = reqs.find(r => r.status === 'accepted');
      if (match) setActiveMatch(match);
      else setIncomingRequests(reqs.filter(r => r.status === 'pending'));
    });
    const unsubOut = db.collection('runPartnerRequests').where('from', '==', user.uid).onSnapshot((snap) => {
      const reqs: any[] = [];
      snap.forEach(d => reqs.push({ id: d.id, ...d.data() }));
      const match = reqs.find(r => r.status === 'accepted');
      if (match) setActiveMatch(match);
    });
    return () => { unsubIn(); unsubOut(); };
  }, []);

  const handleSendGlobalRequest = async (targetUser: any) => {
    const user = getAuth().currentUser;
    if (!user) return;
    try {
      const db = getFirestore();
      const ref = doc(collection(db, 'runPartnerRequests'));
      await setDoc(ref, {
        from: user.uid,
        fromName: user.displayName || 'Runner',
        fromPhone: user.phoneNumber || '',
        to: targetUser.userId,
        toName: targetUser.name,
        toPhone: targetUser.phone || '',
        status: 'pending',
        timestamp: Date.now()
      });
      setPendingSentRequest(targetUser.userId);
      showAlert('Request Sent', `Asked ${targetUser.name} to run!`);
    } catch (e) {
      console.error(e);
    }
  };

  const handleAcceptRequest = (req: any) => {
    const user = getAuth().currentUser;
    if (!user) return;
    const sharePhone = user.phoneNumber || 'Not provided';
    showAlert(
      'Share Phone Number?', 
      `To coordinate with ${req.fromName}, we will share your phone number (${sharePhone}). Proceed?`,
      [
        { text: 'CANCEL', style: 'cancel' },
        { text: 'SHARE & ACCEPT', onPress: async () => {
          await getFirestore().collection('runPartnerRequests').doc(req.id).update({ status: 'accepted', toPhone: sharePhone });
        }}
      ]
    );
  };

  const handleDeclineRequest = async (req: any) => {
    await getFirestore().collection('runPartnerRequests').doc(req.id).delete();
  };

  // ---- Lap recording helper ----
  const recordLap = useCallback((trigger: 'auto' | 'manual', pointsSnap: GPSPoint[], cumDists: number[]) => {
    const lapStartIdx = currentLapStartIndexRef.current;
    const lapEndIdx = pointsSnap.length - 1;
    if (lapEndIdx <= lapStartIdx) return false;

    const lapDist = (cumDists[lapEndIdx] || 0) - (cumDists[lapStartIdx] || 0);
    const lapStartTime = currentLapStartTimeRef.current;
    const lapEndTime = pointsSnap[lapEndIdx].timestamp;
    const lapDuration = (lapEndTime - lapStartTime) / 1000;
    const lapDistKm = lapDist / 1000;
    const paceSecPerKm = lapDistKm > 0 ? lapDuration / lapDistKm : 0;
    const avgSpeed = lapDuration > 0 ? lapDistKm / (lapDuration / 3600) : 0;

    const newLapNumber = lapsRef.current.length + 1;
    const newLap: Lap = {
      lapNumber: newLapNumber,
      distanceMeters: lapDist,
      durationSeconds: lapDuration,
      paceSecondsPerKm: paceSecPerKm,
      avgSpeedKmh: avgSpeed,
      startIndex: lapStartIdx,
      endIndex: lapEndIdx,
      timestamp: lapEndTime,
      trigger,
      markerLatitude: pointsSnap[lapEndIdx].latitude,
      markerLongitude: pointsSnap[lapEndIdx].longitude,
    };

    lapsRef.current = [...lapsRef.current, newLap];
    setLaps([...lapsRef.current]);

    // Reset lap counters for next lap
    currentLapStartIndexRef.current = lapEndIdx;
    currentLapStartTimeRef.current = lapEndTime;
    currentLapDistanceRef.current = 0;
    setCurrentLapDistance(0);
    setCurrentLapNumber(newLapNumber + 1);

    // Haptic feedback
    Vibration.vibrate(200);

    // Show toast
    const pMin = Math.floor(paceSecPerKm / 60);
    const pSec = Math.floor(paceSecPerKm % 60).toString().padStart(2, '0');
    const toastText = `LAP ${newLapNumber} SAVED!! — ${pMin}:${pSec}/km`;
    setLapToast(toastText);
    lapToastAnim.setValue(0);
    Animated.sequence([
      Animated.timing(lapToastAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.delay(2500),
      Animated.timing(lapToastAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start(() => setLapToast(null));

    return newLapNumber;
  }, [lapToastAnim]);

  const handleLap = useCallback(() => {
    if (!isRunning) return;
    
    if (points.length < 2) {
      setRaceFlashText(`MOVE TO START LAPS`);
      raceLapAnim.setValue(1);
      Animated.timing(raceLapAnim, { toValue: 0, duration: 1500, useNativeDriver: true }).start();
      Vibration.vibrate([100, 100, 100]); // error vibration
      return;
    }

    const savedLap = recordLap('manual', points, cumulativeDistancesRef.current);
    
    if (savedLap) {
      // Trigger race mode flash
      setRaceFlashText(`LAP ${savedLap} SAVED`);
      raceLapAnim.setValue(1);
      Animated.timing(raceLapAnim, { toValue: 0, duration: 1500, useNativeDriver: true }).start();
    } else {
      setRaceFlashText(`DISTANCE TOO SHORT`);
      raceLapAnim.setValue(1);
      Animated.timing(raceLapAnim, { toValue: 0, duration: 1500, useNativeDriver: true }).start();
      Vibration.vibrate([100, 100, 100]); // error vibration
    }
  }, [isRunning, points, recordLap, raceLapAnim]);

  const lastTapRef = useRef<number>(0);
  const handleDoubleTap = useCallback(() => {
    const now = Date.now();
    const DOUBLE_PRESS_DELAY = 400; // 400ms window for double tap
    if (now - lastTapRef.current < DOUBLE_PRESS_DELAY) {
      handleLap();
      lastTapRef.current = 0; // reset to avoid triple-tap triggering twice
    } else {
      lastTapRef.current = now;
    }
  }, [handleLap]);

  // Listener effect
  useEffect(() => {
    const onLocation = (newPoint: GPSPoint) => {
      setPoints(prev => {
        let segDist = 0;
        if (prev.length > 0) {
          segDist = haversineDistance(
            prev[prev.length - 1].latitude, prev[prev.length - 1].longitude,
            newPoint.latitude, newPoint.longitude
          );
          setLiveDistance(d => d + segDist);
        }

        const next = [...prev, newPoint];
        pointsRef.current = next;

        // Update cumulative distances
        const prevCum = cumulativeDistancesRef.current;
        const lastCum = prevCum.length > 0 ? prevCum[prevCum.length - 1] : 0;
        cumulativeDistancesRef.current = [...prevCum, lastCum + segDist];

        // Update current lap distance
        currentLapDistanceRef.current += segDist;
        setCurrentLapDistance(currentLapDistanceRef.current);

        // Auto-lap detection removed as per user request

        // Auto-center map on new point if tracking is enabled
        if (cameraRef.current && isTrackingRef.current) {
          cameraRef.current.setCamera({
            centerCoordinate: [newPoint.longitude, newPoint.latitude],
            pitch: 60,
            heading: newPoint.heading || 0,
            zoomLevel: 18,
            animationDuration: 500,
            padding: { paddingBottom: 300 }
          });
        }
        return next;
      });
    };

    if (isRunning) {
      isTrackingRef.current = true; // start tracking automatically when run starts
      trackingService.addLocationListener(onLocation);
      pulseAnim.setValue(1);
    } else {
      trackingService.removeLocationListener(onLocation);
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.05, duration: 1000, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true })
        ])
      ).start();
    }

    return () => trackingService.removeLocationListener(onLocation);
  }, [isRunning, pulseAnim, recordLap]);

  const handleLocateMe = () => {
    isTrackingRef.current = true; // Resume auto-tracking on GPS updates
    
    if (isRunning && points.length > 0 && cameraRef.current) {
      // If running, snap to the latest point
      const latest = points[points.length - 1];
      cameraRef.current.setCamera({
        centerCoordinate: [latest.longitude, latest.latitude],
        zoomLevel: 18,
        animationDuration: 500,
        padding: { paddingBottom: 300 }
      });
    } else if (idleLocation && cameraRef.current) {
      // If idle, snap to idle location
      cameraRef.current.setCamera({
        centerCoordinate: [idleLocation.longitude, idleLocation.latitude],
        zoomLevel: 16,
        animationDuration: 500,
        padding: { paddingBottom: 300 }
      });
    }
  };

  const handleStart = async () => {
    const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
      showAlert("Permission Denied", "We need location access to start your run.");
      return;
    }

    const trackingId = activeEventId || activeClubId;
    if (trackingId) {
      // Club/Event run: Strictly isolated to the club. No global broadcasting.
      startRunLogic(false);
    } else {
      // Individual run: Ask if they want to join the Global Radar.
      showAlert(
        "Run Radar",
        "Would you like to share your live location with other runners nearby so you can connect?",
        [
          { text: "No", style: "cancel", onPress: () => startRunLogic(false) },
          { text: "Yes, Share Location", onPress: () => startRunLogic(true) }
        ]
      );
    }
  };

  const startRunLogic = async (isGlobal: boolean) => {
    setIsBroadcastingGlobal(isGlobal);
    const newRunId = Date.now().toString();
    const now = Date.now();
    runStartTimeRef.current = now;
    setCurrentRunId(newRunId);
    setPoints([]);
    pointsRef.current = [];
    lastSyncIndexRef.current = 0;
    setLiveDistance(0);
    setElapsedTime(0);
    setHasCompletedRun(false);
    lastProcessedIndexRef.current = 0;
    syncBacklogRef.current = [];
    // Reset lap state
    setLaps([]);
    lapsRef.current = [];
    cumulativeDistancesRef.current = [0];
    currentLapStartIndexRef.current = 0;
    currentLapStartTimeRef.current = now;
    currentLapDistanceRef.current = 0;
    setCurrentLapDistance(0);
    setCurrentLapNumber(1);
    setIsRunning(true);
    await trackingService.startRun(newRunId);
  };

  const handleStop = async () => {
    showAlert(
      "Finish Run?",
      "Are you sure you want to end this run?",
      [
        { text: "CANCEL", style: "cancel" },
        { text: "FINISH", style: "destructive", onPress: async () => {
          setIsSavingRun(true);
          const user = getAuth().currentUser;
          setIsRunning(false);
          await trackingService.stopRun();
          
          const dbPoints = await dbService.getPointsForRun(currentRunId);
          const finalPoints = dbPoints.length > 0 ? dbPoints : points;

            const trackingId = activeEventId || activeClubId;
            if (trackingId && user) {
              await getFirestore().collection('liveTracking').doc(trackingId).collection('runners').doc(user.uid).delete();
            }
            if (isBroadcastingGlobal && user) {
              await getFirestore().collection('broadcastingPartners').doc(user.uid).delete();
            }

          if (finalPoints.length === 0) {
            showAlert("No Data", "No GPS points were recorded.");
            await dbService.clearRun(currentRunId);
            setPoints([]);
            setLiveDistance(0);
            setElapsedTime(0);
            setHasCompletedRun(false);
            setCurrentRunId('');
            setIsSavingRun(false);
            return;
          }

          try {
            if (!user) return;

            const startTime = finalPoints[0].timestamp;
            const endTime = finalPoints[finalPoints.length - 1].timestamp;

            let totalDistance = 0;
            let elevationGain = 0;
            let maxSpeed = finalPoints[0].speed || 0;
            let totalAccuracy = finalPoints[0].accuracy || 0;

            for (let i = 1; i < finalPoints.length; i++) {
              totalDistance += haversineDistance(
                finalPoints[i-1].latitude, finalPoints[i-1].longitude,
                finalPoints[i].latitude, finalPoints[i].longitude
              );

              if (finalPoints[i].altitude && finalPoints[i-1].altitude) {
                const altDiff = finalPoints[i].altitude! - finalPoints[i-1].altitude!;
                if (altDiff > 0) elevationGain += altDiff;
              }

              if (finalPoints[i].speed && finalPoints[i].speed! > maxSpeed) {
                maxSpeed = finalPoints[i].speed!;
              }

              totalAccuracy += finalPoints[i].accuracy || 0;
            }

            const avgAccuracy = totalAccuracy / finalPoints.length;
            const maxSpeedKmh = maxSpeed * 3.6;
            
            const firestore = getFirestore();
            const runRef = firestore.collection('runs').doc();
            
            // Record a final lap for remaining distance
            const finalCumDists = cumulativeDistancesRef.current;
            if (finalPoints.length > currentLapStartIndexRef.current + 1) {
              recordLap('manual', finalPoints, finalCumDists);
            }
            const savedLaps = lapsRef.current.map(l => ({
              lapNumber: l.lapNumber,
              distanceMeters: l.distanceMeters,
              durationSeconds: l.durationSeconds,
              paceSecondsPerKm: l.paceSecondsPerKm,
              avgSpeedKmh: l.avgSpeedKmh,
              startIndex: l.startIndex,
              endIndex: l.endIndex,
              timestamp: l.timestamp,
              trigger: l.trigger,
              markerLatitude: l.markerLatitude,
              markerLongitude: l.markerLongitude,
            }));


            let resolvedUserName = user.displayName || 'Anonymous';
            try {
              const userDoc = await firestore.collection('users').doc(user.uid).get();
              if (userDoc.exists) {
                const data = userDoc.data();
                if (data && data.firstName) {
                  resolvedUserName = `${data.firstName} ${data.lastName || ''}`.trim();
                }
              }
            } catch (e) {
              console.log("Error fetching user profile for name", e);
            }

            const payload: any = {
              userId: user.uid,
              userName: resolvedUserName,
              startTime,
              endTime,
              durationSeconds: (endTime - startTime) / 1000,
              totalDistanceMeters: totalDistance,
              elevationGain: Math.round(elevationGain),
              maxSpeedKmh: parseFloat(maxSpeedKmh.toFixed(2)),
              avgAccuracy: parseFloat(avgAccuracy.toFixed(2)),
              laps: savedLaps,
              createdAt: Date.now(),
              title: clubName ? `Outrun x ${clubName}` : 'Outrun',
              ...(activeClubId ? { clubId: activeClubId } : {}),
              ...(activeEventId ? { eventId: activeEventId } : {})
            };

            await runRef.set(payload);

            const chunkSize = 400; 
            const batch = firestore.batch();
            for (let i = 0; i < finalPoints.length; i += chunkSize) {
              const chunk = finalPoints.slice(i, i + chunkSize);
              const chunkRef = firestore.collection(`runs/${runRef.id}/points`).doc();
              batch.set(chunkRef, { chunkIndex: Math.floor(i / chunkSize), data: chunk });
            }
            await batch.commit();

            const totalDurationSecs = (endTime - startTime) / 1000;
            const pace = totalDistance > 0 ? (totalDurationSecs / (totalDistance / 1000)) : 0;
            const paceMin = Math.floor(pace / 60);
            const paceSec = Math.floor(pace % 60).toString().padStart(2, '0');
            const paceStr = `${paceMin}:${paceSec}`;
            
            const calories = Math.round((totalDistance / 1000) * 60);

            setSummaryStats({
              distanceKm: (totalDistance/1000).toFixed(2),
              durationSecs: totalDurationSecs,
              avgPace: paceStr,
              maxSpeed: maxSpeedKmh.toFixed(1),
              calories: calories,
              elevation: Math.round(elevationGain),
              laps: savedLaps
            });
            setCompletedRunData({ id: runRef.id, ...payload });
            setIsSavingRun(false);
            setIsAnimatingRoute(true);

            await dbService.clearRun(currentRunId);
            setHasCompletedRun(true);
            setCurrentRunId('');
          } catch (e: any) {
            setIsSavingRun(false);
            console.error(e);
            showAlert("Upload Error", "Failed to save run. Data is preserved locally.");
          }
        }}
      ]
    );
  };

  const formatTime = (totalSeconds: number) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = Math.floor(totalSeconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Stats Calculations
  const distanceKm = (liveDistance / 1000).toFixed(2);
  const avgSpeedKmh = elapsedTime > 0 ? ((liveDistance / 1000) / (elapsedTime / 3600)).toFixed(1) : '0.0';
  const currentSpeedMs = points.length > 0 ? points[points.length - 1].speed || 0 : 0;
  const currentSpeedKmh = (currentSpeedMs * 3.6).toFixed(1);

  // Convert GPSPoints to MapView coords
  const mapCoords = points.map(p => ({ latitude: p.latitude, longitude: p.longitude }));

  let currentHeading = 0;
  if (mapCoords.length > 1) {
    const last = mapCoords[mapCoords.length - 1];
    const prev = mapCoords[mapCoords.length - 2];
    const dLon = (last.longitude - prev.longitude) * Math.PI / 180;
    const lat1 = prev.latitude * Math.PI / 180;
    const lat2 = last.latitude * Math.PI / 180;
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    currentHeading = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  return (
    <View style={s.container}>
      <ViewShot ref={summaryViewShotRef} options={{ format: 'jpg', quality: 0.9 }} style={{ flex: 1 }}>
      <MapboxGL.MapView
        style={s.map}
        styleURL={
          mapStyle === 'outrun' ? (theme === 'light' ? 'mapbox://styles/mapbox/light-v11' : 'mapbox://styles/mapbox/dark-v11') :
          mapStyle === 'satellite' ? 'mapbox://styles/mapbox/satellite-v9' :
          mapStyle === 'terrain' ? 'mapbox://styles/mapbox/outdoors-v12' :
          'mapbox://styles/mapbox/streets-v12'
        }
        compassEnabled={false}
        logoEnabled={false}
        attributionEnabled={false}
        scaleBarEnabled={false}
        onTouchStart={() => {
          if (!isRunning) {
            isTrackingRef.current = false;
          }
        }}
      >
        <MapboxGL.Camera
          ref={cameraRef}
          zoomLevel={16}
        />

        {(!isRunning && !hasCompletedRun || mapCoords.length === 0) && idleLocation && (
          <MapboxGL.PointAnnotation
            id="idlePoint"
            coordinate={[idleLocation.longitude, idleLocation.latitude]}
          >
            <PulsingDot />
          </MapboxGL.PointAnnotation>
        )}
        
        {(isRunning || hasCompletedRun) && mapCoords.length > 0 && (
          <>
            <MapboxGL.ShapeSource
              id="routeSource"
              shape={{
                type: 'Feature',
                properties: {},
                geometry: {
                  type: 'LineString',
                  coordinates: isAnimatingRoute 
                    ? mapCoords.slice(0, drawProgressIndex).map(c => [c.longitude, c.latitude])
                    : mapCoords.map(c => [c.longitude, c.latitude])
                }
              }}
            >
              <MapboxGL.LineLayer
                id="routeLine"
                style={{
                  lineColor: colors.brand,
                  lineWidth: 6,
                  lineJoin: 'round',
                  lineCap: 'round'
                }}
              />
            </MapboxGL.ShapeSource>
            
            <MapboxGL.PointAnnotation
              id="startPoint"
              coordinate={[mapCoords[0].longitude, mapCoords[0].latitude]}
            >
              <View style={s.dotStart} />
            </MapboxGL.PointAnnotation>
            
            {/* Numbered lap markers */}
            {laps.map(lap => (
              <MapboxGL.PointAnnotation
                key={`lap-${lap.lapNumber}`}
                id={`lap-${lap.lapNumber}`}
                coordinate={[lap.markerLongitude, lap.markerLatitude]}
              >
                <View style={s.lapMarker}>
                  <Text style={s.lapMarkerText}>{lap.lapNumber}</Text>
                </View>
              </MapboxGL.PointAnnotation>
            ))}
            
            {mapCoords.length > 0 && (
              <MapboxGL.PointAnnotation
                id="endPoint"
                coordinate={
                  isAnimatingRoute && drawProgressIndex < mapCoords.length
                    ? [mapCoords[drawProgressIndex].longitude, mapCoords[drawProgressIndex].latitude]
                    : [mapCoords[mapCoords.length - 1].longitude, mapCoords[mapCoords.length - 1].latitude]
                }
              >
                {isAnimatingRoute ? (
                  <View style={{
                    width: 20, height: 20, borderRadius: 10,
                    backgroundColor: '#FFF',
                    shadowColor: colors.brand,
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: 1,
                    shadowRadius: 10,
                    elevation: 10,
                    borderWidth: 4, borderColor: colors.brand
                  }} />
                ) : (
                  <View style={{
                    width: 32, height: 32, 
                    justifyContent: 'center', alignItems: 'center',
                    transform: [{ rotate: `${currentHeading}deg` }]
                  }}>
                    <Ionicons name="navigate" size={26} color={colors.brand} style={{
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.8,
                      shadowRadius: 4,
                    }} />
                  </View>
                )}
              </MapboxGL.PointAnnotation>
            )}
            
          </>
        )}

        {/* Live Runners (Club/Event) */}
        {liveRunners.map(runner => {
          const lastPt = runner.recentPoints && runner.recentPoints.length > 0
            ? runner.recentPoints[runner.recentPoints.length - 1]
            : null;
          const coord = lastPt 
            ? [lastPt.lon, lastPt.lat] 
            : (runner.currentLocation ? [runner.currentLocation.longitude, runner.currentLocation.latitude] : null);
          
          if (!coord) return null;
          return (
            <React.Fragment key={`runner-${runner.id}`}>
              {runner.recentPoints && runner.recentPoints.length > 1 && (
                <MapboxGL.ShapeSource
                  id={`route-club-${runner.id}`}
                  shape={{ type: 'Feature', geometry: { type: 'LineString', coordinates: runner.recentPoints.map((p: any) => [p.lon, p.lat]) }, properties: {} }}
                  lineMetrics={true}
                >
                  <MapboxGL.LineLayer
                    id={`route-club-line-${runner.id}`}
                    style={{ 
                      lineColor: colors.brand,
                      lineGradient: [
                        'interpolate',
                        ['linear'],
                        ['line-progress'],
                        0, 'rgba(51, 98, 122, 0)',
                        1, 'rgba(51, 98, 122, 1)'
                      ],
                      lineWidth: 4, 
                      lineJoin: 'round', 
                      lineCap: 'round', 
                      lineOpacity: 0.8 
                    }}
                  />
                </MapboxGL.ShapeSource>
              )}
              <MapboxGL.PointAnnotation
                id={`runner-${runner.id}`}
                coordinate={coord}
              >
                <TouchableOpacity style={{ alignItems: 'center' }} activeOpacity={0.8} onPress={() => handleCheer(runner)}>
                  <PulsingDot color={colors.brandTertiary} />
                  <View style={{ backgroundColor: colors.background, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginTop: -8, borderWidth: 1, borderColor: colors.brandTertiary }}>
                    <Text style={{ color: colors.text, fontSize: 12, fontWeight: '900', letterSpacing: 1 }}>{runner.name.split(' ')[0].toUpperCase()}</Text>
                  </View>
                </TouchableOpacity>
              </MapboxGL.PointAnnotation>
            </React.Fragment>
          );
        })}

        {/* Global Radar Runners & Routes — always visible regardless of run state */}
        {isRadarGlobalVisible && globalRunners.map(b => {
          const lastPt = b.recentPoints && b.recentPoints.length > 0
            ? b.recentPoints[b.recentPoints.length - 1]
            : null;
          const coord = lastPt ? [lastPt.lon, lastPt.lat] : [b.longitude, b.latitude];
          return (
            <React.Fragment key={`global-${b.userId}`}>
              {b.recentPoints && b.recentPoints.length > 1 && (
                <MapboxGL.ShapeSource
                  id={`route-${b.userId}`}
                  shape={{ type: 'Feature', geometry: { type: 'LineString', coordinates: b.recentPoints.map((p: any) => [p.lon, p.lat]) }, properties: {} }}
                  lineMetrics={true}
                >
                  <MapboxGL.LineLayer
                    id={`route-line-${b.userId}`}
                    style={{ 
                      lineColor: colors.brand,
                      lineGradient: [
                        'interpolate',
                        ['linear'],
                        ['line-progress'],
                        0, 'rgba(194, 96, 30, 0)',
                        1, 'rgba(194, 96, 30, 1)'
                      ],
                      lineWidth: 4, 
                      lineJoin: 'round', 
                      lineCap: 'round', 
                      lineOpacity: 0.8 
                    }}
                  />
                </MapboxGL.ShapeSource>
              )}
              <MapboxGL.PointAnnotation
                id={`dot-${b.userId}`}
                coordinate={coord}
              >
                <TouchableOpacity activeOpacity={0.8} onPress={() => handleCheer(b)} onLongPress={() => handleSendGlobalRequest(b)}>
                  <PulsingDot color={colors.brand} />
                </TouchableOpacity>
              </MapboxGL.PointAnnotation>
            </React.Fragment>
          );
        })}

      </MapboxGL.MapView>

      {/* Dark mode blackish map tint */}
      {theme === 'dark' && mapStyle === 'outrun' && (
        <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.5)' }]} />
      )}

      {showRunSummary && summaryStats && (
        <View style={StyleSheet.absoluteFill}>
          <View style={{ flex: 1, backgroundColor: 'transparent' }} />
          <View style={{ backgroundColor: colors.background, padding: 24, paddingBottom: 48, borderTopLeftRadius: 32, borderTopRightRadius: 32 }}>
             <Text style={{color: colors.text, fontSize: 32, fontWeight: '800', marginBottom: 20}}>RUN COMPLETED</Text>
             <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20}}>
               <View style={{flex: 1}}>
                 <Text style={{color: colors.textSecondary, fontSize: 12}}>DISTANCE</Text>
                 <Text style={{color: colors.brand, fontSize: 24, fontWeight: '700'}}>{summaryStats.distanceKm} km</Text>
               </View>
               <View style={{flex: 1, alignItems: 'center'}}>
                 <Text style={{color: colors.textSecondary, fontSize: 12}}>DURATION</Text>
                 <Text style={{color: colors.text, fontSize: 24, fontWeight: '700'}}>{formatTime(summaryStats.durationSecs)}</Text>
               </View>
               <View style={{flex: 1, alignItems: 'flex-end'}}>
                 <Text style={{color: colors.textSecondary, fontSize: 12}}>PACE</Text>
                 <Text style={{color: colors.text, fontSize: 24, fontWeight: '700'}}>{summaryStats.avgPace} /km</Text>
               </View>
             </View>
             <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: 32}}>
               <View style={{flex: 1}}>
                 <Text style={{color: colors.textSecondary, fontSize: 12}}>MAX SPEED</Text>
                 <Text style={{color: colors.text, fontSize: 20, fontWeight: '700'}}>{summaryStats.maxSpeed} km/h</Text>
               </View>
               <View style={{flex: 1, alignItems: 'center'}}>
                 <Text style={{color: colors.textSecondary, fontSize: 12}}>CALORIES</Text>
                 <Text style={{color: colors.text, fontSize: 20, fontWeight: '700'}}>{summaryStats.calories}</Text>
               </View>
               <View style={{flex: 1, alignItems: 'flex-end'}}>
                 <Text style={{color: colors.textSecondary, fontSize: 12}}>ELEVATION</Text>
                 <Text style={{color: colors.text, fontSize: 20, fontWeight: '700'}}>{summaryStats.elevation} m</Text>
               </View>
             </View>
             
             <View style={{flexDirection: 'row', gap: 12}}>
               <View style={{ flex: 1 }}>
                 <Button title="SHARE" variant="ghost" onPress={() => {
                    setShowRunSummary(false);
                    setViewingRun(completedRunData);
                 }} style={{ width: '100%' }} />
               </View>
               <View style={{ flex: 1 }}>
                 <Button title="DONE" variant="primary" onPress={() => {
                    setShowRunSummary(false);
                    setHasCompletedRun(false);
                    setActiveClubId(null);
                    setActiveEventId(null);
                    setClubName(null);
                    setPoints([]);
                    setLiveDistance(0);
                    setElapsedTime(0);
                    setLaps([]);
                    setLiveRunners([]);
                 }} style={{ width: '100%' }} />
               </View>
             </View>
          </View>
        </View>
      )}
      </ViewShot>

      {/* Match Overlay */}
      {activeMatch && (
        <Modal visible={true} animationType="slide" transparent>
          <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
            <Text style={{ color: colors.brandTertiary, fontSize: 40, fontWeight: '900', fontStyle: 'italic', marginBottom: 10 }}>IT'S A MATCH!</Text>
            <Text style={{ color: colors.text, fontSize: 18, textAlign: 'center', marginBottom: 40 }}>
              You are going running with {activeMatch.from === getAuth().currentUser?.uid ? activeMatch.toName : activeMatch.fromName}!
            </Text>
            <View style={{ backgroundColor: colors.background, padding: 20, borderRadius: 16, width: '100%', alignItems: 'center', borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700', letterSpacing: 2, marginBottom: 8 }}>THEIR PHONE NUMBER</Text>
              <Text style={{ color: colors.text, fontSize: 32, fontWeight: '800', letterSpacing: 1 }}>
                {activeMatch.from === getAuth().currentUser?.uid ? activeMatch.toPhone : activeMatch.fromPhone || 'No number'}
              </Text>
            </View>
            <Text style={{ color: colors.textSecondary, fontSize: 14, textAlign: 'center', marginTop: 20, paddingHorizontal: 20 }}>
              Text them to coordinate a meeting spot and time.
            </Text>
            <Button title="Close" onPress={() => setActiveMatch(null)} style={{ marginTop: 40, width: '80%' }} />
          </View>
        </Modal>
      )}

      {/* Incoming Requests Float */}
      {incomingRequests.length > 0 && !activeMatch && (
        <View style={{ position: 'absolute', bottom: isOverlayCollapsed ? 100 : 300, width: '100%', paddingHorizontal: 20, zIndex: 100 }}>
          {incomingRequests.map(req => (
            <View key={req.id} style={{ backgroundColor: colors.background, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: colors.brand, marginBottom: 10, shadowColor: '#000', shadowOffset: {width:0, height:4}, shadowOpacity: 0.5, shadowRadius: 8 }}>
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: 12 }}>{req.fromName} wants to run!</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Button variant="primary" title="ACCEPT" onPress={() => handleAcceptRequest(req)} style={{ width: '100%', height: 40 }} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button variant="ghost" title="DECLINE" onPress={() => handleDeclineRequest(req)} style={{ width: '100%', height: 40 }} />
                </View>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Active Runners Badge */}
      {(!showRunSummary && !isAnimatingRoute) && (() => {
        const activeArray = isClubOrEvent ? liveRunners : globalRunners;
        const count = activeArray.length;
        const color = isClubOrEvent ? colors.brandTertiary : colors.brand;
        
        return (
          <View style={{ position: 'absolute', top: Math.max(insets.top + 10, 60), left: 20, zIndex: 20, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: count > 0 ? color : colors.border }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: count > 0 ? color : colors.textSecondary, marginRight: 8 }} />
            <Text style={{ color: count > 0 ? color : colors.textSecondary, fontSize: 12, fontWeight: '700', letterSpacing: 0.5 }}>
              {count > 0 ? `${count} ${isClubOrEvent ? 'CLUB ' : ''}RUNNER${count > 1 ? 'S' : ''} LIVE` : 'NO RUNNERS LIVE'}
            </Text>
          </View>
        );
      })()}

      {/* Switch to Individual Run */}
      {(!showRunSummary && !isAnimatingRoute) && !isRunning && isClubOrEvent && (
        <TouchableOpacity 
          style={{ position: 'absolute', top: Math.max(insets.top + 54, 104), left: 20, zIndex: 20, backgroundColor: colors.background, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.border }}
          onPress={() => {
            setActiveClubId(null);
            setActiveEventId(null);
          }}
        >
          <Text style={{ color: colors.text, fontSize: 11, fontWeight: '700' }}>EXIT CLUB RUN</Text>
        </TouchableOpacity>
      )}

      {(!showRunSummary && !isAnimatingRoute) && (
        <View style={[s.controlsStack, { top: Math.max(insets.top + 10, 60) }]}>
        <View style={{ alignItems: 'center' }}>
          <TouchableOpacity style={s.iconGhost} onPress={() => setStyleModalVisible(true)}>
            <Ionicons name="layers-outline" size={20} color={colors.brand} />
          </TouchableOpacity>
          <Text style={s.iconLabel}>Map</Text>
        </View>

        {!isRunning && (
          <>
            <View style={{ alignItems: 'center' }}>
              <TouchableOpacity style={s.iconGhost} onPress={handleLocateMe}>
                <Ionicons name="locate-outline" size={20} color={colors.brand} />
              </TouchableOpacity>
              <Text style={s.iconLabel}>Locate</Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              <TouchableOpacity style={s.iconGhost} onPress={() => setMyRunsVisible(true)}>
                <Ionicons name="walk" size={20} color={colors.brand} />
              </TouchableOpacity>
              <Text style={s.iconLabel}>Runs</Text>
            </View>
          </>
        )}
      </View>
      )}

      {(!showRunSummary && !isAnimatingRoute) && lapToast && (
        <Animated.View style={[s.lapToast, {
          top: Math.max(insets.top + 10, 60),
          opacity: lapToastAnim,
          transform: [{ translateY: lapToastAnim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }],
        }]}>
          <Ionicons name="flag" size={14} color={colors.brand} />
          <Text style={s.lapToastText}>{lapToast}</Text>
        </Animated.View>
      )}

      {/* Cheer toast notification */}
      {(!showRunSummary && !isAnimatingRoute) && incomingCheer && (
        <Animated.View style={[s.cheerToast, {
          top: Math.max(insets.top + 70, 120),
          opacity: cheerAnim,
          transform: [{ translateY: cheerAnim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }],
        }]}>
          <Text style={{fontSize: 18, marginRight: 6}}>⚡</Text>
          <Text style={s.cheerToastText}>{incomingCheer} cheered you on!</Text>
        </Animated.View>
      )}

      {(!showRunSummary && !isAnimatingRoute) && (
        <Animated.View style={[s.overlay, { transform: [{ translateY: overlayTranslateY }] }]}>
          <View {...panResponder.panHandlers} style={{ width: '100%', alignItems: 'center', paddingBottom: 16, paddingTop: 14 }}>
            <View style={s.handle} />
          </View>

          <Text style={s.timer}>{formatTime(elapsedTime)}</Text>

          <View style={s.statsRow}>
            <View style={s.statBox}>
              <Text style={s.statValue}>{distanceKm}</Text>
              <Text style={s.statLabel}>km</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statBox}>
              <Text style={s.statValue}>{currentSpeedKmh}</Text>
              <Text style={s.statLabel}>km/h now</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statBox}>
              <Text style={s.statValue}>{avgSpeedKmh}</Text>
              <Text style={s.statLabel}>km/h avg</Text>
            </View>
          </View>

          {/* Lap info row — only when running */}
          {isRunning && (
            <View style={s.lapInfoRow}>
              <View style={s.lapBadge}>
                <Ionicons name="flag" size={10} color={colors.brand} />
                <Text style={s.lapBadgeText}>lap {currentLapNumber}</Text>
              </View>
              <Text style={s.lapDistText}>{(currentLapDistance / 1000).toFixed(2)} km</Text>
            </View>
          )}

          {isRunning && (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700', marginRight: 12, letterSpacing: 1 }}>RACE MODE</Text>
              <OutrunSwitch 
                value={raceMode} 
                onValueChange={setRaceMode} 
              />
            </View>
          )}

          {/* Action buttons */}
          <View style={s.actionRow}>
            {isRunning && (
              <TouchableOpacity style={s.lapBtn} onPress={handleLap}>
                <Ionicons name="flag-outline" size={20} color={colors.brand} />
              </TouchableOpacity>
            )}
            <View style={{ flex: 1 }}>
              <StartRunButton 
                title={hasCompletedRun ? 'RUN COMPLETED' : isRunning ? 'SWIPE TO STOP' : (isClubOrEvent && clubName) ? 'SWIPE TO START CLUB RUN' : 'SWIPE TO START'}
                onPress={hasCompletedRun || isSavingRun ? () => {} : isRunning ? handleStop : handleStart}
                disabled={hasCompletedRun}
                loading={isSavingRun}
                isRunning={isRunning}
              />
            </View>
          </View>
        </Animated.View>
      )}

      <MapStyleModal 
        visible={isStyleModalVisible} 
        onClose={() => setStyleModalVisible(false)} 
        currentStyle={mapStyle} 
        onSelectStyle={setMapStyle} 
      />
      
      <MyRunsModal visible={myRunsVisible} onClose={() => setMyRunsVisible(false)} onSelectRun={setViewingRun} />
      
      <RunDetailsModal 
        visible={!!viewingRun} 
        run={viewingRun} 
        onClose={() => setViewingRun(null)} 
      />

      {raceMode && (
        <View style={[s.raceModeOverlay, { justifyContent: 'center', alignItems: 'center' }]}>
          {/* Header */}
          <View style={{ position: 'absolute', top: Math.max(insets.top + 10, 60), width: '100%', alignItems: 'center', zIndex: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ color: colors.brand, fontSize: 14, fontWeight: '800', letterSpacing: 4, marginRight: 12 }}>RACE MODE</Text>
              <OutrunSwitch 
                value={raceMode} 
                onValueChange={setRaceMode} 
              />
            </View>
          </View>
          
          {/* Central Pulsing Lap Button */}
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <TouchableOpacity 
              activeOpacity={0.7}
              onPress={handleLap}
              style={{
                width: 200,
                height: 200,
                borderRadius: 100,
                backgroundColor: colors.surfaceLight,
                borderWidth: 2,
                borderColor: colors.brand,
                justifyContent: 'center',
                alignItems: 'center',
                shadowColor: colors.brand,
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.5,
                shadowRadius: 20,
              }}
            >
              <Text style={{ color: colors.brand, fontSize: 32, fontWeight: '900', letterSpacing: 4 }}>LAP</Text>
              <Text style={{ color: colors.brand, fontSize: 10, marginTop: 8, letterSpacing: 1, opacity: 0.8 }}>TAP TO RECORD</Text>
            </TouchableOpacity>
          </Animated.View>

          {/* Lap Flash Animation */}
          <Animated.View style={{ position: 'absolute', top: '25%', alignSelf: 'center', opacity: raceLapAnim, transform: [{ scale: raceLapAnim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.3] }) }], pointerEvents: 'none' }}>
            <Text style={{ color: colors.text, fontSize: 24, fontWeight: '800', letterSpacing: 2, textShadowColor: '#000', textShadowOffset: {width:0, height:4}, textShadowRadius: 10 }}>{raceFlashText}</Text>
          </Animated.View>

          {/* Stop Progress Bar */}
          <Pressable 
            style={{ position: 'absolute', bottom: 30, width: '100%', alignItems: 'center', padding: 20 }}
            onPressIn={() => {
              raceStopAnim.setValue(0);
              Animated.timing(raceStopAnim, { toValue: 1, duration: 3000, useNativeDriver: false }).start();
            }}
            onPressOut={() => {
              Animated.timing(raceStopAnim).stop();
              raceStopAnim.setValue(0);
            }}
            onLongPress={() => {
              Animated.timing(raceStopAnim).stop();
              raceStopAnim.setValue(0);
              handleStop();
              setRaceMode(false);
            }}
            delayLongPress={3000}
          >
            <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700', letterSpacing: 2, marginBottom: 16 }}>HOLD HERE TO STOP</Text>
            <View style={{ width: '75%', height: 8, backgroundColor: colors.border, borderRadius: 4, overflow: 'hidden' }}>
              <Animated.View style={{ height: '100%', backgroundColor: colors.error, width: raceStopAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }} />
            </View>
          </Pressable>
        </View>
      )}
    </View>
  );
};

const getStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  map: {
    flex: 1,
  },
  controlsStack: {
    position: 'absolute',
    top: 60,
    right: 20,
    zIndex: 10,
    alignItems: 'flex-end',
    gap: 12,
  },
  // Ghost/outline icon buttons — no fill, thin border, flat (no drop shadow)
  iconGhost: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconLabel: {
    color: colors.text,
    fontSize: 9,
    fontWeight: '800',
    marginTop: 4,
    textTransform: 'uppercase',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  myRunsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  myRunsText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'lowercase',
  },
  overlay: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    paddingHorizontal: 28,
    paddingBottom: 28,
    alignItems: 'center',
    backgroundColor: colors.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  handle: {
    width: 48,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.textMuted,
  },
  timer: {
    color: colors.text,
    fontSize: 60,
    fontWeight: '200',
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
    marginBottom: 24,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginBottom: 28,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: colors.border,
  },
  statValue: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '400',
    letterSpacing: 0.3,
    marginTop: 4,
    textTransform: 'lowercase',
  },
  btnStart: {
    borderRadius: 100,
    backgroundColor: colors.brandDarker,
  },
  btnStop: {
    borderRadius: 100,
  },
  btnText: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'lowercase',
  },
  dotStart: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.text,
    borderWidth: 2,
    borderColor: colors.brand,
  },
  // Lap markers on map
  lapMarker: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.background,
    borderWidth: 1.5,
    borderColor: colors.brand,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lapMarkerText: {
    color: colors.brand,
    fontSize: 10,
    fontWeight: '700',
  },
  // Lap toast notification
  lapToast: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    zIndex: 10000,
  },
  lapToastText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '500',
    marginLeft: 8,
    letterSpacing: 0.3,
  },
  // Cheer toast notification
  cheerToast: {
    position: 'absolute',
    top: 120,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFEB3B',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    zIndex: 20,
    shadowColor: '#FFC107',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
  },
  cheerToastText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  // Lap info row in overlay
  lapInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    gap: 10,
  },
  lapBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    gap: 4,
  },
  lapBadgeText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '500',
    textTransform: 'lowercase',
  },
  lapDistText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '400',
    fontVariant: ['tabular-nums'],
  },
  // Action row with lap button + start/stop
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    gap: 12,
  },
  lapBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  raceModeOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.background,
    zIndex: 9999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  raceModeTitle: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 4,
  },
  raceModeInstruction: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '900',
    marginTop: 16,
    letterSpacing: 2,
  },
  raceModeSub: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 40,
    fontWeight: '500',
    letterSpacing: 1,
  }
});

export default NewOutrunScreen;