import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, Image, ActivityIndicator } from 'react-native';
import { getFirestore, doc, getDoc } from '@react-native-firebase/firestore';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useTheme } from '../theme/ThemeContext';
import { useNavigation } from '@react-navigation/native';

interface UserListModalProps {
  visible: boolean;
  onClose: () => void;
  userIds: string[];
  title: string;
}

export const UserListModal: React.FC<UserListModalProps> = ({ visible, onClose, userIds, title }) => {
  const { colors } = useTheme();
  const navigation = useNavigation<any>();
  const s = React.useMemo(() => getStyles(colors), [colors]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible && userIds.length > 0) {
      fetchUsers();
    } else {
      setUsers([]);
    }
  }, [visible, userIds]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const db = getFirestore();
      const promises = userIds.map(id => getDoc(doc(db, 'users', id)));
      const docs = await Promise.all(promises);
      setUsers(docs.filter(d => d.exists).map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const handleUserPress = (id: string) => {
    onClose();
    navigation.push('UserProfile', { userId: id });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={s.overlay}>
        <View style={s.modal}>
          <View style={s.header}>
            <Text style={s.title}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={s.closeBtn}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
          
          <ScrollView contentContainerStyle={s.list}>
            {loading ? (
              <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
            ) : userIds.length === 0 || users.length === 0 ? (
              <Text style={s.emptyText}>No users found</Text>
            ) : (
              users.map(u => (
                <TouchableOpacity key={u.id} style={s.userRow} onPress={() => handleUserPress(u.id)}>
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
                      {u.isPrivate && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                          <Ionicons name="lock-closed" size={10} color={colors.textSecondary} />
                          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Private</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
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
});
