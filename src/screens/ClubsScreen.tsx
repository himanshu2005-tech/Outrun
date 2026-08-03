import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, SectionList, ActivityIndicator, SafeAreaView, Image } from 'react-native';
import { getAuth } from '@react-native-firebase/auth';
import { getFirestore, collection, query, where, getDocs, onSnapshot, addDoc } from '@react-native-firebase/firestore';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useTheme } from '../theme/ThemeContext';
import { AnimatedListItem } from '../components/AnimatedListItem';
import CreateClubModal from '../components/CreateClubModal';
import { showAlert } from '../components/CustomAlert';
import Geolocation from 'react-native-geolocation-service';
import { PermissionsAndroid, Platform, Alert } from 'react-native';
import { haversineDistance } from '../utils/geoUtils';

const ClubsScreen = ({ navigation }: any) => {
  const { colors } = useTheme();
  const s = React.useMemo(() => getStyles(colors), [colors]);

  const [searchQuery, setSearchQuery] = useState('');
  const [clubs, setClubs] = useState<any[]>([]);
  const [allClubs, setAllClubs] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [usersResult, setUsersResult] = useState<any[]>([]);
  const [userLocation, setUserLocation] = useState<{latitude: number, longitude: number} | null>(null);
  const [myClubs, setMyClubs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);

  const db = getFirestore();
  const user = getAuth().currentUser;

  const unsubscribeClubsRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!user) return;
    setLoading(true);

    const membersQuery = query(collection(db, 'clubMembers'), where('userId', '==', user.uid));
    const unsubscribeMembers = onSnapshot(membersQuery, (memberDocs) => {
      const clubIds = memberDocs.docs.map(d => d.data().clubId);
      if (clubIds.length > 0) {
        const chunk = clubIds.slice(0, 10);
        const clubsQuery = query(collection(db, 'clubs'), where('__name__', 'in', chunk));
        
        if (unsubscribeClubsRef.current) unsubscribeClubsRef.current();
        
        unsubscribeClubsRef.current = onSnapshot(clubsQuery, (clubDocs) => {
           const fetched = clubDocs.docs.map(d => ({ id: d.id, ...d.data() }));
           setMyClubs(fetched);
           setLoading(false);
        });
      } else {
        if (unsubscribeClubsRef.current) {
          unsubscribeClubsRef.current();
          unsubscribeClubsRef.current = null;
        }
        setMyClubs([]);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeMembers();
      if (unsubscribeClubsRef.current) unsubscribeClubsRef.current();
    };
  }, [user]);

  useEffect(() => {
    // Fetch all clubs and users for global search
    const fetchGlobalData = async () => {
      try {
        const [clubSnap, userSnap] = await Promise.all([
          getDocs(collection(db, 'clubs')),
          getDocs(collection(db, 'users'))
        ]);
        setAllClubs(clubSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        if (user) {
          setAllUsers(userSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => u.id !== user.uid));
        }
      } catch(e) {
        console.error(e);
      }
    };
    fetchGlobalData();

    // Fetch user location for "Near Me" feature
    const fetchLoc = async () => {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) return;
      }
      Geolocation.getCurrentPosition(
        (pos) => setUserLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        (err) => console.log(err),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
      );
    };
    fetchLoc();
  }, []);

  useEffect(() => {
    if (!searchQuery.trim()) {
      // Show "Near me"
      let discoverClubs = allClubs.filter(c => c.type === 'offline' && c.location && !myClubs.some(mc => mc.id === c.id) && (!c.blockedUsers || !c.blockedUsers.includes(user?.uid)));
      if (userLocation) {
        discoverClubs.sort((a, b) => 
          haversineDistance(userLocation.latitude, userLocation.longitude, a.location.latitude, a.location.longitude) - 
          haversineDistance(userLocation.latitude, userLocation.longitude, b.location.latitude, b.location.longitude)
        );
      }
      setClubs(discoverClubs.slice(0, 10)); // Show top 10 nearby
      setUsersResult([]);
    } else {
      const term = searchQuery.toLowerCase();
      // Search online and offline clubs by name
      const results = allClubs.filter(c => c.name && c.name.toLowerCase().includes(term) && !myClubs.some(mc => mc.id === c.id) && (!c.blockedUsers || !c.blockedUsers.includes(user?.uid)));
      
      const uResults = allUsers.filter(u => 
        (u.firstName && u.firstName.toLowerCase().includes(term)) ||
        (u.lastName && u.lastName.toLowerCase().includes(term)) ||
        (u.displayName && u.displayName.toLowerCase().includes(term))
      );

      if (results.length === 0 && uResults.length === 0) {
        // Fallback to near me if no search results match
        let discoverClubs = allClubs.filter(c => c.type === 'offline' && c.location && !myClubs.some(mc => mc.id === c.id) && (!c.blockedUsers || !c.blockedUsers.includes(user?.uid)));
        if (userLocation) {
          discoverClubs.sort((a, b) => 
            haversineDistance(userLocation.latitude, userLocation.longitude, a.location.latitude, a.location.longitude) - 
            haversineDistance(userLocation.latitude, userLocation.longitude, b.location.latitude, b.location.longitude)
          );
        }
        setClubs(discoverClubs.slice(0, 10));
        setUsersResult([]);
      } else {
        setClubs(results);
        setUsersResult(uResults);
      }
    }
  }, [searchQuery, allClubs, allUsers, userLocation, myClubs]);

  const renderItem = ({ item, index }: any) => {
    // If the item has 'firstName' or 'lastName', it's a user
    if (item.firstName || item.lastName || item.displayName) {
      return (
        <AnimatedListItem index={index}>
          <TouchableOpacity 
            style={s.clubCard}
            onPress={() => navigation.navigate('UserProfile', { userId: item.id })}
          >
            <View style={[s.clubIcon, { overflow: 'hidden' }]}>
              {item.photoURL ? (
                <Image source={{ uri: item.photoURL }} style={s.clubImage} />
              ) : (
                <Ionicons name="person" size={24} color={colors.brand} />
              )}
            </View>
            <View style={s.clubInfo}>
              <Text style={s.clubName}>{item.firstName} {item.lastName}</Text>
              {item.displayName && <Text style={s.clubType}>@{item.displayName}</Text>}
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </AnimatedListItem>
      );
    }

    const isMember = myClubs.some(c => c.id === item.id);
    const isOffline = item.type === 'offline';
    const showDistance = isOffline && !isMember && item.location && userLocation;

    let distanceText = "";
    if (showDistance) {
      const dist = haversineDistance(
        userLocation.latitude,
        userLocation.longitude,
        item.location.latitude,
        item.location.longitude
      );
      distanceText = (dist / 1000).toFixed(1) + " km away";
    }

    return (
      <AnimatedListItem index={index}>
        <TouchableOpacity 
          style={s.clubCard}
          onPress={() => navigation.navigate('ClubDetails', { clubId: item.id })}
        >
          <View style={s.clubIcon}>
            {item.photoURL ? (
              <Image source={{ uri: item.photoURL }} style={s.clubImage} />
            ) : (
              <Ionicons name={item.type === 'offline' ? 'location' : 'globe'} size={24} color={colors.brand} />
            )}
          </View>
          <View style={s.clubInfo}>
            <Text style={s.clubName}>{item.name}</Text>
            <Text style={s.clubType}>
              {item.type?.toUpperCase()}
              {showDistance ? ` • ${distanceText}` : ""}
            </Text>
            {isOffline && !isMember && (
              <Text style={s.visitText}>Visit to get the code to join this club</Text>
            )}
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </AnimatedListItem>
    );
  };

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>RUN CLUBS</Text>
        <TouchableOpacity style={s.createBtn} onPress={() => setCreateModalVisible(true)}>
          <Ionicons name="add" size={24} color="#FFF" />
        </TouchableOpacity>
      </View>

      <View style={s.content}>
        <Text style={s.sectionTitle}>SEARCH CLUBS & USERS</Text>
        <View style={s.searchRow}>
          <TextInput
            style={s.searchInput}
            placeholder="Search by name or username..."
            placeholderTextColor={colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          <TouchableOpacity style={s.searchBtn}>
            <Ionicons name="search" size={20} color="#FFF" />
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={colors.brand} style={{ marginTop: 20 }} />
        ) : (
          <SectionList
            sections={
              searchQuery.trim()
                ? [
                    { title: 'CLUBS', data: clubs },
                    { title: 'USERS', data: usersResult }
                  ].filter(s => s.data.length > 0)
                : [
                    { title: 'MY CLUBS', data: myClubs },
                    { title: 'CLUBS NEAR ME', data: clubs }
                  ]
            }
            keyExtractor={item => item.id}
            renderItem={renderItem}
            renderSectionHeader={({ section: { title } }) => (
              <Text style={[s.sectionTitle, { marginTop: 20 }]}>{title}</Text>
            )}
            renderSectionFooter={({ section }) => {
              if (section.data.length === 0) {
                if (section.title === 'MY CLUBS') return <Text style={s.emptyText}>You haven't joined any clubs yet.</Text>;
                if (section.title === 'CLUBS NEAR ME') return <Text style={s.emptyText}>No clubs found near you.</Text>;
              }
              return null;
            }}
            ListFooterComponent={() => {
              if (searchQuery.trim() && clubs.length === 0 && usersResult.length === 0) {
                return <Text style={s.emptyText}>No results found matching your search.</Text>;
              }
              return null;
            }}
            contentContainerStyle={{ paddingBottom: 100 }}
          />
        )}
      </View>

      <CreateClubModal 
        visible={createModalVisible} 
        onClose={() => setCreateModalVisible(false)}
        onCreated={(newClubId) => {
          setCreateModalVisible(false);
          navigation.navigate('ClubDetails', { clubId: newClubId });
        }}
      />
    </SafeAreaView>
  );
};

const getStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 2,
  },
  createBtn: {
    backgroundColor: colors.brand,
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: 20,
    flex: 1,
  },
  sectionTitle: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 10,
    marginTop: 10,
  },
  searchRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    backgroundColor: colors.surface,
    color: colors.text,
    padding: 12,
    borderRadius: 8,
    fontSize: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchBtn: {
    backgroundColor: colors.brand,
    width: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  clubCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: 16,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  clubIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(212, 255, 0, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  clubImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  clubInfo: {
    flex: 1,
  },
  clubName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  clubType: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1,
  },
  emptyText: {
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 40,
  },
  visitText: {
    color: colors.brand,
    fontSize: 10,
    fontWeight: '600',
    marginTop: 4,
  }
});

export default ClubsScreen;
