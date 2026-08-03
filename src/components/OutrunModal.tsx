import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Animated, Dimensions, TouchableWithoutFeedback, Easing } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useTheme } from '../theme/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface OutrunModalProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  height?: number | string;
}

export const OutrunModal: React.FC<OutrunModalProps> = ({ visible, onClose, title, subtitle, children, height = '85%' }) => {
  const { colors, theme } = useTheme();
  const insets = useSafeAreaInsets();
  const anim = useRef(new Animated.Value(0)).current;

  const [isMounted, setIsMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setIsMounted(true);
      Animated.spring(anim, {
        toValue: 1,
        useNativeDriver: true,
        speed: 14,
        bounciness: 6,
      }).start();
    } else {
      Animated.timing(anim, {
        toValue: 0,
        duration: 250,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }).start(() => {
        setIsMounted(false);
      });
    }
  }, [visible, anim]);

  if (!isMounted) return null;

  const handleClose = () => {
    Animated.timing(anim, {
      toValue: 0,
      duration: 250,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start(() => onClose());
  };

  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [Dimensions.get('window').height, 0],
  });

  const fadeOpacity = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  return (
    <Modal visible={isMounted} transparent animationType="none" onRequestClose={handleClose}>
      <View style={styles.overlayContainer}>
        {/* Backdrop Fade */}
        <TouchableWithoutFeedback onPress={handleClose}>
          <Animated.View style={[styles.backdrop, { opacity: fadeOpacity, backgroundColor: theme === 'light' ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.7)' }]} />
        </TouchableWithoutFeedback>

        {/* Modal Content */}
        <Animated.View style={[styles.modalSheet, { 
            height,
            backgroundColor: colors.background, 
            shadowColor: colors.brand,
            transform: [{ translateY }] 
          }]}
        >
          {/* Drag Handle */}
          <View style={[styles.dragHandle, { backgroundColor: colors.border }]} />

          {/* Unified Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              {title && <Text style={[styles.title, { color: colors.text }]}>{title}</Text>}
              {subtitle && <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{subtitle}</Text>}
            </View>
            <TouchableOpacity onPress={handleClose} style={[styles.closeBtn, { borderWidth: 1, borderColor: colors.border }]} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Inner Content */}
          <View style={[styles.contentContainer, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            {children}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlayContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalSheet: {
    width: '100%',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 24,
    borderTopWidth: 1,
    borderColor: 'rgba(255,107,26,0.15)', // Subtle brand accent on the rim
  },
  dragHandle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contentContainer: {
    flex: 1,
  }
});
