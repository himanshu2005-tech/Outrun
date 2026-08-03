import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { getAuth } from '@react-native-firebase/auth';
import { getFirestore, collection, query, where, onSnapshot, doc, deleteDoc } from '@react-native-firebase/firestore';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useTheme } from '../theme/ThemeContext';
import { showAlert } from './CustomAlert';
import { OutrunModal } from './OutrunModal';

export const MyRunsModal = ({ visible, onClose, onSelectRun }: { visible: boolean, onClose: () => void, onSelectRun: (run: any) => void }) => {
  const { colors } = useTheme();
  const s = React.useMemo(() => getStyles(colors), [colors]);
  const [runs, setRuns] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let unsubscribe: () => void;
    if (visible) {
      const user = getAuth().currentUser;
      if (user) {
        setLoading(true);
        unsubscribe = onSnapshot(
          query(collection(getFirestore(), 'runs'), where('userId', '==', user.uid)),
          (snapshot) => {
            const fetchedRuns: any[] = [];
            snapshot.forEach(d => fetchedRuns.push({ id: d.id, ...d.data() }));
            fetchedRuns.sort((a, b) => b.createdAt - a.createdAt);
            setRuns(fetchedRuns);
            setLoading(false);
          },
          (error) => {
            console.log("Error fetching runs:", error);
            setLoading(false);
          }
        );
      }
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [visible]);

  const handleDelete = (runId: string) => {
    showAlert(
      "Delete Run?",
      "Are you sure you want to permanently delete this run?",
      [
        { text: "CANCEL", style: "cancel" },
        { 
          text: "DELETE", 
          style: "destructive", 
          onPress: async () => {
            try {
              await deleteDoc(doc(getFirestore(), 'runs', runId));
            } catch (e) {
              console.log("Error deleting run:", e);
              showAlert("Error", "Could not delete run.");
            }
          } 
        }
      ]
    );
  };

  return (
    <OutrunModal 
      visible={visible} 
      onClose={onClose} 
      title="MY RUNS" 
      subtitle={`${runs.length} ${runs.length === 1 ? 'activity' : 'activities'} logged`}
      height="85%"
    >
      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color={colors.brand} size="large" />
        </View>
      ) : runs.length === 0 ? (
        <View style={s.center}>
          <View style={s.emptyIconWrap}>
            <Ionicons name="flash-off-outline" size={40} color={colors.textSecondary} />
          </View>
          <Text style={s.noRunsText}>No runs recorded yet</Text>
          <Text style={s.noRunsSubtext}>Your completed runs will show up here</Text>
        </View>
      ) : (
        <FlatList
          data={runs}
          keyExtractor={item => item.id}
          contentContainerStyle={s.listContainer}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          renderItem={({ item }) => {
            const dateObj = new Date(item.createdAt);
            const dayStr = dateObj.toLocaleDateString(undefined, { weekday: 'short' });
            const dateStr = dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            const distanceKm = item.totalDistanceMeters / 1000;
            const distanceStr = distanceKm.toFixed(2);
            const m = Math.floor(item.durationSeconds / 60);
            const sec = Math.floor(item.durationSeconds % 60);
            const timeStr = `${m}:${sec.toString().padStart(2, '0')}`;

            const paceStr = distanceKm > 0
              ? (() => {
                  const paceSecPerKm = item.durationSeconds / distanceKm;
                  const pm = Math.floor(paceSecPerKm / 60);
                  const ps = Math.floor(paceSecPerKm % 60);
                  return `${pm}:${ps.toString().padStart(2, '0')}`;
                })()
              : '—';

            return (
              <TouchableOpacity
                style={s.listItem}
                activeOpacity={0.75}
                onPress={() => {
                  onSelectRun(item);
                  onClose();
                }}
              >
                <View style={s.cardTop}>
                  <View style={s.listLeft}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.runTitle} numberOfLines={1}>{item.title || 'Outrun'}</Text>
                      <View style={s.dateBlockRow}>
                        <Text style={s.dateDay}>{dayStr}</Text>
                        <Text style={s.dateNum}>{dateStr.split(' ')[1]}</Text>
                        <Text style={s.dateMonth}>{dateStr.split(' ')[0]}</Text>
                      </View>
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <TouchableOpacity 
                      onPress={() => handleDelete(item.id)}
                      style={{ padding: 8, marginRight: 8 }}
                    >
                      <Ionicons name="trash-outline" size={20} color="#FF3B30" />
                    </TouchableOpacity>
                    <View style={s.iconBadge}>
                      <Ionicons name="flash" size={16} color={colors.brand} />
                    </View>
                  </View>
                </View>

                <View style={s.divider} />

                <View style={s.statsRow}>
                  <View style={s.statBlock}>
                    <Text style={s.statValue}>{distanceStr}</Text>
                    <Text style={s.statLabel}>KM</Text>
                  </View>
                  <View style={s.statDivider} />
                  <View style={s.statBlock}>
                    <Text style={s.statValue}>{timeStr}</Text>
                    <Text style={s.statLabel}>TIME</Text>
                  </View>
                  <View style={s.statDivider} />
                  <View style={s.statBlock}>
                    <Text style={s.statValue}>{paceStr}</Text>
                    <Text style={s.statLabel}>/KM PACE</Text>
                  </View>

                  <View style={s.chevronWrap}>
                    <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </OutrunModal>
  );
};

const getStyles = (colors: any) => StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  listItem: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  listLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  runTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 6,
  },
  dateBlockRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateDay: {
    color: colors.brand,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginRight: 6,
  },
  dateNum: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
    marginRight: 4,
  },
  dateMonth: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: `${colors.brand}20`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statBlock: {
    flex: 1,
  },
  statValue: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 4,
  },
  statLabel: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: colors.border,
    marginHorizontal: 15,
  },
  chevronWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  noRunsText: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 8,
  },
  noRunsSubtext: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
});