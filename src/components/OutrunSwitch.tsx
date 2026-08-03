import React, { useEffect, useRef } from 'react';
import { TouchableOpacity, Animated, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

interface OutrunSwitchProps {
  value: boolean;
  onValueChange: (val: boolean) => void;
  disabled?: boolean;
}

export const OutrunSwitch: React.FC<OutrunSwitchProps> = ({ value, onValueChange, disabled }) => {
  const { colors } = useTheme();
  
  // Apple iOS switch dimensions
  const TRACK_WIDTH = 50;
  const TRACK_HEIGHT = 30;
  const THUMB_SIZE = 26;
  
  const translateX = useRef(new Animated.Value(value ? TRACK_WIDTH - THUMB_SIZE - 2 : 2)).current;
  const bgColor = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateX, {
        toValue: value ? TRACK_WIDTH - THUMB_SIZE - 2 : 2,
        useNativeDriver: false,
        bounciness: 4,
        speed: 14,
      }),
      Animated.timing(bgColor, {
        toValue: value ? 1 : 0,
        duration: 200,
        useNativeDriver: false,
      })
    ]).start();
  }, [value]);

  const backgroundColor = bgColor.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.border, colors.brand] // Inactive: border color, Active: brand color
  });

  return (
    <TouchableOpacity 
      activeOpacity={0.8} 
      disabled={disabled}
      onPress={() => onValueChange(!value)}
    >
      <Animated.View style={[
        styles.track, 
        { 
          width: TRACK_WIDTH, 
          height: TRACK_HEIGHT, 
          borderRadius: TRACK_HEIGHT / 2,
          backgroundColor,
          opacity: disabled ? 0.5 : 1
        }
      ]}>
        <Animated.View style={[
          styles.thumb,
          {
            width: THUMB_SIZE,
            height: THUMB_SIZE,
            borderRadius: THUMB_SIZE / 2,
            backgroundColor: '#FFFFFF', // Thumb is always crisp white for that classic iOS look
            transform: [{ translateX }]
          }
        ]} />
      </Animated.View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  track: {
    justifyContent: 'center',
  },
  thumb: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  }
});
