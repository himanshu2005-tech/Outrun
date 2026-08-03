import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, Image, TouchableOpacity, ScrollView,
  Animated, Easing, Modal, ActivityIndicator, Dimensions,
  Vibration, Platform, LayoutAnimation
} from 'react-native';
import { getAuth, signOut } from '@react-native-firebase/auth';
import {
  getFirestore, doc, onSnapshot, updateDoc, arrayUnion, arrayRemove,
  collection, query, where, getDocs, orderBy
} from '@react-native-firebase/firestore';
import MapboxGL from '@rnmapbox/maps';

// --- ACTIVITY GRAPH (7-DAY BARS) ---
const AudioVisualizerGraph = ({ data }: { data: any[] }) => {
  const { colors } = useTheme();
  const s = React.useMemo(() => getStyles(colors), [colors]);

  const width = Dimensions.get('window').width - 88;
  const height = 96;
  const barWidth = 10;

  const points = data.map(d => d.dist / 1000);
  const maxVal = Math.max(...points, 5);

  return (
    <View style={{ width: '100%', alignItems: 'center' }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', width }}>
        {data.map((d, i) => {
          const val = d.dist / 1000;
          const fillHeight = (val / maxVal) * height;
          const isToday = i === data.length - 1;

          return (
            <View key={i} style={{ alignItems: 'center' }}>
              <View style={{ height, justifyContent: 'flex-end' }}>
                <View style={{
                  width: barWidth,
                  height: Math.max(fillHeight, 3),
                  backgroundColor: isToday ? colors.text : colors.border,
                  borderRadius: barWidth / 2,
                }} />
              </View>
              <View style={{ height: 34, alignItems: 'center' }}>
                <Text style={{
                  color: isToday ? colors.text : colors.textSecondary,
                  fontSize: 10,
                  fontWeight: isToday ? '700' : '500',
                  marginTop: 10,
                }}>
                  {d.day}
                </Text>
                {val > 0 && (
                  <Text style={{
                    color: colors.textSecondary,
                    fontSize: 9,
                    fontWeight: '600',
                    marginTop: 3,
                  }}>
                    {val.toFixed(1)}
                  </Text>
                )}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
};

import { getStorage, ref, putFile, getDownloadURL } from '@react-native-firebase/storage';
import { launchImageLibrary } from 'react-native-image-picker';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Button from '../components/Button';
import { showAlert } from '../components/CustomAlert';
import { useTheme } from '../theme/ThemeContext';
import { GPSPoint } from '../utils/geoUtils';
import EditProfileModal from '../components/EditProfileModal';
import RulerPicker from '../components/RulerPicker';
import { OutrunModal } from '../components/OutrunModal';
import { FollowRequestsModal } from '../components/FollowRequestsModal';
import { UserListModal } from '../components/UserListModal';

const { width: SCREEN_W } = Dimensions.get('window');

const ProfileScreen = ({ route, navigation }: any = {}) => {
  const { colors, theme } = useTheme();
  const s = React.useMemo(() => getStyles(colors), [colors]);
  const currentUserId = getAuth().currentUser?.uid;
  const targetUserId = route?.params?.userId || currentUserId;
  const isOwnProfile = targetUserId === currentUserId;

  const [userData, setUserData] = useState<any>(null);
  const hasHyped = currentUserId ? userData?.hypedBy?.includes(currentUserId) : false;
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [activeMetricModal, setActiveMetricModal] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'PERFORMANCE' | 'ATHLETICS'>('PERFORMANCE');
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const [goalModalVisible, setGoalModalVisible] = useState(false);
  const [goalInput, setGoalInput] = useState(5);
  
  const [listModalVisible, setListModalVisible] = useState(false);
  const [listModalType, setListModalType] = useState<'followers' | 'following'>('followers');
  const [requestsModalVisible, setRequestsModalVisible] = useState(false);

  const handleFollow = async () => {
    if (!currentUserId || !targetUserId) return;
    if (userData?.isPrivate) {
      await updateDoc(doc(getFirestore(), 'users', targetUserId), {
        followRequests: arrayUnion(currentUserId)
      });
    } else {
      await updateDoc(doc(getFirestore(), 'users', targetUserId), {
        followers: arrayUnion(currentUserId)
      });
      await updateDoc(doc(getFirestore(), 'users', currentUserId), {
        following: arrayUnion(targetUserId)
      });
    }
  };

  const handleUnfollow = async () => {
    if (!currentUserId || !targetUserId) return;
    await updateDoc(doc(getFirestore(), 'users', targetUserId), {
      followers: arrayRemove(currentUserId)
    });
    await updateDoc(doc(getFirestore(), 'users', currentUserId), {
      following: arrayRemove(targetUserId)
    });
  };

  const handleCancelRequest = async () => {
    if (!currentUserId || !targetUserId) return;
    await updateDoc(doc(getFirestore(), 'users', targetUserId), {
      followRequests: arrayRemove(currentUserId)
    });
  };
  useEffect(() => {
    if (userData?.dailyGoalKm) setGoalInput(userData.dailyGoalKm);
  }, [userData]);

  // Support triggering edit modal from SettingsScreen
  useEffect(() => {
    if (route.params?.triggerEdit) {
      setEditModalVisible(true);
      navigation.setParams({ triggerEdit: undefined });
    }
  }, [route.params?.triggerEdit]);

  // Run metrics
  const [allRuns, setAllRuns] = useState<any[]>([]);
  const [stats, setStats] = useState({
    totalRuns: 0, totalKm: 0, totalTime: 0, avgPace: 0,
    bestPace: 0, longestRun: 0, totalCalories: 0, currentStreak: 0,
    totalElevation: 0, peakSpeed: 0, avgAccuracy: 0, monthlyKm: 0, todayKm: 0,
  });
  const [athleticStats, setAthleticStats] = useState({
    vo2Max: 0,
    vam: 0,
    tss7Day: 0,
    acwr: 0,
    hasVO2Data: false,
    hasVAMData: false,
    hasACWRData: false,
    historyDays: 0,
  });
  const [chartData, setChartData] = useState<any[]>([]);

  // World Map modal
  const [mapVisible, setMapVisible] = useState(false);
  const [routesGeoJSON, setRoutesGeoJSON] = useState<any>(null);
  const [loadingRoutes, setLoadingRoutes] = useState(false);
  const cameraRef = useRef<MapboxGL.Camera>(null);

  // Animations
  const fadeIn = useRef(new Animated.Value(0)).current;
  const slideUp = useRef(new Animated.Value(40)).current;
  const chartAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const borderHeight = useRef(new Animated.Value(0)).current;
  const borderOpacity = useRef(new Animated.Value(1)).current;

  /* ─── DATA LOADING ─── */
  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideUp, { toValue: 0, useNativeDriver: true, speed: 12 }),
      Animated.timing(fadeIn, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]).start();

    if (!targetUserId) return;

    const userSub = onSnapshot(
      doc(getFirestore(), 'users', targetUserId),
      (snap) => { if (snap.exists()) setUserData(snap.data()); },
    );

    const runsSub = onSnapshot(
      query(collection(getFirestore(), 'runs'), where('userId', '==', targetUserId)),
      (snapshot) => {
        const runs: any[] = [];
        snapshot.forEach(d => runs.push({ id: d.id, ...d.data() }));
        runs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        setAllRuns(runs);
      },
    );

    return () => { 
      if (userSub) userSub(); 
      if (runsSub) runsSub(); 
    };
  }, [targetUserId]);

  const processStats = useCallback((runs: any[], user: any) => {
    let totalDist = 0, totalTime = 0, bestPace = Infinity, longestRun = 0;
    let totalElevation = 0, peakSpeed = 0, totalAccuracySum = 0;
    let runsWithAccuracy = 0;

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    // 7-day chart buckets
    const buckets = Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(now);
      d.setDate(d.getDate() - (6 - i));
      return {
        date: d,
        day: d.toLocaleDateString(undefined, { weekday: 'narrow' }),
        dateStr: `${d.getDate()}/${d.getMonth() + 1}`,
        dist: 0,
        time: 0,
        elevation: 0,
        peakSpeed: 0,
        accuracySum: 0,
        runsCount: 0,
        calories: 0,
      };
    });

    // Streak & Daily Goals
    const daySet = new Set<string>();
    const dayDistanceMap = new Map<string, number>();

    let monthlyKm = 0;
    let todayKm = 0;
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    runs.forEach(r => {
      const dist = r.totalDistanceMeters || 0;
      const dur = r.durationSeconds || 0;
      totalDist += dist;
      totalTime += dur;

      const checkDate = new Date(r.createdAt);
      if (checkDate.getMonth() === currentMonth && checkDate.getFullYear() === currentYear) {
         monthlyKm += dist / 1000;
      }

      const km = dist / 1000;
      if (km > longestRun) longestRun = km;
      if (km > 0.1) {
        const pace = dur / km;
        if (pace < bestPace) bestPace = pace;
      }

      const runDate = new Date(r.createdAt);
      runDate.setHours(0, 0, 0, 0);
      const dateStr = runDate.toDateString();
      daySet.add(dateStr);
      dayDistanceMap.set(dateStr, (dayDistanceMap.get(dateStr) || 0) + km);

      if (dateStr === now.toDateString()) {
        todayKm += km;
      }

      const diffDays = Math.round((now.getTime() - runDate.getTime()) / (1000 * 3600 * 24));
      if (diffDays >= 0 && diffDays < 7) {
        buckets[6 - diffDays].dist += dist;
        buckets[6 - diffDays].time += dur;
        if (r.elevationGain) buckets[6 - diffDays].elevation += r.elevationGain;
        if (r.maxSpeedKmh && r.maxSpeedKmh > buckets[6 - diffDays].peakSpeed) buckets[6 - diffDays].peakSpeed = r.maxSpeedKmh;
        if (r.avgAccuracy) {
          buckets[6 - diffDays].accuracySum += r.avgAccuracy;
          buckets[6 - diffDays].runsCount++;
        }
      }

      if (r.elevationGain) totalElevation += r.elevationGain;
      if (r.maxSpeedKmh && r.maxSpeedKmh > peakSpeed) peakSpeed = r.maxSpeedKmh;
      if (r.avgAccuracy) {
        totalAccuracySum += r.avgAccuracy;
        runsWithAccuracy++;
      }
    });

    buckets.forEach(b => {
      const bKm = b.dist / 1000;
      if (user?.weightKg) {
        b.calories = Math.round(1.036 * user.weightKg * bKm);
      } else {
        b.calories = Math.round(bKm * 60);
      }
    });

    const overallAvgAccuracy = runsWithAccuracy > 0 ? totalAccuracySum / runsWithAccuracy : 0;

    // --- ATHLETIC INSIGHTS CALCULATION ---
    // 1. VO2 Max (VDOT based)
    let best8MinPace = Infinity;
    let vo2Duration = 0;
    runs.forEach(r => {
      if (r.durationSeconds >= 480 && r.totalDistanceMeters > 0) {
        const pace = r.durationSeconds / (r.totalDistanceMeters / 1000);
        if (pace < best8MinPace) {
          best8MinPace = pace;
          vo2Duration = r.durationSeconds / 60; // in minutes
        }
      }
    });

    let vo2Max = 0;
    let hasVO2Data = false;
    if (best8MinPace !== Infinity) {
      // velocity_m_per_min = 1000 / (pace_in_min_per_km)
      const velocity_m_per_min = 1000 / (best8MinPace / 60);
      const vo2_at_pace = 0.2 * velocity_m_per_min + 3.5;
      const t = vo2Duration;
      const percentMax = 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t);
      vo2Max = vo2_at_pace / percentMax;
      hasVO2Data = true;
    }

    // 2. VAM
    let vamElevation = 0;
    let vamTimeSeconds = 0;
    runs.forEach(r => {
      if (r.elevationGain && r.elevationGain >= 50) {
        vamElevation += r.elevationGain;
        vamTimeSeconds += r.durationSeconds;
      }
    });
    let vam = 0;
    let hasVAMData = false;
    if (vamElevation >= 50 && vamTimeSeconds > 0) {
      vam = vamElevation / (vamTimeSeconds / 3600);
      hasVAMData = true;
    }

    // 3. Training Stress Score (TSS) & ACWR
    let thresholdPace = Infinity;
    runs.forEach(r => {
      if (r.durationSeconds >= 1200 && r.durationSeconds <= 3600 && r.totalDistanceMeters > 0) {
        const pace = r.durationSeconds / (r.totalDistanceMeters / 1000);
        if (pace < thresholdPace) thresholdPace = pace;
      }
    });
    if (thresholdPace === Infinity && bestPace !== Infinity) {
      thresholdPace = bestPace * 1.05;
    }

    let tss7Day = 0;
    let tss28Day = 0;
    const historyDays = daySet.size > 0
      ? Math.round((now.getTime() - Math.min(...runs.map(r => {
          const d = new Date(r.createdAt);
          d.setHours(0,0,0,0);
          return d.getTime();
        }))) / (1000 * 3600 * 24)) + 1
      : 0;

    if (thresholdPace !== Infinity) {
      runs.forEach(r => {
        const runDate = new Date(r.createdAt);
        runDate.setHours(0, 0, 0, 0);
        const diffDays = Math.round((now.getTime() - runDate.getTime()) / (1000 * 3600 * 24));

        if (diffDays < 28 && r.totalDistanceMeters > 0) {
          const runPace = r.durationSeconds / (r.totalDistanceMeters / 1000);
          const IF = thresholdPace / runPace; // both in seconds per km
          const tssRun = (r.durationSeconds * Math.pow(IF, 2)) / 3600 * 100;

          tss28Day += tssRun;
          if (diffDays < 7) {
            tss7Day += tssRun;
          }
        }
      });
    }

    let acwr = 0;
    let hasACWRData = false;
    if (historyDays >= 28) {
      acwr = tss28Day > 0 ? tss7Day / (tss28Day / 4) : 0;
      hasACWRData = true;
    }

    setAthleticStats({
      vo2Max,
      vam,
      tss7Day,
      acwr,
      hasVO2Data,
      hasVAMData,
      hasACWRData,
      historyDays
    });

    // Calculate streak based on daily goal
    let streak = 0;
    const dailyGoal = user?.dailyGoalKm || 5;
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);

    for (let i = 0; i < 365; i++) {
      const check = new Date(todayDate);
      check.setDate(check.getDate() - i);
      const dist = dayDistanceMap.get(check.toDateString()) || 0;

      if (dist >= dailyGoal) {
        streak++;
      } else {
        if (i === 0) continue; // today doesn't have to be hit yet to maintain previous streak
        break;
      }
    }

    const totalKm = totalDist / 1000;
    const avgPace = totalKm > 0 ? totalTime / totalKm : 0;

    let totalCalories = 0;
    if (user?.weightKg) {
      // Professional Net Calorie Formula for running: 1.036 * weight(kg) * distance(km)
      totalCalories = Math.round(1.036 * user.weightKg * totalKm);
    } else {
      totalCalories = Math.round(totalKm * 60);
    }

    setStats({
      totalRuns: runs.length,
      totalKm,
      totalTime,
      avgPace,
      bestPace: bestPace === Infinity ? 0 : bestPace,
      longestRun,
      totalCalories,
      currentStreak: streak,
      totalElevation,
      peakSpeed,
      avgAccuracy: overallAvgAccuracy,
      monthlyKm,
      todayKm,
    });

    setChartData(buckets);

    chartAnim.setValue(0);
    Animated.spring(chartAnim, { toValue: 1, useNativeDriver: false, speed: 6 }).start();
  }, []);

  useEffect(() => {
    if (allRuns) {
      processStats(allRuns, userData);
    }
  }, [allRuns, userData, processStats]);

  /* ─── WORLD MAP ROUTES ─── */
  const handleOpenMap = async () => {
    setMapVisible(true);
    if (routesGeoJSON) return; // already loaded

    setLoadingRoutes(true);
    try {
      const user = getAuth().currentUser;
      if (!user) return;

      const features: any[] = [];

      for (const run of allRuns) {
        try {
          const pointsQ = query(
            collection(getFirestore(), `runs/${run.id}/points`),
            orderBy('chunkIndex', 'asc'),
          );
          const snap = await getDocs(pointsQ);
          let pts: GPSPoint[] = [];
          snap.forEach(d => { pts = pts.concat(d.data().data); });

          if (pts.length > 1) {
            let rMinLat = 90, rMaxLat = -90, rMinLon = 180, rMaxLon = -180;
            pts.forEach(p => {
              if (p.latitude < rMinLat) rMinLat = p.latitude;
              if (p.latitude > rMaxLat) rMaxLat = p.latitude;
              if (p.longitude < rMinLon) rMinLon = p.longitude;
              if (p.longitude > rMaxLon) rMaxLon = p.longitude;
            });

            features.push({
              type: 'Feature',
              properties: {
                runId: run.id,
                distance: run.totalDistanceMeters,
                title: run.title || 'Outrun',
                startCoord: [pts[0].longitude, pts[0].latitude],
                bounds: { ne: [rMaxLon, rMaxLat], sw: [rMinLon, rMinLat] }
              },
              geometry: {
                type: 'LineString',
                coordinates: pts.map(p => [p.longitude, p.latitude]),
              },
            });
          }
        } catch (e) {
          console.log('Error loading run', run.id, e);
        }
      }

      setRoutesGeoJSON({
        type: 'FeatureCollection',
        features,
      });
    } catch (e) {
      console.error('Error loading routes', e);
    } finally {
      setLoadingRoutes(false);
    }
  };

  const [mapBounds, setMapBounds] = useState<{ ne: number[], sw: number[] } | null>(null);

  // Hamburger Menu State
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const dropdownAnim = useRef(new Animated.Value(0)).current;

  const toggleMenu = () => {
    if (isMenuOpen) {
      Animated.timing(dropdownAnim, { toValue: 0, duration: 200, useNativeDriver: false }).start(() => setIsMenuOpen(false));
    } else {
      setIsMenuOpen(true);
      Animated.timing(dropdownAnim, { toValue: 1, duration: 250, useNativeDriver: false }).start();
    }
  };

  useEffect(() => {
    if (mapVisible && routesGeoJSON?.features?.length > 0) {
      let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
      let hasPoints = false;

      routesGeoJSON.features.forEach((f: any) => {
        if (f.geometry?.coordinates) {
          f.geometry.coordinates.forEach((coord: number[]) => {
            hasPoints = true;
            const [lon, lat] = coord;
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
            if (lon < minLon) minLon = lon;
            if (lon > maxLon) maxLon = lon;
          });
        }
      });

      if (hasPoints) {
        // Mapbox fails to fitBounds if the box area is 0 or extremely small.
        // Add minimal padding to the coordinates to ensure a valid bounding box.
        if (maxLat - minLat < 0.01) { maxLat += 0.005; minLat -= 0.005; }
        if (maxLon - minLon < 0.01) { maxLon += 0.005; minLon -= 0.005; }

        // Delay setting bounds slightly so map layout can finish first
        setTimeout(() => {
          setMapBounds({
            ne: [maxLon, maxLat],
            sw: [minLon, minLat],
          });
        }, 500);
      }
    } else {
      setMapBounds(null);
    }
  }, [routesGeoJSON, mapVisible]);

  /* ─── AVATAR HANDLERS ─── */
  useEffect(() => {
    let loop: Animated.CompositeAnimation;
    if (uploading) {
      loop = Animated.loop(Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.5, duration: 600, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      ]));
      loop.start();
    } else {
      pulseAnim.setValue(1);
    }
    return () => { if (loop) loop.stop(); };
  }, [uploading]);

  const playAvatarSuccess = () => {
    borderHeight.setValue(0);
    borderOpacity.setValue(1);
    Animated.sequence([
      Animated.timing(borderHeight, { toValue: 100, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      Animated.timing(borderOpacity, { toValue: 0, duration: 300, useNativeDriver: false }),
    ]).start(() => borderHeight.setValue(0));
  };

  const handleLogout = () => {
    showAlert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'CANCEL', style: 'cancel' },
      {
        text: 'SIGN OUT', style: 'destructive', onPress: async () => {
          try { await signOut(getAuth()); } catch (e) { console.error(e); }
        },
      },
    ]);
  };

  const handlePickImage = async () => {
    const result = await launchImageLibrary({ mediaType: 'photo', quality: 0.8 });
    if (result.didCancel || !result.assets?.length) return;
    if (result.assets[0].uri) setPendingImage(result.assets[0].uri);
  };

  const confirmUpload = async () => {
    if (!pendingImage) return;
    const user = getAuth().currentUser;
    if (!user) return;
    setUploading(true);
    setUploadProgress(0);
    try {
      const storageRef = ref(getStorage(), `profile_pictures/${user.uid}.jpg`);
      await new Promise<void>((resolve, reject) => {
        let done = false;
        const finish = () => { if (!done) { done = true; resolve(); } };
        const task = putFile(storageRef, pendingImage);
        task.on('state_changed',
          (snap) => {
            const p = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
            setUploadProgress(p);
            if (p === 100) setTimeout(finish, 1500);
          },
          (err) => { if (!done) { done = true; reject(err); } },
          finish,
        );
      });
      const downloadURL = await getDownloadURL(storageRef);
      await Promise.race([
        updateDoc(doc(getFirestore(), 'users', user.uid), { photoURL: downloadURL, pic_updated_at: Date.now() }),
        new Promise(r => setTimeout(r, 500)),
      ]);
      setPendingImage(null);
      setUploading(false);
      setUploadProgress(0);
      playAvatarSuccess();
    } catch {
      showAlert('Upload Failed', 'Could not upload your picture.');
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const avatarUri = pendingImage
    || (userData?.photoURL
      ? `${userData.photoURL}${userData.pic_updated_at ? `&t=${userData.pic_updated_at}` : ''}`
      : (userData?.profile_pic
        ? `${userData.profile_pic}${userData.pic_updated_at ? `&t=${userData.pic_updated_at}` : ''}`
        : null));
  const initials = `${userData?.firstName?.[0] || ''}${userData?.lastName?.[0] || ''}`;

  /* ─── HELPERS ─── */
  const fmtPace = (s: number) => {
    if (s <= 0) return '--:--';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const fmtTime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  /* ─── MEMBER SINCE ─── */
  const memberSince = userData?.createdAt
    ? (typeof userData.createdAt === 'object' && userData.createdAt.toDate
      ? userData.createdAt.toDate()
      : new Date(userData.createdAt))
    : null;
  const memberStr = memberSince
    ? memberSince.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
    : '';

  const getBadgeTitle = (km: number) => {
    if (km < 10) return 'ROOKIE';
    if (km < 50) return 'AMATEUR';
    if (km < 150) return 'PRO';
    if (km < 500) return 'ELITE';
    return 'LEGEND';
  };
  const badgeTitle = getBadgeTitle(stats.totalKm);

  const canViewStats = isOwnProfile || !userData?.isPrivate || (currentUserId && userData?.followers?.includes(currentUserId));

  /* ─── RENDER ─── */
  return (
    <View style={s.container}>
      {!isOwnProfile && (
        <TouchableOpacity style={s.closeBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={20} color={colors.text} />
        </TouchableOpacity>
      )}
      {isOwnProfile && (
        <View style={s.hamburgerContainer}>
          {isMenuOpen && (
            <Animated.View style={[s.dropdownMenu, { 
              opacity: dropdownAnim,
              overflow: 'hidden',
              maxHeight: dropdownAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 300] })
            }]}>
              <TouchableOpacity onPress={() => { toggleMenu(); setRequestsModalVisible(true); }} style={s.dropdownItem}>
                <Ionicons name="mail-outline" size={20} color={colors.text} />
                <Text style={s.dropdownText}>Inbox</Text>
                {(userData?.followRequests?.length || 0) > 0 && (
                  <View style={s.dropdownBadge}>
                    <Text style={{ color: '#FFF', fontSize: 10, fontWeight: 'bold' }}>{userData.followRequests.length}</Text>
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { toggleMenu(); navigation.navigate('QRScanner'); }} style={s.dropdownItem}>
                <Ionicons name="qr-code-outline" size={20} color={colors.text} />
                <Text style={s.dropdownText}>QR Scanner</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { toggleMenu(); navigation.navigate('Settings'); }} style={s.dropdownItem}>
                <Ionicons name="settings-outline" size={20} color={colors.text} />
                <Text style={s.dropdownText}>Settings</Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          <TouchableOpacity onPress={toggleMenu} style={s.hamburgerBtn} activeOpacity={0.8}>
             <Ionicons name={isMenuOpen ? "close" : "menu"} size={26} color={colors.text} />
             {!isMenuOpen && (userData?.followRequests?.length || 0) > 0 && (
               <View style={s.hamburgerDot} />
             )}
          </TouchableOpacity>
        </View>
      )}
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ─── HERO ─── */}
        <Animated.View style={[s.heroSection, { opacity: Animated.multiply(fadeIn, pulseAnim), transform: [{ translateY: slideUp }] }]}>
          {/* Avatar */}
          <View style={s.avatarWrapper}>
            <TouchableOpacity style={s.avatar} activeOpacity={0.85} onPress={isOwnProfile ? handlePickImage : undefined} disabled={!isOwnProfile || uploading}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={s.avatarImg} />
              ) : (
                <Text style={s.avatarInitials}>{initials}</Text>
              )}
            </TouchableOpacity>

            {/* Camera badge */}
            {isOwnProfile && (
              <View style={s.cameraBadge}>
                <Ionicons name="camera" size={11} color={colors.background} />
              </View>
            )}
          </View>

          {/* Name + tag */}
          <Text style={s.heroName}>
            {userData?.firstName} {userData?.lastName}
          </Text>
          <Text style={s.rankText}>{badgeTitle}</Text>

          {memberStr ? (
            <Text style={s.memberText}>Member since {memberStr}</Text>
          ) : null}

          {/* FOLLOWERS / FOLLOWING STATS */}
          <View style={{ flexDirection: 'row', gap: 24, marginTop: 12, marginBottom: 16 }}>
            <TouchableOpacity onPress={() => { setListModalType('followers'); setListModalVisible(true); }}>
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>
                {userData?.followers?.length || 0} <Text style={{ color: colors.textSecondary, fontWeight: '500' }}>Followers</Text>
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setListModalType('following'); setListModalVisible(true); }}>
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>
                {userData?.following?.length || 0} <Text style={{ color: colors.textSecondary, fontWeight: '500' }}>Following</Text>
              </Text>
            </TouchableOpacity>
          </View>

          {/* FOLLOW ACTION BUTTONS */}
          {!isOwnProfile && (
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16, width: '100%' }}>
              {userData?.followers?.includes(currentUserId) ? (
                <Button 
                  title="FOLLOWING" 
                  variant="secondary"
                  onPress={handleUnfollow} 
                  style={{ flex: 1, height: 40 }} 
                />
              ) : userData?.followRequests?.includes(currentUserId) ? (
                <Button 
                  title="REQUESTED" 
                  variant="ghost"
                  onPress={handleCancelRequest} 
                  style={{ flex: 1, height: 40 }} 
                />
              ) : (
                <Button 
                  title="FOLLOW" 
                  variant="primary"
                  onPress={handleFollow} 
                  style={{ flex: 1, height: 40 }} 
                />
              )}
            </View>
          )}

          {/* Fire React Button */}
          <TouchableOpacity
            style={[s.reactBtn, (!isOwnProfile && hasHyped) && s.reactBtnActive]}
            disabled={isOwnProfile || hasHyped}
            onPress={() => {
              if (!isOwnProfile && targetUserId && !hasHyped) {
                Vibration.vibrate(40);
                updateDoc(doc(getFirestore(), 'users', targetUserId), {
                  fireReacts: (userData?.fireReacts || 0) + 1,
                  hypedBy: arrayUnion(currentUserId)
                });
              }
            }}
          >
            <Text style={s.reactBtnText}>
              🔥 {userData?.fireReacts || 0} {isOwnProfile ? 'REACTS' : (hasHyped ? 'HYPED' : 'HYPE')}
            </Text>
          </TouchableOpacity>

          {pendingImage && !uploading ? (
            <View style={s.uploadRow}>
              <Button variant="primary" title="SAVE" onPress={confirmUpload} style={{ flex: 1 }} />
              <Button variant="ghost" title="CANCEL" onPress={() => setPendingImage(null)} style={{ flex: 1 }} />
            </View>
          ) : null}
        </Animated.View>

        {!canViewStats ? (
          <Animated.View style={[s.section, { alignItems: 'center', marginTop: 40, opacity: fadeIn, transform: [{ translateY: slideUp }] }]}>
            <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center', marginBottom: 16 }}>
              <Ionicons name="lock-closed" size={32} color={colors.textSecondary} />
            </View>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700', marginBottom: 8 }}>This account is private</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 14, textAlign: 'center' }}>Follow this account to see their runs and stats.</Text>
          </Animated.View>
        ) : (
          <>
            {/* ─── DAILY GOAL BAR ─── */}
            <Animated.View style={[s.section, { opacity: fadeIn, transform: [{ translateY: slideUp }] }]}>
          <TouchableOpacity activeOpacity={isOwnProfile ? 0.7 : 1} onPress={() => isOwnProfile && setGoalModalVisible(true)} style={s.goalCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
              <Text style={s.goalLabel}>DAILY GOAL</Text>
              <Text style={s.goalValue}>{stats.todayKm.toFixed(1)} <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>/ {userData?.dailyGoalKm || 5} km</Text></Text>
            </View>
            <View style={s.goalTrack}>
              <View style={[s.goalFill, {
                backgroundColor: colors.brand,
                width: `${Math.min(100, (stats.todayKm / (userData?.dailyGoalKm || 5)) * 100)}%`,
              }]} />
            </View>
          </TouchableOpacity>
        </Animated.View>

        {/* ─── HIGHLIGHT STATS ─── */}
        <Animated.View style={[s.section, { opacity: fadeIn, transform: [{ translateY: slideUp }] }]}>
          <View style={s.highlightRow}>
            <View style={s.highlightCard}>
              <Text style={s.highlightValue}>{stats.totalRuns}</Text>
              <Text style={s.highlightLabel}>RUNS</Text>
            </View>
            <View style={s.highlightDivider} />
            <View style={s.highlightCard}>
              <Text style={s.highlightValue}>{stats.totalKm.toFixed(1)}</Text>
              <Text style={s.highlightLabel}>KM</Text>
            </View>
            <View style={s.highlightDivider} />
            <View style={s.highlightCard}>
              <Text style={s.highlightValue}>{fmtTime(stats.totalTime)}</Text>
              <Text style={s.highlightLabel}>TIME</Text>
            </View>
          </View>
        </Animated.View>

        {/* ─── STREAK ─── */}
        {stats.currentStreak > 0 && (
          <Animated.View style={[s.section, { opacity: fadeIn }]}>
            <View style={s.streakBanner}>
              <Text style={s.streakEmoji}>⚡</Text>
              <View>
                <Text style={s.streakValue}>{stats.currentStreak} day streak</Text>
                <Text style={s.streakSub}>Keep it going</Text>
              </View>
            </View>
          </Animated.View>
        )}

        {/* ─── METRICS TOGGLE & GRID ─── */}
        <Animated.View style={[s.section, { opacity: fadeIn, transform: [{ translateY: slideUp }] }]}>
          <View style={s.tabContainer}>
            <TouchableOpacity style={s.tabBtn} onPress={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setActiveTab('PERFORMANCE');
            }}>
              <Text style={[s.tabText, activeTab === 'PERFORMANCE' && s.tabTextActive]}>Performance</Text>
              {activeTab === 'PERFORMANCE' && <View style={s.tabIndicator} />}
            </TouchableOpacity>
            <TouchableOpacity style={s.tabBtn} onPress={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setActiveTab('ATHLETICS');
            }}>
              <Text style={[s.tabText, activeTab === 'ATHLETICS' && s.tabTextActive]}>Athletics</Text>
              {activeTab === 'ATHLETICS' && <View style={s.tabIndicator} />}
            </TouchableOpacity>
          </View>

          <View style={s.metricsGrid}>
            {activeTab === 'PERFORMANCE' ? (
              <>
                <TouchableOpacity style={s.metricCard} onPress={() => setActiveMetricModal('AVG PACE')}>
                  <Text style={s.metricValue}>{fmtPace(stats.avgPace)}</Text>
                  <Text style={s.metricLabel}>Avg Pace</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.metricCard} onPress={() => setActiveMetricModal('BEST PACE')}>
                  <Text style={s.metricValue}>{fmtPace(stats.bestPace)}</Text>
                  <Text style={s.metricLabel}>Best Pace</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.metricCard} onPress={() => setActiveMetricModal('LONGEST KM')}>
                  <Text style={s.metricValue}>{stats.longestRun.toFixed(1)}</Text>
                  <Text style={s.metricLabel}>Longest Km</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.metricCard} onPress={() => setActiveMetricModal('CALORIES')}>
                  <Text style={s.metricValue}>{stats.totalCalories.toLocaleString()}</Text>
                  <Text style={s.metricLabel}>Calories</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.metricCard} onPress={() => setActiveMetricModal('ELEV. GAIN')}>
                  <Text style={s.metricValue}>{stats.totalElevation}m</Text>
                  <Text style={s.metricLabel}>Elev. Gain</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.metricCard} onPress={() => setActiveMetricModal('PEAK (km/h)')}>
                  <Text style={s.metricValue}>{stats.peakSpeed.toFixed(1)}</Text>
                  <Text style={s.metricLabel}>Peak km/h</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity style={s.metricCard} onPress={() => athleticStats.hasVO2Data && setActiveMetricModal('VO2 MAX')} activeOpacity={athleticStats.hasVO2Data ? 0.7 : 1}>
                  <Text style={s.metricValue}>{athleticStats.hasVO2Data ? athleticStats.vo2Max.toFixed(1) : '--'}</Text>
                  <Text style={s.metricLabel}>VO₂ Max</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.metricCard} onPress={() => athleticStats.hasVAMData && setActiveMetricModal('VAM')} activeOpacity={athleticStats.hasVAMData ? 0.7 : 1}>
                  <Text style={s.metricValue}>{athleticStats.hasVAMData ? Math.round(athleticStats.vam) : '--'}</Text>
                  <Text style={s.metricLabel}>VAM</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.metricCard} onPress={() => setActiveMetricModal('TRAINING STRESS')}>
                  <Text style={s.metricValue}>{Math.round(athleticStats.tss7Day)}</Text>
                  <Text style={s.metricLabel}>TSS (7-Day)</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.metricCard} onPress={() => athleticStats.hasACWRData && setActiveMetricModal('ACWR')} activeOpacity={athleticStats.hasACWRData ? 0.7 : 1}>
                  <Text style={s.metricValue}>{athleticStats.hasACWRData ? athleticStats.acwr.toFixed(2) : '--'}</Text>
                  <Text style={s.metricLabel}>ACWR</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </Animated.View>

        {/* ─── 7-DAY ACTIVITY ─── */}
        <Animated.View style={[s.section, { opacity: fadeIn }]}>
          <Text style={s.sectionTitle}>LAST 7 DAYS</Text>
          <View style={s.chartCard}>
            {chartData.length > 0 ? (
              <AudioVisualizerGraph data={chartData} />
            ) : (
              <Text style={{ color: colors.textSecondary, textAlign: 'center', marginVertical: 32, fontSize: 13 }}>No runs in the last 7 days.</Text>
            )}
          </View>
        </Animated.View>

        {/* ─── MY ROUTES CTA ─── */}
        <Animated.View style={[s.section, { opacity: fadeIn }]}>
          <TouchableOpacity style={s.routesCta} activeOpacity={0.85} onPress={handleOpenMap}>
            <View style={s.routesCtaLeft}>
              <View style={s.routesIconCircle}>
                <Ionicons name="map-outline" size={18} color={colors.background} />
              </View>
              <View>
                <Text style={s.routesCtaTitle}>
                  {isOwnProfile ? 'My Routes' : `${userData?.firstName || 'Their'} Routes`}
                </Text>
                <Text style={s.routesCtaSub}>{allRuns.length} runs on the world map</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        </Animated.View>

          </>
        )}

        {/* ─── SIGN OUT ─── */}
        {isOwnProfile && (
          <View style={s.section}>
            <Button variant="ghost" title="SIGN OUT" onPress={handleLogout} style={{ width: '100%' }} />
          </View>
        )}

      </ScrollView>

      {/* ─── WORLD MAP MODAL ─── */}
      <Modal visible={mapVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setMapVisible(false)}>
        <View style={s.mapModal}>
          <View style={s.mapHeader}>
            <View>
              <Text style={s.mapTitle}>MY ROUTES</Text>
              <Text style={s.mapSubtitle}>{allRuns.length} runs • {stats.totalKm.toFixed(1)} km total</Text>
            </View>
            <TouchableOpacity style={s.mapCloseBtn} onPress={() => setMapVisible(false)}>
              <Ionicons name="close" size={20} color={colors.text} />
            </TouchableOpacity>
          </View>

          {loadingRoutes ? (
            <View style={s.mapLoading}>
              <ActivityIndicator size="large" color={colors.brand} />
              <Text style={s.mapLoadingText}>Loading your routes...</Text>
            </View>
          ) : (
            <MapboxGL.MapView
              style={s.mapView}
              styleURL={theme === 'dark' ? "mapbox://styles/mapbox/dark-v11" : "mapbox://styles/mapbox/light-v11"}
              compassEnabled={false}
              logoEnabled={false}
              attributionEnabled={false}
            >
              <MapboxGL.Camera
                defaultSettings={{ centerCoordinate: [78.9629, 20.5937], zoomLevel: 2 }}
                {...(mapBounds ? {
                  bounds: {
                    ne: mapBounds.ne,
                    sw: mapBounds.sw,
                    paddingTop: 100,
                    paddingRight: 50,
                    paddingBottom: 100,
                    paddingLeft: 50,
                  },
                  animationDuration: 1000
                } : {})}
              />
              {routesGeoJSON && routesGeoJSON.features.length > 0 && (
                <MapboxGL.ShapeSource id="routes" shape={routesGeoJSON}>
                  <MapboxGL.LineLayer
                    id="routeLines"
                    style={{
                      lineColor: colors.brand,
                      lineWidth: 2,
                      lineOpacity: 0.7,
                      lineCap: 'round',
                      lineJoin: 'round',
                    }}
                  />
                </MapboxGL.ShapeSource>
              )}
              {routesGeoJSON && routesGeoJSON.features.map((f: any) => (
                <MapboxGL.PointAnnotation
                  key={`marker-${f.properties.runId}`}
                  id={`marker-${f.properties.runId}`}
                  coordinate={f.properties.startCoord}
                  onSelected={() => {
                    Vibration.vibrate(30);
                    if (!f.properties.bounds) return;
                    let [maxLon, maxLat] = f.properties.bounds.ne;
                    let [minLon, minLat] = f.properties.bounds.sw;
                    if (maxLat - minLat < 0.01) { maxLat += 0.005; minLat -= 0.005; }
                    if (maxLon - minLon < 0.01) { maxLon += 0.005; minLon -= 0.005; }
                    setMapBounds({ ne: [maxLon, maxLat], sw: [minLon, minLat] });
                  }}
                >
                  <View style={s.mapMarker}>
                    <View style={s.mapMarkerInner} />
                  </View>
                </MapboxGL.PointAnnotation>
              ))}
            </MapboxGL.MapView>
          )}
        </View>
      </Modal>

      <EditProfileModal
        visible={editModalVisible}
        onClose={() => setEditModalVisible(false)}
        userData={userData || {}}
        onSaved={() => setEditModalVisible(false)}
      />

      <Modal visible={goalModalVisible} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <View style={s.modalHeader}>
              <Ionicons name="flag" size={20} color={colors.brand} />
              <Text style={s.modalTitle}>Daily Goal</Text>
              <View style={{ flex: 1 }} />
              <TouchableOpacity onPress={() => setGoalModalVisible(false)}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text style={s.modalText}>Set a daily distance target to keep yourself accountable. Your streak relies on hitting this goal.</Text>
            <View style={{ marginVertical: 20, width: '100%', alignItems: 'center' }}>
              <RulerPicker
                min={5} max={100}
                value={goalInput}
                onValueChange={setGoalInput}
                label="Goal"
                unit=" km"
              />
            </View>
            <Button title="SAVE GOAL" variant="primary" onPress={() => {
              if (currentUserId) {
                updateDoc(doc(getFirestore(), 'users', currentUserId), { dailyGoalKm: goalInput });
              }
              setGoalModalVisible(false);
            }} style={{ width: '100%' }} />
          </View>
        </View>
      </Modal>

      <OutrunModal visible={!!activeMetricModal} onClose={() => setActiveMetricModal(null)} height={650}>
        <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 40 }}>
          {(() => {
            if (!activeMetricModal) return null;

            let title = '';
            let icon = '';
            let iconColor = colors.brand;
            let description = '';
            let chartKey: string | null = null;
            let formatVal = (val: number, bucket?: any) => val.toString();

            switch (activeMetricModal) {
              case 'AVG PACE':
                title = 'AVERAGE PACE';
                icon = 'speedometer-outline';
                description = 'Your average speed across all recorded runs, measured in minutes per kilometer. Lower is faster.';
                chartKey = 'time';
                formatVal = (val: number, bucket: any) => bucket.dist > 0 ? fmtPace(bucket.time / (bucket.dist/1000)) : '';
                break;
              case 'BEST PACE':
                title = 'BEST PACE';
                icon = 'flash-outline';
                description = 'Your absolute fastest pace sustained over at least 100 meters.';
                break;
              case 'LONGEST KM':
                title = 'LONGEST RUN';
                icon = 'trophy-outline';
                description = 'The maximum distance you have covered in a single continuous session.';
                chartKey = 'dist';
                formatVal = (val: number) => (val / 1000).toFixed(1) + 'km';
                break;
              case 'CALORIES':
                title = 'CALORIES BURNED';
                icon = 'flame-outline';
                iconColor = '#FF6B35';
                description = userData?.weightKg
                  ? `Net Calories = 1.036 × ${isOwnProfile ? userData.weightKg : 'W'} × Distance\n\nThis factors body weight for highly accurate tracking.`
                  : 'Estimated using a standard 60 cal/km formula. Add your Body Metrics for accuracy.';
                chartKey = 'calories';
                formatVal = (val: number) => val + ' kcal';
                break;
              case 'ELEV. GAIN':
                title = 'ELEVATION GAIN';
                icon = 'stats-chart-outline';
                description = 'The total cumulative positive altitude you have climbed during your runs.';
                chartKey = 'elevation';
                formatVal = (val: number) => Math.round(val) + 'm';
                break;
              case 'PEAK (km/h)':
                title = 'PEAK SPEED';
                icon = 'flash-outline';
                iconColor = '#F7D002';
                description = 'The absolute highest burst speed recorded by your GPS during any run.';
                chartKey = 'peakSpeed';
                formatVal = (val: number) => val.toFixed(1);
                break;
              case 'SIGNAL ACC.':
                title = 'SIGNAL ACCURACY';
                icon = 'pulse-outline';
                iconColor = '#00FF87';
                description = 'The average precision of your GPS signal. Lower numbers mean a more accurate and stable connection to satellites.';
                chartKey = 'accuracySum';
                formatVal = (val: number, bucket: any) => bucket.runsCount > 0 ? Math.round(val / bucket.runsCount) + 'm' : '';
                break;
              case 'VO2 MAX':
                title = 'VO₂ MAX (Est.)';
                icon = 'medical-outline';
                iconColor = '#FF3B30';
                description = 'Estimated maximum oxygen uptake capacity based on the Daniels-Gilbert VDOT formula. Highly correlated with endurance running performance.';
                break;
              case 'VAM':
                title = 'VAM (Ascent Speed)';
                icon = 'trending-up-outline';
                iconColor = '#34C759';
                description = 'Velocità Ascensionale Media. Represents how quickly you climb during runs with at least 50m of elevation gain.';
                break;
              case 'TRAINING STRESS':
                title = 'TRAINING STRESS SCORE';
                icon = 'barbell-outline';
                iconColor = '#FF9F0A';
                description = 'Pace-based training load over the last 7 days. Computes an Intensity Factor (IF) against your threshold pace.';
                break;
              case 'ACWR':
                title = 'WORKLOAD RATIO (ACWR)';
                icon = 'git-network-outline';
                iconColor = '#5E5CE6';
                description = 'Acute:Chronic Workload Ratio compares your 7-day training load to your 28-day average. The green "Sweet Spot" (0.8 - 1.3) maximizes fitness while minimizing injury risk.';
                break;
            }

            let maxVal = 0;
            if (chartKey && chartData.length > 0) {
              if (activeMetricModal === 'AVG PACE') {
                maxVal = Math.max(...chartData.map(b => b.dist > 0 ? b.time / (b.dist/1000) : 0));
              } else if (activeMetricModal === 'SIGNAL ACC.') {
                maxVal = Math.max(...chartData.map(b => b.runsCount > 0 ? b.accuracySum / b.runsCount : 0));
              } else {
                maxVal = Math.max(...chartData.map(b => b[chartKey!]));
              }
            }

            return (
              <ScrollView>
                {canViewStats ? (
                  <>
                    <View style={s.modalHeader}>
                      <Ionicons name={icon as any} size={20} color={iconColor} />
                      <Text style={[s.modalTitle, { color: iconColor }]}>{title}</Text>
                    </View>
                    <Text style={s.modalText}>{description}</Text>

                {chartKey && maxVal > 0 && (
                  <View style={s.mathContainer}>
                    <Text style={s.mathSectionTitle}>7-DAY TREND</Text>
                    <View style={s.miniChartRow}>
                      {chartData.map((d, i) => {
                        let val = 0;
                        if (activeMetricModal === 'AVG PACE') val = d.dist > 0 ? d.time / (d.dist/1000) : 0;
                        else if (activeMetricModal === 'SIGNAL ACC.') val = d.runsCount > 0 ? d.accuracySum / d.runsCount : 0;
                        else val = d[chartKey!];

                        const height = maxVal > 0 ? Math.max((val / maxVal) * 60, 4) : 4;
                        return (
                          <View key={i} style={s.miniChartCol}>
                            <Text style={s.miniChartVal}>{val > 0 ? formatVal(val, d) : ''}</Text>
                            <View style={[s.miniChartBar, { height, backgroundColor: val > 0 ? iconColor : colors.border }]} />
                            <Text style={s.miniChartDay}>{d.day}</Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                )}

                {activeMetricModal === 'VO2 MAX' && (
                  <View style={s.mathContainer}>
                    <Text style={s.mathSectionTitle}>DANIELS-GILBERT VDOT FORMULA</Text>
                    <Text style={s.mathEquation}>VO₂ = 0.2 × v + 3.5</Text>
                    <Text style={s.mathEquationSub}>Uses your best {">"}8 min effort pace without requiring Heart Rate data.</Text>
                  </View>
                )}
                {activeMetricModal === 'VAM' && (
                  <View style={s.mathContainer}>
                    <Text style={s.mathSectionTitle}>FORMULA</Text>
                    <Text style={s.mathEquation}>VAM = Elevation(m) / Time(h)</Text>
                    <Text style={s.mathEquationSub}>Computed only for runs exceeding 50m of vertical gain.</Text>
                  </View>
                )}
                {activeMetricModal === 'TRAINING STRESS' && (
                  <View style={s.mathContainer}>
                    <Text style={s.mathSectionTitle}>PACE-BASED TSS</Text>
                    <Text style={s.mathEquation}>TSS = (Duration × IF²) / 3600 × 100</Text>
                    <Text style={s.mathEquationSub}>Intensity Factor (IF) = Threshold Pace / Run Pace</Text>
                  </View>
                )}
                {activeMetricModal === 'ACWR' && (
                  <View style={s.mathContainer}>
                    <Text style={s.mathSectionTitle}>INJURY RISK ZONES</Text>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 }}>
                      <Text style={{ color: '#00C7BE', fontSize: 10, fontWeight: '800' }}>{"< 0.8\nDETRAINING"}</Text>
                      <Text style={{ color: '#34C759', fontSize: 10, fontWeight: '800', textAlign: 'center' }}>{"0.8 - 1.3\nSWEET SPOT"}</Text>
                      <Text style={{ color: '#FF3B30', fontSize: 10, fontWeight: '800', textAlign: 'right' }}>{"> 1.3\nDANGER"}</Text>
                    </View>
                    <View style={{ height: 6, backgroundColor: colors.border, borderRadius: 3, marginTop: 8, flexDirection: 'row', overflow: 'hidden' }}>
                      <View style={{ flex: 0.8, backgroundColor: '#00C7BE' }} />
                      <View style={{ flex: 0.5, backgroundColor: '#34C759' }} />
                      <View style={{ flex: 0.7, backgroundColor: '#FF3B30' }} />
                        </View>
                      </View>
                    )}

                    {chartKey && maxVal > 0 && (
                      <View style={s.mathContainer}>
                        <Text style={s.mathSectionTitle}>7-DAY TREND</Text>
                        <View style={s.miniChartRow}>
                          {chartData.map((d, i) => {
                            let val = 0;
                            if (activeMetricModal === 'AVG PACE') val = d.dist > 0 ? d.time / (d.dist/1000) : 0;
                            else if (activeMetricModal === 'SIGNAL ACC.') val = d.runsCount > 0 ? d.accuracySum / d.runsCount : 0;
                            else val = d[chartKey!];

                            const height = maxVal > 0 ? Math.max((val / maxVal) * 60, 4) : 4;
                            return (
                              <View key={i} style={s.miniChartCol}>
                                <Text style={s.miniChartVal}>{val > 0 ? formatVal(val, d) : ''}</Text>
                                <View style={[s.miniChartBar, { height, backgroundColor: val > 0 ? iconColor : colors.border }]} />
                                <Text style={s.miniChartDay}>{d.day}</Text>
                              </View>
                            );
                          })}
                        </View>
                      </View>
                    )}

                    {activeMetricModal === 'VO2 MAX' && (
                      <View style={s.mathContainer}>
                        <Text style={s.mathSectionTitle}>DANIELS-GILBERT VDOT FORMULA</Text>
                        <Text style={s.mathEquation}>VO₂ = 0.2 × v + 3.5</Text>
                        <Text style={s.mathEquationSub}>Uses your best {">"}8 min effort pace without requiring Heart Rate data.</Text>
                      </View>
                    )}
                    {activeMetricModal === 'VAM' && (
                      <View style={s.mathContainer}>
                        <Text style={s.mathSectionTitle}>FORMULA</Text>
                        <Text style={s.mathEquation}>VAM = Elevation(m) / Time(h)</Text>
                        <Text style={s.mathEquationSub}>Computed only for runs exceeding 50m of vertical gain.</Text>
                      </View>
                    )}
                    {activeMetricModal === 'TRAINING STRESS' && (
                      <View style={s.mathContainer}>
                        <Text style={s.mathSectionTitle}>PACE-BASED TSS</Text>
                        <Text style={s.mathEquation}>TSS = (Duration × IF²) / 3600 × 100</Text>
                        <Text style={s.mathEquationSub}>Intensity Factor (IF) = Threshold Pace / Run Pace</Text>
                      </View>
                    )}
                    {activeMetricModal === 'ACWR' && (
                      <View style={s.mathContainer}>
                        <Text style={s.mathSectionTitle}>INJURY RISK ZONES</Text>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 }}>
                          <Text style={{ color: '#00C7BE', fontSize: 10, fontWeight: '800' }}>{"< 0.8\nDETRAINING"}</Text>
                          <Text style={{ color: '#34C759', fontSize: 10, fontWeight: '800', textAlign: 'center' }}>{"0.8 - 1.3\nSWEET SPOT"}</Text>
                          <Text style={{ color: '#FF3B30', fontSize: 10, fontWeight: '800', textAlign: 'right' }}>{"> 1.3\nDANGER"}</Text>
                        </View>
                        <View style={{ height: 6, backgroundColor: colors.border, borderRadius: 3, marginTop: 8, flexDirection: 'row', overflow: 'hidden' }}>
                          <View style={{ flex: 0.8, backgroundColor: '#00C7BE' }} />
                          <View style={{ flex: 0.5, backgroundColor: '#34C759' }} />
                          <View style={{ flex: 0.7, backgroundColor: '#FF3B30' }} />
                        </View>
                      </View>
                    )}

                    <TouchableOpacity style={s.modalConfirmBtn} onPress={() => setActiveMetricModal(null)}>
                      <Text style={s.modalConfirmText}>CLOSE</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <View style={{ padding: 20, alignItems: 'center' }}>
                    <Ionicons name="lock-closed" size={40} color={colors.textSecondary} />
                    <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600', marginTop: 12 }}>Private Profile</Text>
                    <Text style={{ color: colors.textSecondary, textAlign: 'center', marginTop: 8 }}>This user has opted to keep their running statistics private.</Text>
                    <TouchableOpacity style={s.modalConfirmBtn} onPress={() => setActiveMetricModal(null)}>
                      <Text style={s.modalConfirmText}>CLOSE</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </ScrollView>
            );
          })()}
        </ScrollView>
      </OutrunModal>

      {/* Follow / Requests Modals */}
      <FollowRequestsModal
        visible={requestsModalVisible}
        onClose={() => setRequestsModalVisible(false)}
        userId={currentUserId || ''}
        requestIds={userData?.followRequests || []}
      />
      <UserListModal
        visible={listModalVisible}
        onClose={() => setListModalVisible(false)}
        userIds={listModalType === 'followers' ? (userData?.followers || []) : (userData?.following || [])}
        title={listModalType === 'followers' ? 'Followers' : 'Following'}
      />
    </View>
  );
};

const getStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingBottom: 60 },

  /* Hero */
  heroSection: {
    alignItems: 'center',
    paddingTop: 56,
    paddingHorizontal: 24,
    paddingBottom: 28,
  },
  avatarWrapper: {
    width: 104,
    height: 104,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarInitials: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '300',
    letterSpacing: 3,
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.brand,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: colors.background,
  },
  heroName: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
    marginTop: 18,
    letterSpacing: 0.2,
  },
  rankText: {
    color: colors.brand,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2.5,
    marginTop: 5,
  },
  memberText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '500',
    marginTop: 6,
  },
  reactBtn: {
    marginTop: 18,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 24,
    backgroundColor: colors.surface,
  },
  reactBtnActive: {
    backgroundColor: 'rgba(255,107,53,0.12)',
  },
  reactBtnText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  closeBtn: {
    position: 'absolute',
    left: 20,
    top: Platform.OS === 'ios' ? 50 : 20,
    zIndex: 10,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  hamburgerContainer: {
    position: 'absolute',
    right: 20,
    top: Platform.OS === 'ios' ? 50 : 20,
    zIndex: 100,
    alignItems: 'flex-end',
  },
  hamburgerBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 4,
  },
  hamburgerDot: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.error,
  },
  dropdownMenu: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 8,
    minWidth: 160,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  dropdownText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 12,
    flex: 1,
  },
  dropdownBadge: {
    backgroundColor: colors.error,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  uploadRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
    width: '100%',
  },

  /* Sections */
  section: { paddingHorizontal: 20, marginBottom: 20 },
  sectionTitle: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 12,
  },

  /* Daily Goal */
  goalCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
  },
  goalLabel: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  goalValue: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
  },
  goalTrack: {
    height: 6,
    backgroundColor: colors.background,
    borderRadius: 3,
    overflow: 'hidden',
  },
  goalFill: {
    height: '100%',
    borderRadius: 3,
  },

  /* Highlight Stats */
  highlightRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 18,
    paddingVertical: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  highlightCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  highlightDivider: {
    width: StyleSheet.hairlineWidth,
    height: 32,
    backgroundColor: colors.border,
  },
  highlightValue: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  highlightLabel: {
    color: colors.textSecondary,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginTop: 5,
    textAlign: 'center',
  },

  /* Streak */
  streakBanner: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  streakEmoji: { fontSize: 24 },
  streakValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  streakSub: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },

  /* Tabs */
  tabContainer: {
    flexDirection: 'row',
    gap: 24,
    marginBottom: 16,
    paddingHorizontal: 2,
  },
  tabBtn: {
    paddingBottom: 10,
  },
  tabText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  tabTextActive: {
    color: colors.text,
    fontWeight: '700',
  },
  tabIndicator: {
    height: 2,
    backgroundColor: colors.brand,
    borderRadius: 1,
    marginTop: 8,
  },

  /* Metrics */
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricCard: {
    width: (SCREEN_W - 40 - 10) / 2,
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  metricValue: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  metricLabel: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
  },

  /* 7-day chart */
  chartCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
  },

  /* Routes CTA */
  routesCta: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
  },
  routesCtaLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  routesIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.brand,
    justifyContent: 'center',
    alignItems: 'center',
  },
  routesCtaTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  routesCtaSub: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },

  /* Modals (shared) */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalBox: {
    width: '100%',
    backgroundColor: colors.background,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.brand,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    color: colors.brand,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginLeft: 10,
    textTransform: 'capitalize',
  },
  modalText: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 20,
  },
  mathContainer: {
    backgroundColor: colors.background,
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
  },
  mathSectionTitle: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  mathEquation: {
    color: colors.text,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  mathEquationSub: {
    color: colors.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 12,
    marginBottom: 4,
  },
  miniChartRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 96,
    marginTop: 12,
    paddingHorizontal: 4,
  },
  miniChartCol: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    flex: 1,
  },
  miniChartVal: {
    color: colors.text,
    fontSize: 8,
    fontWeight: '700',
    marginBottom: 4,
  },
  miniChartBar: {
    width: 16,
    borderRadius: 4,
  },
  miniChartDay: {
    color: colors.textSecondary,
    fontSize: 9,
    fontWeight: '600',
    marginTop: 8,
  },
  modalConfirmBtn: {
    backgroundColor: colors.brand,
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
  },
  modalConfirmText: {
    color: '#FFF',
    fontWeight: '800',
    letterSpacing: 1,
  },

  /* Map Modal */
  mapModal: {
    flex: 1,
    backgroundColor: colors.background,
  },
  mapHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 16,
  },
  mapTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
  },
  mapSubtitle: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '500',
    marginTop: 4,
  },
  mapCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapView: {
    flex: 1,
  },
  mapLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  mapLoadingText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  mapMarker: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(189, 255, 0, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapMarkerInner: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: colors.brand,
    borderWidth: 1.5,
    borderColor: '#000',
  },
});

export default ProfileScreen;