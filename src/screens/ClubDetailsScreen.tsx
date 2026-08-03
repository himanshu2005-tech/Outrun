import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, SafeAreaView, Modal, TextInput, ScrollView, Image, Linking, PermissionsAndroid, Platform, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getAuth } from '@react-native-firebase/auth';
import storage from '@react-native-firebase/storage';
import Geolocation from 'react-native-geolocation-service';
import { getFirestore, doc, getDoc, collection, query, where, getDocs, addDoc, deleteDoc, orderBy, updateDoc, arrayUnion, onSnapshot } from '@react-native-firebase/firestore';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useTheme } from '../theme/ThemeContext';
import Button from '../components/Button';
import CreateEventModal from '../components/CreateEventModal';
import QRGenerateModal from '../components/QRGenerateModal';
import { showAlert } from '../components/CustomAlert';
import RunDetailsModal from './RunDetailsModal';
import ClubSettingsModal from '../components/ClubSettingsModal';
import ManageMembersModal from '../components/ManageMembersModal';

const ClubDetailsScreen = ({ route, navigation }: any) => {
  const { colors, theme } = useTheme();
  const isDark = theme === 'dark';
  const s = React.useMemo(() => getStyles(colors, isDark), [colors, isDark]);
  const insets = useSafeAreaInsets();

  const { clubId } = route.params;
  const [club, setClub] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  
  const [memberCount, setMemberCount] = useState<number>(1);
  const [membershipId, setMembershipId] = useState<string | null>(null);
  const [completedEventIds, setCompletedEventIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [eventModalVisible, setEventModalVisible] = useState(false);
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  const [manageMembersVisible, setManageMembersVisible] = useState(false);
  const [leaderboardModalVisible, setLeaderboardModalVisible] = useState(false);
  
  const [qrModalVisible, setQrModalVisible] = useState(false);
  const [qrModalConfig, setQrModalConfig] = useState<{type: 'club'|'event', eventId?: string, secretCode?: string, title: string, existingUuid?: string}>({ type: 'club', title: '' });

  const [joinEventId, setJoinEventId] = useState<string | null>(null);
  const [eventCodeInput, setEventCodeInput] = useState('');
  const [joinModalVisible, setJoinModalVisible] = useState(false);

  // Top Tabs
  const [activeTab, setActiveTab] = useState<'UPCOMING' | 'PAST'>('UPCOMING');
  const [cumulativeLeaderboard, setCumulativeLeaderboard] = useState<any[]>([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);

  // Participants Modal
  const [participantsModalVisible, setParticipantsModalVisible] = useState(false);
  const [activeEventRuns, setActiveEventRuns] = useState<any[]>([]);
  const [activeEventTitle, setActiveEventTitle] = useState('');
  const [loadingParticipants, setLoadingParticipants] = useState(false);
  
  const [selectedRun, setSelectedRun] = useState<any>(null);
  
  const [uploadingImage, setUploadingImage] = useState(false);

  // Dropdown Menu State
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

  const db = getFirestore();
  const user = getAuth().currentUser;

  useEffect(() => {
    if (!user || !clubId) return;

    const unsubClub = onSnapshot(doc(db, 'clubs', clubId), (docSnap) => {
      if (docSnap.exists) setClub({ id: docSnap.id, ...docSnap.data() });
      else showAlert('Error', 'Club not found');
    });

    const memQ = query(collection(db, 'clubMembers'), where('clubId', '==', clubId), where('userId', '==', user.uid));
    const unsubMem = onSnapshot(memQ, (snap) => {
      setMembershipId(snap.empty ? null : snap.docs[0].id);
    });

    const allMemQ = query(collection(db, 'clubMembers'), where('clubId', '==', clubId));
    const unsubAllMem = onSnapshot(allMemQ, (snap) => {
      setMemberCount(snap.size || 1);
    });

    const evQ = query(collection(db, 'clubEvents'), where('clubId', '==', clubId), orderBy('createdAt', 'desc'));
    const unsubEv = onSnapshot(evQ, (snap) => {
      setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const userRunsQ = query(collection(db, 'runs'), where('clubId', '==', clubId), where('userId', '==', user.uid));
    const unsubUserRuns = onSnapshot(userRunsQ, (snap) => {
      const completedIds = new Set<string>();
      snap.docs.forEach(d => {
        const run = d.data();
        if (run.eventId) completedIds.add(run.eventId);
      });
      setCompletedEventIds(completedIds);
    });
    
    setLoading(false);

    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 10000);

    return () => {
      unsubClub();
      unsubMem();
      unsubAllMem();
      unsubEv();
      unsubUserRuns();
      clearInterval(timer);
    };
  }, [clubId]);

  const handleJoin = async () => {
    if (!user) return;
    
    if (club?.blockedUsers?.includes(user.uid)) {
      showAlert('Blocked', 'You have been blocked from joining this club.');
      return;
    }

    setLoading(true);
    try {
      const ref = await addDoc(collection(db, 'clubMembers'), {
        clubId,
        userId: user.uid,
        role: 'member'
      });
      setMembershipId(ref.id);
      setMemberCount(prev => prev + 1);
    } catch (e) {
      console.error(e);
      showAlert('Error', 'Failed to join club');
    } finally {
      setLoading(false);
    }
  };


  const handleUpdateLocation = async () => {
    if (!isManager) return;
    showAlert('Update Location', "Update this club's location to your current GPS coordinates?", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Update', onPress: async () => {
        setLoading(true);
        try {
          if (Platform.OS === 'android') {
            const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
            if (granted !== PermissionsAndroid.RESULTS.GRANTED) throw new Error('Location permission denied.');
          }
          const loc = await new Promise((resolve, reject) => {
            Geolocation.getCurrentPosition(
              (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
              (err) => reject(err),
              { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
            );
          });
          await updateDoc(doc(db, 'clubs', clubId), { location: loc });
          showAlert('Success', 'Club location updated!');
        } catch(e: any) {
          showAlert('Error', e.message || 'Failed to update location.');
        } finally {
          setLoading(false);
        }
      }}
    ]);
  };

  const handleVisitClub = () => {
    if (club?.location) {
      const url = `https://www.google.com/maps/search/?api=1&query=${club.location.latitude},${club.location.longitude}`;
      Linking.openURL(url).catch(err => {
        showAlert('Error', 'No app found to open maps. Ensure you have a browser installed.');
      });
    } else {
      showAlert('Error', 'This club has no specific location set.');
    }
  };

  const handleLeave = async () => {
    if (!membershipId) return;
    showAlert('Leave Club', 'Are you sure you want to leave this club?', [
      { text: 'Cancel', style: 'cancel' },
      { 
        text: 'Leave', 
        style: 'destructive',
        onPress: async () => {
          setLoading(true);
          try {
            await deleteDoc(doc(db, 'clubMembers', membershipId));
            setMembershipId(null);
            setMemberCount(prev => Math.max(1, prev - 1));
          } catch (e) {
            console.error(e);
          } finally {
            setLoading(false);
          }
        }
      }
    ]);
  };

  const handleJoinEvent = async (event: any) => {
    if (!user) return;
    
    const now = new Date();
    const start = new Date(event.startTime.replace(' ', 'T'));
    const end = new Date(event.endTime.replace(' ', 'T'));

    if (now < start) {
      return showAlert('Not Started', `This event starts at ${event.startTime}`);
    }
    if (now > end) {
      return showAlert('Ended', `This event ended at ${event.endTime}`);
    }

    if (club.type === 'offline') {
      const isManager = user?.uid === club.managerId;
      if (event.eventInviteCode && !isManager) {
        setJoinEventId(event.id);
        setEventCodeInput('');
        setJoinModalVisible(true);
      } else {
        executeJoinEvent(event.id, '');
      }
    } else {
      executeJoinEvent(event.id, '');
    }
  };

  const executeJoinEvent = async (eventId: string, code?: string) => {
    if (!user) return;
    setLoading(true);
    setJoinModalVisible(false);
    try {
      if (code) {
        const q = query(collection(db, 'clubEvents'), where('eventInviteCode', '==', code.trim().toUpperCase()));
        const snapshot = await getDocs(q);
        if (snapshot.empty || snapshot.docs[0].id !== eventId) {
          throw new Error('Invalid Event Code.');
        }
      }

      const eventRef = doc(db, 'clubEvents', eventId);
      await updateDoc(eventRef, {
        participants: arrayUnion(user.uid)
      });
      
      showAlert('Success', "You have joined the event! Your tracker is now ready.");
      navigation.navigate('Main', { screen: 'NewOutrun', params: { eventId, clubId, clubName: club?.name } });
    } catch (e: any) {
      console.error(e);
      showAlert('Error', e.message || 'Failed to join event');
    } finally {
      setLoading(false);
    }
  };

  const handleSeeParticipants = async (event: any) => {
    setActiveEventTitle(event.title);
    setParticipantsModalVisible(true);
    setLoadingParticipants(true);
    setActiveEventRuns([]);
    
    try {
      const runsQ = query(collection(db, 'runs'), where('eventId', '==', event.id));
      const runsSnap = await getDocs(runsQ);
      const fetchedRuns = runsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      const userIds = [...new Set(fetchedRuns.map(r => r.userId))];
      const userPics: Record<string, string> = {};
      
      if (userIds.length > 0) {
        for (let i = 0; i < userIds.length; i += 10) {
           const chunk = userIds.slice(i, i + 10);
           const usersQ = query(collection(db, 'users'), where('__name__', 'in', chunk));
           const usersSnap = await getDocs(usersQ);
           usersSnap.forEach(uDoc => {
             const data = uDoc.data();
             const pic = data.photoURL || data.profile_pic;
             if (pic) userPics[uDoc.id] = pic;
           });
        }
      }

      const finalRuns = fetchedRuns.map(r => ({ ...r, userPhotoURL: userPics[r.userId] || null }))
                                   .sort((a, b) => (b.totalDistanceMeters || 0) - (a.totalDistanceMeters || 0));
      setActiveEventRuns(finalRuns);
    } catch (e) {
      console.error('Error fetching participants', e);
    } finally {
setLoadingParticipants(false);
    }
  };

  useEffect(() => {
    if (cumulativeLeaderboard.length === 0 && clubId) {
      const fetchLeaderboard = async () => {
        setLoadingLeaderboard(true);
        try {
          const runsQ = query(collection(db, 'runs'), where('clubId', '==', clubId));
          const runsSnap = await getDocs(runsQ);
          
          const userAggregates: Record<string, any> = {};
          runsSnap.forEach(d => {
            const run = d.data();
            if (!userAggregates[run.userId]) {
              userAggregates[run.userId] = {
                userId: run.userId,
                userName: run.userName || 'Anonymous',
                totalDistance: 0,
                totalRuns: 0,
                totalDuration: 0,
              };
            }
            userAggregates[run.userId].totalDistance += (run.totalDistanceMeters || 0);
            userAggregates[run.userId].totalRuns += 1;
            userAggregates[run.userId].totalDuration += (run.durationSeconds || 0);
          });

          // Fetch user photos
          const userIds = Object.keys(userAggregates);
          const userPics: Record<string, string> = {};
          for (let i = 0; i < userIds.length; i += 10) {
             const chunk = userIds.slice(i, i + 10);
             if (chunk.length === 0) continue;
             const usersQ = query(collection(db, 'users'), where('__name__', 'in', chunk));
             const usersSnap = await getDocs(usersQ);
             usersSnap.forEach(uDoc => {
               const data = uDoc.data();
               const pic = data.photoURL || data.profile_pic;
               if (pic) userPics[uDoc.id] = pic;
               if (data.firstName) {
                 userAggregates[uDoc.id].userName = `${data.firstName} ${data.lastName || ''}`.trim();
               }
             });
          }

          const leaderboardData = Object.values(userAggregates).map((u: any) => ({
            ...u,
            userPhotoURL: userPics[u.userId] || null,
          })).sort((a, b) => b.totalDistance - a.totalDistance);

          setCumulativeLeaderboard(leaderboardData);
        } catch (e) {
          console.error("Leaderboard fetch error", e);
        } finally {
          setLoadingLeaderboard(false);
        }
      };
      fetchLeaderboard();
    }
  }, [activeTab, clubId]);

  if (loading && !club) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  if (!club) {
    return (
      <View style={s.center}>
        <Text style={{color: colors.text}}>Club not found.</Text>
      </View>
    );
  }

  const isManager = user?.uid === club.managerId;
  const isMember = !!membershipId;

  const now = currentTime;
  const upcomingEvents = events.filter(e => e.endTime ? new Date(e.endTime.replace(' ', 'T')) >= now : true);
  const pastEvents = events.filter(e => e.endTime ? new Date(e.endTime.replace(' ', 'T')) < now : false);
  const listData = activeTab === 'UPCOMING' ? upcomingEvents : pastEvents;

  const renderHeader = () => (
    <View style={s.headerContainer}>
      {/* Banner */}
      <View style={s.bannerContainer}>
        {club.bannerURL ? (
          <Image source={{ uri: club.bannerURL }} style={s.bannerImage} />
        ) : (
          <View style={s.bannerPlaceholder} />
        )}
      </View>

      {/* Profile row: avatar + action button side by side */}
      <View style={s.profileRow}>
        <View style={s.profilePicContainer}>
          {club.photoURL ? (
            <Image source={{ uri: club.photoURL }} style={s.profileImage} />
          ) : (
            <View style={s.profilePlaceholder}>
              <Ionicons name="people" size={28} color={colors.background} />
            </View>
          )}
        </View>
        {/* Action button aligned right */}
        <View style={[s.profileRowAction, { zIndex: 100 }]}>
          <TouchableOpacity onPress={toggleMenu} style={s.hamburgerBtn} activeOpacity={0.8}>
             <Ionicons name={isMenuOpen ? "close" : "ellipsis-horizontal"} size={26} color={colors.text} />
          </TouchableOpacity>
          {isMenuOpen && (
            <Animated.View style={[s.dropdownMenu, { 
              opacity: dropdownAnim,
              overflow: 'hidden',
              maxHeight: dropdownAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 300] })
            }]}>
              {isManager && (
                <>
                  <TouchableOpacity onPress={() => { toggleMenu(); setQrModalConfig({ type: 'club', title: club.name, existingUuid: club.qrInviteUuid }); setQrModalVisible(true); }} style={s.dropdownItem}>
                    <Ionicons name="qr-code-outline" size={20} color={colors.text} />
                    <Text style={s.dropdownText}>Show QR Code</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { toggleMenu(); setEventModalVisible(true); }} style={s.dropdownItem}>
                    <Ionicons name="calendar-outline" size={20} color={colors.text} />
                    <Text style={s.dropdownText}>Create Event</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { toggleMenu(); setManageMembersVisible(true); }} style={s.dropdownItem}>
                    <Ionicons name="people-outline" size={20} color={colors.text} />
                    <Text style={s.dropdownText}>Manage Members</Text>
                  </TouchableOpacity>
                  {club.type === 'offline' && (
                    <TouchableOpacity onPress={() => { toggleMenu(); handleUpdateLocation(); }} style={s.dropdownItem}>
                      <Ionicons name="navigate-outline" size={20} color={colors.text} />
                      <Text style={s.dropdownText}>Update Location</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
              {isMember && !isManager && (
                <TouchableOpacity onPress={() => { toggleMenu(); handleLeave(); }} style={s.dropdownItem}>
                  <Ionicons name="exit-outline" size={20} color={colors.error} />
                  <Text style={[s.dropdownText, { color: colors.error }]}>Leave Club</Text>
                </TouchableOpacity>
              )}
              {!isMember && club.type === 'offline' && (
                <TouchableOpacity onPress={() => { toggleMenu(); handleVisitClub(); }} style={s.dropdownItem}>
                  <Ionicons name="location-outline" size={20} color={colors.brand} />
                  <Text style={[s.dropdownText, { color: colors.brand }]}>Visit Club</Text>
                </TouchableOpacity>
              )}
              {!isMember && club.type !== 'offline' && (
                <TouchableOpacity onPress={() => { toggleMenu(); handleJoin(); }} style={s.dropdownItem}>
                  <Ionicons name="add-circle-outline" size={20} color={colors.brand} />
                  <Text style={[s.dropdownText, { color: colors.brand }]}>Join Club</Text>
                </TouchableOpacity>
              )}
            </Animated.View>
          )}
        </View>
      </View>

      {/* Club info */}
      <View style={s.infoSection}>
        {uploadingImage && <ActivityIndicator size="small" color={colors.brand} style={{marginBottom: 8}}/>}
        
        <Text style={s.clubName}>{club.name}</Text>
        <View style={s.clubTypeBadge}>
          <View style={[s.clubTypeDot, club.type === 'online' && {backgroundColor: colors.brand}]} />
          <Text style={s.clubTypeText}>{club.type}</Text>
        </View>

        {club.description ? (
          <Text style={s.description}>{club.description}</Text>
        ) : null}

        {/* Stats */}
        <View style={s.statsRow}>
          <TouchableOpacity style={s.statItem} onPress={() => setManageMembersVisible(true)}>
            <Text style={s.statVal}>{memberCount}</Text>
            <Text style={s.statLabel}>Members</Text>
          </TouchableOpacity>
          <View style={s.statSep} />
          <View style={s.statItem}>
            <Text style={s.statVal}>{events.length}</Text>
            <Text style={s.statLabel}>Events</Text>
          </View>
          <View style={s.statSep} />
          <View style={s.statItem}>
            <Text style={s.statVal}>{upcomingEvents.length}</Text>
            <Text style={s.statLabel}>Upcoming</Text>
          </View>
        </View>
      
        {!isMember && (
          <View style={s.lockedBanner}>
            <Ionicons 
              name={club.type === 'offline' ? 'location-outline' : 'information-circle-outline'} 
              size={16} 
              color={colors.brand} 
            />
            <Text style={s.lockedText}>
              {club.type === 'offline'
                ? 'Visit the location to get the invite code to join.'
                : 'Join the club to participate in events.'}
            </Text>
          </View>
        )}
      </View>

      {/* Top Runners Horizontal List */}
      {(cumulativeLeaderboard.length > 0 || loadingLeaderboard) && isMember && (
        <View style={s.topRunnersSection}>
          <View style={s.topRunnersHeader}>
            <Text style={s.topRunnersTitle}>Top Runners</Text>
            <TouchableOpacity onPress={() => setLeaderboardModalVisible(true)}>
              <Text style={s.topRunnersViewAll}>View all</Text>
            </TouchableOpacity>
          </View>
          
          {loadingLeaderboard ? (
            <ActivityIndicator size="small" color={colors.brand} style={{ marginVertical: 20 }} />
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.topRunnersScroll}>
              {cumulativeLeaderboard.slice(0, 5).map((user, index) => (
                <TouchableOpacity 
                  key={user.id} 
                  style={s.topRunnerCard}
                  onPress={() => navigation.navigate('UserProfile', { userId: user.userId })}
                >
                  <View style={s.topRunnerRankBadge}>
                    <Text style={s.topRunnerRankText}>{index + 1}</Text>
                  </View>
                  {user.userPhotoURL ? (
                    <Image source={{ uri: user.userPhotoURL }} style={s.topRunnerAvatar} />
                  ) : (
                    <View style={s.topRunnerAvatarPlaceholder}>
                      <Ionicons name="person" size={20} color={colors.background} />
                    </View>
                  )}
                  <Text style={s.topRunnerName} numberOfLines={1}>{user.userName || 'Anonymous'}</Text>
                  <Text style={s.topRunnerDist}>{(user.totalDistance / 1000).toFixed(1)} km</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      )}

      {/* Tabs */}
      <View style={s.tabsRow}>
        <TouchableOpacity 
          style={[s.tabButton, activeTab === 'UPCOMING' && s.tabButtonActive]}
          onPress={() => setActiveTab('UPCOMING')}
        >
          <Text style={[s.tabText, activeTab === 'UPCOMING' && s.tabTextActive]}>Upcoming</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[s.tabButton, activeTab === 'PAST' && s.tabButtonActive]}
          onPress={() => setActiveTab('PAST')}
        >
          <Text style={[s.tabText, activeTab === 'PAST' && s.tabTextActive]}>Past</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={s.container}>
      {/* Top bar (Absolute) */}
      <View style={[s.topBar, { top: Math.max(insets.top, 10) }]}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color={isDark ? '#FFF' : colors.brand} />
        </TouchableOpacity>

        {isManager ? (
          <TouchableOpacity style={s.backBtn} onPress={() => setSettingsModalVisible(true)}>
            <Ionicons name="settings-outline" size={20} color={isDark ? '#FFF' : colors.brand} />
          </TouchableOpacity>
        ) : (
          <View style={{width: 36}} />
        )}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.brand} style={{ marginTop: 40 }} />

      ) : (
        <FlatList
          data={listData}
          keyExtractor={(item: any) => item.id || item.userId}
          contentContainerStyle={s.eventList}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={() => (
            <View style={s.emptyState}>
              <Ionicons name="calendar-outline" size={32} color={colors.border} style={{marginBottom: 12}} />
              <Text style={s.emptyText}>No events</Text>
            </View>
          )}
          renderItem={({ item, index }: any) => {

            const isParticipant = item.participants?.includes(user?.uid);
            const hasCompleted = completedEventIds.has(item.id);
            const isPastEvent = item.endTime ? now > new Date(item.endTime.replace(' ', 'T')) : false;

            const startDateObj = new Date(item.startTime.replace(' ', 'T'));
            const endDateObj = item.endTime ? new Date(item.endTime.replace(' ', 'T')) : null;
            
            const month = startDateObj.toLocaleString('en-US', { month: 'short' }).toUpperCase();
            let dateDisplay = startDateObj.getDate().toString();
            
            if (endDateObj) {
              const endMonth = endDateObj.toLocaleString('en-US', { month: 'short' }).toUpperCase();
              const endDateNum = endDateObj.getDate();
              if (month === endMonth && dateDisplay !== endDateNum.toString()) {
                dateDisplay = `${dateDisplay}-${endDateNum}`;
              } else if (month !== endMonth) {
                dateDisplay = `${dateDisplay}-${endDateNum}\n${endMonth}`;
              }
            }
            
            const timeString = startDateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
            const endParts = item.endTime ? item.endTime.split(' ') : [];
            const endTimeStr = endParts.length > 1 ? endParts[1] : item.endTime;

            return (
              <View style={[s.eventCard, isPastEvent && s.eventCardPast]}>
                <View style={{ flexDirection: 'row', width: '100%' }}>
                  
                  {/* CALENDAR BLOCK */}
                  <View style={s.eventCalendarBlock}>
                    <Text style={s.eventMonth}>{month}</Text>
                    <Text style={[s.eventDateNum, dateDisplay.length > 2 && { fontSize: 13, lineHeight: 14 }]}>{dateDisplay}</Text>
                  </View>

                  {/* EVENT DETAILS */}
                  <View style={s.eventDetails}>
                    <View style={s.eventCardHeader}>
                      <View style={{flex: 1}}>
                        <Text style={[s.eventTitle, isPastEvent && { color: colors.textSecondary }]} numberOfLines={2}>{item.title}</Text>
                      </View>
                      {hasCompleted ? (
                        <View style={[s.badge, s.badgeCompleted]}>
                          <Ionicons name="checkmark-circle" size={10} color={colors.brand} style={{marginRight: 3}} />
                          <Text style={[s.badgeText, {color: colors.brand}]}>DONE</Text>
                        </View>
                      ) : isPastEvent ? (
                        <View style={s.badge}>
                          <Text style={s.badgeText}>PAST</Text>
                        </View>
                      ) : null}
                      {isManager && (
                        <TouchableOpacity
                          style={{ padding: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 8, marginLeft: 8 }}
                          onPress={() => {
                            setQrModalConfig({ type: 'event', eventId: item.id, secretCode: item.eventInviteCode, title: item.title, existingUuid: item.qrInviteUuid });
                            setQrModalVisible(true);
                          }}
                        >
                          <Ionicons name="qr-code" size={20} color={colors.text} />
                        </TouchableOpacity>
                      )}
                    </View>

                    <View style={s.eventMeta}>
                      <View style={s.eventMetaItem}>
                        <Ionicons name="time-outline" size={13} color={colors.textSecondary} />
                        <Text style={s.eventMetaText}>{timeString} — {endTimeStr}</Text>
                      </View>
                      {item.location ? (
                        <TouchableOpacity 
                          style={s.eventMetaItem} 
                          activeOpacity={0.7}
                          onPress={() => {
                            const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.location)}`;
                            Linking.openURL(url).catch(() => showAlert('Error', 'Unable to open maps.'));
                          }}
                        >
                          <Ionicons name="navigate-circle-outline" size={14} color={colors.brand} />
                          <Text style={[s.eventMetaText, { color: colors.brand, textDecorationLine: 'underline', flexShrink: 1 }]} numberOfLines={1}>{item.location}</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>
                </View>

                {isMember && (
                <View style={s.eventActions}>
                  <TouchableOpacity 
                    style={s.eventActionBtn}
                    onPress={() => handleSeeParticipants(item)}
                  >
                    <Ionicons name="people-outline" size={14} color={colors.text} />
                    <Text style={s.eventActionText}>Participants</Text>
                  </TouchableOpacity>

                  {!isPastEvent && isMember && (
                    <TouchableOpacity 
                      style={[
                        s.eventActionBtnAccent, 
                        (isParticipant || hasCompleted) && s.eventActionBtnMuted,
                        hasCompleted && { opacity: 0.4 }
                      ]}
                      disabled={hasCompleted}
                      onPress={() => {
                        if (hasCompleted) return;
                        isParticipant 
                          ? navigation.navigate('Main', { screen: 'NewOutrun', params: { eventId: item.id, clubId, clubName: club?.name } }) 
                          : handleJoinEvent(item);
                      }}
                    >
                      <Ionicons 
                        name={hasCompleted ? 'checkmark' : isParticipant ? 'footsteps-outline' : 'enter-outline'} 
                        size={14} 
                        color={(isParticipant || hasCompleted) ? colors.text : '#FFF'} 
                      />
                      <Text style={[s.eventActionTextAccent, (isParticipant || hasCompleted) && {color: colors.text}]}>
                        {hasCompleted ? 'Done' : isParticipant ? 'Track' : 'Join'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
                )}
              </View>
            );
          }}
        />
      )}

      {/* CREATE EVENT MODAL */}
      <CreateEventModal 
        visible={eventModalVisible}
        clubId={clubId}
        clubType={club.type}
        onClose={() => setEventModalVisible(false)}
        onCreated={() => {
          setEventModalVisible(false);
          setActiveTab('UPCOMING');
        }}
      />

      {/* QR GENERATE MODAL */}
      <QRGenerateModal
        visible={qrModalVisible}
        onClose={() => setQrModalVisible(false)}
        type={qrModalConfig.type}
        clubId={clubId}
        eventId={qrModalConfig.eventId}
        secretCode={qrModalConfig.secretCode}
        title={qrModalConfig.title}
        existingUuid={qrModalConfig.existingUuid}
      />

      <ClubSettingsModal
        visible={settingsModalVisible}
        club={club}
        onClose={() => setSettingsModalVisible(false)}
      />

      <ManageMembersModal
        visible={manageMembersVisible}
        club={club}
        isManager={isManager}
        onClose={() => setManageMembersVisible(false)}
        onNavigateProfile={(userId) => {
          setManageMembersVisible(false);
          navigation.navigate('UserProfile', { userId });
        }}
      />

      {/* JOIN OFFLINE EVENT MODAL */}
      <Modal visible={joinModalVisible} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <View style={s.modalIconCircle}>
              <Ionicons name="key-outline" size={24} color={colors.brand} />
            </View>
            <Text style={s.modalTitle}>Event Check-In</Text>
            <Text style={s.modalText}>Enter the 6-digit code to join this offline event.</Text>
            
            <View style={{ backgroundColor: `${colors.brand}15`, padding: 12, borderRadius: 8, marginBottom: 20, borderWidth: 1, borderColor: `${colors.brand}40` }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                <Ionicons name="warning" size={14} color={colors.brand} />
                <Text style={{ color: colors.brand, fontSize: 11, fontWeight: '800', marginLeft: 6 }}>OFFLINE SAFETY</Text>
              </View>
              <Text style={{ color: colors.text, fontSize: 11, lineHeight: 16 }}>
                By checking in, you agree that the app holds no accountability for real-world interactions at this event.
              </Text>
            </View>
            <TextInput
              style={s.modalInput}
              placeholder="000000"
              placeholderTextColor={colors.border}
              autoCapitalize="characters"
              maxLength={6}
              value={eventCodeInput}
              onChangeText={setEventCodeInput}
            />
            <View style={s.modalActions}>
              <TouchableOpacity style={s.modalCancelBtn} onPress={() => setJoinModalVisible(false)}>
                <Text style={s.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.modalConfirmBtn} onPress={() => executeJoinEvent(joinEventId!, eventCodeInput)}>
                <Text style={s.modalConfirmText}>Join Event</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* PARTICIPANTS MODAL */}
      <Modal visible={participantsModalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setParticipantsModalVisible(false)}>
        <View style={s.participantsModalContainer}>
          <View style={s.participantsHeader}>
            <Text style={s.participantsTitle}>{activeEventTitle}</Text>
            <Text style={s.participantsSubtitle}>participants & runs</Text>
            <TouchableOpacity style={s.closeIconBtn} onPress={() => setParticipantsModalVisible(false)}>
              <Ionicons name="close" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>

          {loadingParticipants ? (
            <ActivityIndicator size="large" color={colors.brand} style={{ marginTop: 40 }} />
          ) : activeEventRuns.length === 0 ? (
            <View style={s.emptyState}>
              <Ionicons name="footsteps-outline" size={32} color={colors.border} style={{marginBottom: 12}} />
              <Text style={s.emptyText}>No runs completed yet</Text>
            </View>
          ) : (
            <FlatList
              data={activeEventRuns}
              keyExtractor={item => item.id}
              contentContainerStyle={{ padding: 20 }}
              renderItem={({ item, index }) => {
                const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : null;
                const pace = item.totalDistanceMeters > 0 ? (item.durationSeconds / (item.totalDistanceMeters / 1000)) : 0;
                const paceMin = Math.floor(pace / 60);
                const paceSec = Math.floor(pace % 60).toString().padStart(2, '0');

                return (
                <View style={s.participantCard}>
                  <View style={s.participantCardTop}>
                    <View style={s.participantLeft}>
                      <View style={{width: 24, alignItems: 'center', marginRight: 8}}>
                        {medal ? (
                          <Text style={{fontSize: 16}}>{medal}</Text>
                        ) : (
                          <Text style={{color: colors.textSecondary, fontSize: 13, fontWeight: '700'}}>{index + 1}</Text>
                        )}
                      </View>
                      {item.userPhotoURL ? (
                        <Image source={{ uri: item.userPhotoURL }} style={s.participantAvatar} />
                      ) : (
                        <View style={s.participantAvatarPlaceholder}>
                          <Ionicons name="person" size={16} color={colors.background} />
                        </View>
                      )}
                      <Text style={s.participantName}>{item.userName || 'Anonymous'}</Text>
                    </View>
                    <View style={s.participantRight}>
                      <View style={s.participantStat}>
                        <Text style={s.participantStatVal}>{(item.totalDistanceMeters / 1000).toFixed(2)}</Text>
                        <Text style={s.participantStatUnit}>km</Text>
                      </View>
                      <View style={[s.participantStat, {marginLeft: 16}]}>
                        <Text style={s.participantStatVal}>{paceMin}:{paceSec}</Text>
                        <Text style={s.participantStatUnit}>/km</Text>
                      </View>
                    </View>
                  </View>
                  <View style={s.participantCardActions}>
                    <TouchableOpacity 
                      style={s.participantActionBtn}
                      onPress={() => {
                        setParticipantsModalVisible(false);
                        navigation.navigate('UserProfile', { userId: item.userId });
                      }}
                    >
                      <Ionicons name="person-outline" size={14} color={colors.text} />
                      <Text style={s.participantActionText}>Profile</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={[s.participantActionBtn, {backgroundColor: colors.brand, borderColor: colors.brand}]}
                      onPress={() => setSelectedRun(item)}
                    >
                      <Ionicons name="map-outline" size={14} color={colors.background} />
                      <Text style={[s.participantActionText, {color: colors.background}]}>Route</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                );
              }}
            />
          )}
        </View>
      </Modal>

      <Modal
        visible={leaderboardModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setLeaderboardModalVisible(false)}
      >
        <SafeAreaView style={[s.container, { backgroundColor: colors.background }]}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Leaderboard</Text>
            <TouchableOpacity onPress={() => setLeaderboardModalVisible(false)}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
          
          <FlatList
            data={cumulativeLeaderboard}
            keyExtractor={item => item.id}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
            renderItem={({ item, index }) => {
              const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : null;
              const pace = item.totalDistance > 0 ? (item.totalDuration / (item.totalDistance / 1000)) : 0;
              const paceMin = Math.floor(pace / 60);
              const paceSec = Math.floor(pace % 60).toString().padStart(2, '0');
              
              return (
                <View style={[s.participantCard, { paddingVertical: 12 }]}>
                  <View style={s.participantCardTop}>
                    <View style={s.participantLeft}>
                      <View style={{width: 24, alignItems: 'center', marginRight: 8}}>
                        {medal ? (
                          <Text style={{fontSize: 16}}>{medal}</Text>
                        ) : (
                          <Text style={{color: colors.textSecondary, fontSize: 13, fontWeight: '700'}}>{index + 1}</Text>
                        )}
                      </View>
                      {item.userPhotoURL ? (
                        <Image source={{ uri: item.userPhotoURL }} style={s.participantAvatar} />
                      ) : (
                        <View style={s.participantAvatarPlaceholder}>
                          <Ionicons name="person" size={16} color={colors.background} />
                        </View>
                      )}
                      <Text style={s.participantName}>{item.userName || 'Anonymous'}</Text>
                    </View>
                    <View style={s.participantRight}>
                      <View style={s.participantStat}>
                        <Text style={s.participantStatVal}>{(item.totalDistance / 1000).toFixed(2)}</Text>
                        <Text style={s.participantStatUnit}>km</Text>
                      </View>
                      <View style={[s.participantStat, {marginLeft: 16}]}>
                        <Text style={s.participantStatVal}>{paceMin}:{paceSec}</Text>
                        <Text style={s.participantStatUnit}>/km</Text>
                      </View>
                    </View>
                  </View>
                </View>
              );
            }}
          />
        </SafeAreaView>
      </Modal>

      <RunDetailsModal 
        visible={!!selectedRun}
        run={selectedRun}
        onClose={() => setSelectedRun(null)}
      />
    </View>
  );
};

/* ─────────── styles ─────────── */
const getStyles = (colors: any, isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },

  /* ── top bar ── */
  topBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 48,
    zIndex: 100,
    justifyContent: 'space-between',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: isDark ? colors.brand : '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  topTitleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  topTitle: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 1,
    textAlign: 'center',
    textTransform: 'uppercase',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },

  /* ── header container ── */
  headerContainer: {
    width: '100%',
  },

  /* ── banner ── */
  bannerContainer: {
    width: '100%',
    height: 150,
    overflow: 'hidden',
  },
  bannerImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  bannerPlaceholder: {
    flex: 1,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bannerCameraHint: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },

  /* ── profile row (avatar + action) ── */
  profileRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginTop: -28,
    marginBottom: 12,
    zIndex: 10,
  },
  profilePicContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    borderColor: colors.background,
  },
  profileImage: {
    width: '100%',
    height: '100%',
    borderRadius: 36,
  },
  profilePlaceholder: {
    flex: 1,
    backgroundColor: colors.brand,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileEditBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileRowAction: {
    paddingBottom: 4,
    position: 'relative',
  },
  hamburgerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dropdownMenu: {
    position: 'absolute',
    top: 45,
    right: 0,
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 16,
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

  /* ── action buttons ── */
  actionBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.brand,
    paddingHorizontal: 16,
    height: 34,
    borderRadius: 17,
    gap: 4,
  },
  actionBtnPrimaryText: {
    color: colors.background,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
  actionBtnOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    height: 34,
    borderRadius: 17,
    gap: 4,
  },
  actionBtnOutlineText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },

  /* ── info section ── */
  infoSection: {
    paddingHorizontal: 16,
  },
  clubName: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.3,
    marginBottom: 6,
  },
  clubTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  clubTypeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.brand,
    marginRight: 6,
  },
  clubTypeText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'capitalize',
  },
  description: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '400',
    marginBottom: 20,
  },

  /* ── invite code ── */
  inviteCodeCard: {
    backgroundColor: `${colors.brand}10`,
    borderWidth: 1,
    borderColor: `${colors.brand}30`,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  inviteCodeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  inviteCodeLabel: {
    color: colors.brand,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
  },
  inviteCodeText: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 8,
    fontVariant: ['tabular-nums'],
  },

  /* ── stats ── */
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statSep: {
    width: 1,
    height: 24,
    backgroundColor: colors.surfaceLight,
  },
  statVal: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },

  /* ── locked banner ── */
  lockedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${colors.brand}10`,
    borderRadius: 10,
    padding: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
    gap: 10,
  },
  lockedText: {
    color: colors.textSecondary,
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },

  /*  top runners section  */
  topRunnersSection: {
    marginTop: 24,
    marginBottom: 8,
  },
  topRunnersHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  topRunnersTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.5,
  },
  topRunnersViewAll: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.brand,
  },
  topRunnersScroll: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 12,
  },
  topRunnerCard: {
    alignItems: 'center',
    width: 72,
    position: 'relative',
  },
  topRunnerRankBadge: {
    position: 'absolute',
    top: -6,
    right: 4,
    backgroundColor: colors.brand,
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
    borderWidth: 2,
    borderColor: colors.background,
  },
  topRunnerRankText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '900',
  },
  topRunnerAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    marginBottom: 6,
    borderWidth: 2,
    borderColor: colors.surfaceLight,
  },
  topRunnerAvatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    marginBottom: 6,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topRunnerName: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 2,
  },
  topRunnerDist: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    textAlign: 'center',
  },

  /* ── tabs ── */
  tabsRow: {
    flexDirection: 'row',
    backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#EDEDED',
    borderRadius: 24,
    marginHorizontal: 16,
    marginTop: 24,
    marginBottom: 8,
    padding: 4,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 20,
  },
  tabButtonActive: {
    backgroundColor: isDark ? 'rgba(255,255,255,0.15)' : '#FFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tabText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  tabTextActive: {
    color: colors.text,
  },


  /* ── event list ── */
  eventList: {
    paddingBottom: 100,
  },
  emptyState: {
    paddingVertical: 48,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 14,
  },

  /* ── event card ── */
  eventCard: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: 'rgba(255,255,255,0.025)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.surfaceLight,
    padding: 16,
  },
  eventCalendarBlock: {
    width: 56,
    height: 64,
    backgroundColor: colors.surfaceLight,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  eventMonth: {
    color: colors.brand,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  eventDateNum: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 24,
  },
  eventDetails: {
    flex: 1,
    justifyContent: 'center',
  },
  eventCardPast: {
    opacity: 0.45,
  },
  eventCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  eventTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  badgeCompleted: {
    backgroundColor: `${colors.brand}20`,
  },
  badgeText: {
    color: colors.textSecondary,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },

  /* ── event meta ── */
  eventMeta: {
    gap: 6,
    marginBottom: 4,
  },
  eventMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  eventMetaText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },

  /* ── event code ── */
  eventCodeStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${colors.brand}15`,
    borderRadius: 6,
    padding: 10,
    marginTop: 10,
    gap: 10,
  },
  eventCodeLabel: {
    color: colors.brand,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  eventCodeText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 3,
    fontVariant: ['tabular-nums'],
  },


  /* ── event actions ── */
  eventActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    gap: 8,
  },
  eventActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceLight,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 6,
  },
  eventActionText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  eventActionBtnAccent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 6,
  },
  eventActionTextAccent: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  eventActionBtnMuted: {
    backgroundColor: colors.border,
  },


  /* ── modals ── */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalBox: {
    backgroundColor: colors.background, // Use solid background instead of transparent surface
    padding: 28,
    borderRadius: 20,
    width: '100%',
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  modalIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: `${colors.brand}20`,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  modalText: {
    color: colors.textSecondary,
    fontSize: 13,
    marginBottom: 20,
    textAlign: 'center',
    lineHeight: 18,
  },
  modalInput: {
    backgroundColor: colors.background,
    color: colors.text,
    padding: 14,
    borderRadius: 10,
    fontSize: 22,
    textAlign: 'center',
    letterSpacing: 6,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    borderWidth: 1,
    borderColor: colors.border,
    width: '100%',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
    width: '100%',
  },
  modalCancelBtn: {
    flex: 1,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalCancelText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  modalConfirmBtn: {
    flex: 1,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: colors.brand,
  },
  modalConfirmText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },

  /* ── participants modal ── */
  participantsModalContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  participantsHeader: {
    padding: 20,
    paddingTop: 40,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceLight,
    alignItems: 'center',
    position: 'relative',
  },
  participantsTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 4,
  },
  participantsSubtitle: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  closeIconBtn: {
    position: 'absolute',
    right: 20,
    top: 40,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  participantCard: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceLight,
  },
  participantCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  participantCardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  participantActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  participantActionText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  participantLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  participantAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  participantAvatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: `${colors.brand}80`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  participantName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 12,
  },
  participantRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  participantStat: {
    alignItems: 'flex-end',
  },
  participantStatVal: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  participantStatUnit: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '500',
    marginTop: 1,
  },
});

export default ClubDetailsScreen;
