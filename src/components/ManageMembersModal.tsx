import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, FlatList, TouchableOpacity, ActivityIndicator, Image, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { getFirestore, collection, query, where, getDocs, limit, startAfter, doc, deleteDoc, updateDoc, arrayUnion, arrayRemove } from '@react-native-firebase/firestore';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useTheme } from '../theme/ThemeContext';
import { showAlert } from './CustomAlert';
import { Dimensions } from 'react-native';

interface ManageMembersModalProps {
  visible: boolean;
  club: any;
  isManager?: boolean;
  onClose: () => void;
  onNavigateProfile?: (userId: string) => void;
}

const ManageMembersModal: React.FC<ManageMembersModalProps> = ({ visible, club, isManager, onClose, onNavigateProfile }) => {
  const { colors } = useTheme();
  const s = React.useMemo(() => getStyles(colors), [colors]);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastDoc, setLastDoc] = useState<any>(null);
  const [hasMore, setHasMore] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const [viewMode, setViewMode] = useState<'members' | 'blocked'>('members');
  const [blockedUsers, setBlockedUsers] = useState<any[]>([]);

  const db = getFirestore();

  const clubId = club?.id;

  useEffect(() => {
    if (visible && clubId) {
      fetchMembers(true);
      if (isManager && club.blockedUsers && club.blockedUsers.length > 0) {
        fetchBlockedUsers(club.blockedUsers);
      } else {
        setBlockedUsers([]);
      }
    } else {
      setMembers([]);
      setBlockedUsers([]);
      setLastDoc(null);
      setHasMore(true);
      setSearchQuery('');
      setViewMode('members');
    }
  }, [visible, clubId, isManager]);

  const fetchBlockedUsers = async (userIds: string[]) => {
    try {
      const bUsers: any[] = [];
      for (let i = 0; i < userIds.length; i += 10) {
         const chunk = userIds.slice(i, i + 10);
         const usersQ = query(collection(db, 'users'), where('__name__', 'in', chunk));
         const usersSnapshot = await getDocs(usersQ);
         usersSnapshot.docs.forEach(docSnap => {
            const data = docSnap.data();
            bUsers.push({
              userId: docSnap.id,
              firstName: data.firstName || 'Unknown',
              lastName: data.lastName || '',
              photoURL: data.photoURL || data.profile_pic || null,
            });
         });
      }
      setBlockedUsers(bUsers);
    } catch(e) {
      console.error(e);
    }
  };

  const fetchMembers = async (isInitial = false) => {
    if (!club) return;
    if (!isInitial && (loadingMore || !hasMore)) return;

    if (isInitial) setLoading(true);
    else setLoadingMore(true);

    try {
      let q = query(
        collection(db, 'clubMembers'),
        where('clubId', '==', club.id),
        limit(20)
      );

      if (!isInitial && lastDoc) {
        q = query(
          collection(db, 'clubMembers'),
          where('clubId', '==', club.id),
          startAfter(lastDoc),
          limit(20)
        );
      }

      const snapshot = await getDocs(q);
      const newMembers: any[] = [];
      
      if (!snapshot.empty) {
        const userIds = snapshot.docs.map(d => d.data().userId);
        
        const usersQ = query(collection(db, 'users'), where('__name__', 'in', userIds));
        const usersSnapshot = await getDocs(usersQ);
        const userMap = new Map();
        usersSnapshot.docs.forEach(doc => {
          userMap.set(doc.id, doc.data());
        });

        snapshot.docs.forEach(d => {
          const data = d.data();
          const userData = userMap.get(data.userId) || {};
          newMembers.push({
            id: d.id, // clubMembers doc id
            userId: data.userId,
            role: data.role,
            firstName: userData.firstName || 'Unknown',
            lastName: userData.lastName || '',
            photoURL: userData.photoURL || userData.profile_pic || null,
          });
        });

        setLastDoc(snapshot.docs[snapshot.docs.length - 1]);
        if (isInitial) {
          setMembers(newMembers);
        } else {
          setMembers(prev => [...prev, ...newMembers]);
        }
      }

      if (snapshot.docs.length < 20) {
        setHasMore(false);
      }
    } catch (error) {
      console.error(error);
      showAlert('Error', 'Failed to load members.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleBlock = (member: any) => {

    showAlert('Block User', `Are you sure you want to block ${member.firstName} ${member.lastName}? They will be removed from the club and unable to join again.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Block', style: 'destructive', onPress: async () => {
          try {
            setLoading(true);
            
            await deleteDoc(doc(db, 'clubMembers', member.id));
            
            await updateDoc(doc(db, 'clubs', club.id), {
              blockedUsers: arrayUnion(member.userId)
            });

            setMembers(prev => prev.filter(m => m.id !== member.id));
            showAlert('Blocked', 'User has been blocked successfully.');
          } catch (e) {
            console.error(e);
            showAlert('Error', 'Failed to block user.');
          } finally {
            setLoading(false);
          }
      }}
    ]);
  };

  const handleUnblock = (user: any) => {
    showAlert('Unblock User', `Are you sure you want to unblock ${user.firstName}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Unblock', style: 'default', onPress: async () => {
          try {
            setLoading(true);
            await updateDoc(doc(db, 'clubs', club.id), {
              blockedUsers: arrayRemove(user.userId)
            });
            setBlockedUsers(prev => prev.filter(u => u.userId !== user.userId));
            showAlert('Unblocked', 'User has been unblocked successfully.');
          } catch (e) {
            console.error(e);
            showAlert('Error', 'Failed to unblock user.');
          } finally {
            setLoading(false);
          }
      }}
    ]);
  };

  const filteredMembers = members.filter(m => {
    const fullName = `${m.firstName} ${m.lastName}`.toLowerCase();
    return fullName.includes(searchQuery.toLowerCase());
  });

  const filteredBlocked = blockedUsers.filter(u => {
    const fullName = `${u.firstName} ${u.lastName}`.toLowerCase();
    return fullName.includes(searchQuery.toLowerCase());
  });

  const activeData = viewMode === 'members' ? filteredMembers : filteredBlocked;

  return (
        <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.container}>
        
        <View style={s.headerMinimal}>
          <TouchableOpacity onPress={onClose} style={s.closeBtn}>
            <Ionicons name="close" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={s.headerTitleMinimal}>MEMBERS</Text>
        </View>
        

        {isManager && (
          <View style={s.tabsContainer}>
            <TouchableOpacity 
              style={[s.tab, viewMode === 'members' && s.activeTab]}
              onPress={() => setViewMode('members')}
            >
              <Text style={[s.tabText, viewMode === 'members' && s.activeTabText]}>Members</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[s.tab, viewMode === 'blocked' && s.activeTab]}
              onPress={() => setViewMode('blocked')}
            >
              <Text style={[s.tabText, viewMode === 'blocked' && s.activeTabText]}>Blocked ({blockedUsers.length})</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={s.searchContainer}>
          <Ionicons name="search" size={18} color={colors.textSecondary} style={s.searchIcon} />
          <TextInput
            style={s.searchInput}
            placeholder={viewMode === 'members' ? "Search members..." : "Search blocked..."}
            placeholderTextColor={colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {loading && activeData.length === 0 ? (
          <ActivityIndicator size="large" color={colors.brand} style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            data={activeData}
            keyExtractor={item => item.id || item.userId}
            numColumns={3}
            columnWrapperStyle={s.gridRow}
            contentContainerStyle={s.listContent}
            onEndReached={() => {
              if (viewMode === 'members' && !searchQuery) {
                fetchMembers();
              }
            }}
            onEndReachedThreshold={0.5}
            ListFooterComponent={
              loadingMore ? <ActivityIndicator size="small" color={colors.brand} style={{ margin: 20 }} /> : null
            }
            ListEmptyComponent={
              <View style={s.emptyState}>
                <Ionicons name="people-outline" size={32} color={colors.border} style={{marginBottom: 12}} />
                <Text style={s.emptyText}>{searchQuery ? 'No members found' : 'No members yet'}</Text>
              </View>
            }
            renderItem={({ item }) => (
              <View style={s.gridItem}>
                <TouchableOpacity 
                  style={s.gridAvatarWrapper}
                  activeOpacity={onNavigateProfile ? 0.7 : 1}
                  onPress={() => onNavigateProfile && onNavigateProfile(item.userId)}
                >
                  {item.photoURL ? (
                    <Image source={{ uri: item.photoURL }} style={s.gridAvatar} />
                  ) : (
                    <View style={s.gridAvatarPlaceholder}>
                      <Ionicons name="person" size={28} color={colors.background} />
                    </View>
                  )}
                  {item.role === 'manager' && (
                    <View style={s.gridBadge}>
                      <Ionicons name="star" size={10} color={colors.background} />
                    </View>
                  )}
                </TouchableOpacity>
                <Text style={s.gridName} numberOfLines={1}>{item.firstName}</Text>
                
                {viewMode === 'members' ? (
                  isManager && item.role !== 'manager' && (
                    <TouchableOpacity style={s.gridBlockBtn} onPress={() => handleBlock(item)}>
                      <Text style={s.gridBlockBtnText}>BLOCK</Text>
                    </TouchableOpacity>
                  )
                ) : (
                  <TouchableOpacity style={s.gridBlockBtn} onPress={() => handleUnblock(item)}>
                    <Text style={s.gridBlockBtnText}>UNBLOCK</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          />
        )}
            </KeyboardAvoidingView>
    </Modal>
  );
};

const { width } = Dimensions.get('window');

const getStyles = (colors: any) => StyleSheet.create({
  headerMinimal: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 30,
    paddingBottom: 20,
  },
  closeBtn: {
    padding: 8,
    marginLeft: -8,
  },
  headerTitleMinimal: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 1,
    marginLeft: 12,
  },
  gridRow: {
    gap: 12,
    justifyContent: 'flex-start',
    marginBottom: 24,
  },
  gridItem: {
    width: (width - 40 - 24) / 3, // padding: 20 (x2), gap: 12 (x2)
    alignItems: 'center',
  },
  gridAvatarWrapper: {
    position: 'relative',
    marginBottom: 8,
  },
  gridAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.surface,
  },
  gridAvatarPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.brand,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: colors.brand,
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.background,
  },
  gridName: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 6,
  },
  gridBlockBtn: {
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  gridBlockBtnText: {
    color: colors.textSecondary,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
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
  searchContainer: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    position: 'relative',
    justifyContent: 'center',
  },
  searchIcon: {
    position: 'absolute',
    left: 28,
    zIndex: 1,
  },
  searchInput: {
    backgroundColor: colors.background,
    color: colors.text,
    padding: 12,
    paddingLeft: 40,
    borderRadius: 24,
    fontSize: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  memberLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceLight,
  },
  memberAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.brand,
    justifyContent: 'center',
    alignItems: 'center',
  },
  memberName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  roleText: {
    color: colors.brand,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  blockBtn: {
    backgroundColor: 'rgba(255, 59, 48, 0.12)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.3)',
    minWidth: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blockBtnText: {
    color: '#FF3B30',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  unblockBtn: {
    backgroundColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unblockBtnText: {
    color: colors.text,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  tabsContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: colors.brand,
  },
  tabText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  activeTabText: {
    color: colors.brand,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
});

export default ManageMembersModal;
