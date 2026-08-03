import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, Image, ActivityIndicator } from 'react-native';
import { getFirestore, doc, getDoc, updateDoc, arrayUnion, arrayRemove } from '@react-native-firebase/firestore';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useTheme } from '../theme/ThemeContext';
import Button from './Button';

interface FollowRequestsModalProps {
  visible: boolean;
  onClose: () => void;
  userId: string;
  requestIds: string[];
}

export const FollowRequestsModal: React.FC<FollowRequestsModalProps> = ({ visible, onClose, userId, requestIds }) => {
  const { colors } = useTheme();
  const s = React.useMemo(() => getStyles(colors), [colors]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible && requestIds.length > 0) {
      fetchUsers();
    } else {
      setUsers([]);
    }
  }, [visible, requestIds]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const db = getFirestore();
      const promises = requestIds.map(id => getDoc(doc(db, 'users', id)));
      const docs = await Promise.all(promises);
      setUsers(docs.filter(d => d.exists).map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const handleAccept = async (requesterId: string) => {
    try {
      const db = getFirestore();
      // Remove from requests, add to followers
      await updateDoc(doc(db, 'users', userId), {
        followRequests: arrayRemove(requesterId),
        followers: arrayUnion(requesterId)
      });
      // Add me to their following
      await updateDoc(doc(db, 'users', requesterId), {
        following: arrayUnion(userId)
      });
      
      // Update local state to remove from list instantly
      setUsers(prev => prev.filter(u => u.id !== requesterId));
    } catch (e) {
      console.error(e);
    }
  };

  const handleDecline = async (requesterId: string) => {
    try {
      const db = getFirestore();
      await updateDoc(doc(db, 'users', userId), {
        followRequests: arrayRemove(requesterId)
      });
      // Update local state
      setUsers(prev => prev.filter(u => u.id !== requesterId));
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={s.overlay}>
        <View style={s.modal}>
          <View style={s.header}>
            <Text style={s.title}>Follow Requests</Text>
            <TouchableOpacity onPress={onClose} style={s.closeBtn}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
          
          <ScrollView contentContainerStyle={s.list}>
            {loading ? (
              <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
            ) : requestIds.length === 0 || users.length === 0 ? (
              <Text style={s.emptyText}>No pending requests</Text>
            ) : (
              users.map(u => (
                <View key={u.id} style={s.userRow}>
                  <View style={s.userInfo}>
                    {u.photoURL || u.profile_pic ? (
                      <Image source={{ uri: u.photoURL || u.profile_pic }} style={s.avatar} />
                    ) : (
                      <View style={s.avatarPlaceholder}>
                        <Text style={s.avatarInitial}>{u.firstName?.[0] || '?'}</Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={s.userName}>{u.firstName} {u.lastName}</Text>
                    </View>
                  </View>
                  <View style={s.actions}>
                    <Button 
                      title="ACCEPT" 
                      variant="primary" 
                      onPress={() => handleAccept(u.id)} 
                      style={s.btn}
                      textStyle={s.btnText}
                    />
                    <Button 
                      title="DECLINE" 
                      variant="ghost" 
                      onPress={() => handleDecline(u.id)} 
                      style={s.btn}
                      textStyle={s.btnText}
                    />
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const getStyles = (colors: any) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    minHeight: '60%',
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  closeBtn: {
    padding: 4,
  },
  list: {
    padding: 20,
  },
  emptyText: {
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 40,
    fontSize: 15,
  },
  userRow: {
    flexDirection: 'column',
    gap: 12,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  userName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  btn: {
    flex: 1,
    height: 36,
  },
  btnText: {
    fontSize: 12,
  },
});
