import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useTheme } from '../theme/ThemeContext';
import { OutrunModal } from './OutrunModal';

export type MapStyleType = 'outrun' | 'standard' | 'satellite' | 'terrain';

interface MapStyleModalProps {
  visible: boolean;
  onClose: () => void;
  currentStyle: MapStyleType;
  onSelectStyle: (style: MapStyleType) => void;
}

const mapStyles: { id: MapStyleType; label: string; icon: string }[] = [
  { id: 'outrun', label: 'OUTRUN (DARK)', icon: 'flash' },
  { id: 'standard', label: 'STANDARD', icon: 'map' },
  { id: 'satellite', label: 'SATELLITE', icon: 'earth' },
  { id: 'terrain', label: 'TERRAIN', icon: 'leaf' },
];

export const MapStyleModal: React.FC<MapStyleModalProps> = ({ visible, onClose, currentStyle, onSelectStyle }) => {
  const { colors } = useTheme();
  const s = React.useMemo(() => getStyles(colors), [colors]);

  return (
    <OutrunModal visible={visible} onClose={onClose} title="MAP STYLE" height="55%">
      <ScrollView contentContainerStyle={s.listContainer} showsVerticalScrollIndicator={false}>
        {mapStyles.map((style) => {
          const isActive = currentStyle === style.id;
          return (
            <TouchableOpacity
              key={style.id}
              style={[s.listItem, isActive && s.listActive]}
              activeOpacity={0.7}
              onPress={() => {
                onSelectStyle(style.id);
                onClose();
              }}
            >
              <View style={s.listLeft}>
                <View style={[s.iconBadge, { backgroundColor: isActive ? `${colors.brand}15` : colors.border }]}>
                  <Ionicons name={style.icon} size={20} color={isActive ? colors.brand : colors.textSecondary} />
                </View>
                <Text style={[s.listText, isActive && { color: colors.brand }]}>{style.label}</Text>
              </View>
              {isActive && <Ionicons name="checkmark" size={24} color={colors.brand} />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </OutrunModal>
  );
};

const getStyles = (colors: any) => StyleSheet.create({
  listContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  listItem: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
  },
  listActive: {
    borderColor: colors.brand,
    borderWidth: 1,
  },
  listLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  listText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
