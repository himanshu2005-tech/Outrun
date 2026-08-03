import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, ViewStyle, TextStyle, TouchableOpacityProps, Animated, Vibration } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

interface ButtonProps extends TouchableOpacityProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  loading?: boolean;
  style?: ViewStyle | ViewStyle[];
  textStyle?: TextStyle | TextStyle[];
}

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

const Button: React.FC<ButtonProps> = ({ 
  title, 
  onPress, 
  variant = 'primary', 
  loading = false, 
  style, 
  textStyle,
  disabled,
  ...rest 
}) => {
  const { colors, theme } = useTheme();
  const styles = React.useMemo(() => getStyles(colors, theme), [colors, theme]);

  const isPrimary = variant === 'primary';
  const isSecondary = variant === 'secondary';
  const isDanger = variant === 'danger';
  const isGhost = variant === 'ghost';

  const scaleAnim = React.useRef(new Animated.Value(1)).current;

  const handlePressIn = (e: any) => {
    Animated.spring(scaleAnim, {
      toValue: 0.96,
      useNativeDriver: true,
      speed: 20,
      bounciness: 10,
    }).start();
    rest.onPressIn?.(e);
  };

  const handlePressOut = (e: any) => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 20,
      bounciness: 10,
    }).start();
    rest.onPressOut?.(e);
  };

  const handlePress = (e: any) => {
    if (!disabled && !loading) {
      Vibration.vibrate(20); // Super subtle premium haptic tap
      onPress(e);
    }
  };

  return (
    <AnimatedTouchableOpacity
      style={[
        styles.button,
        isPrimary && styles.primaryBackground,
        isSecondary && styles.secondaryBackground,
        isDanger && styles.dangerBackground,
        isGhost && styles.ghostBackground,
        (disabled || loading) && styles.disabled,
        style,
        { transform: [{ scale: scaleAnim }] }
      ]}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled || loading}
      activeOpacity={0.8}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? colors.brand : (isDanger ? colors.error : colors.textSecondary)} />
      ) : (
        <Text
          style={[
            styles.text,
            isPrimary && styles.primaryText,
            isSecondary && styles.secondaryText,
            isDanger && styles.dangerText,
            isGhost && styles.ghostText,
            textStyle,
          ]}
        >
          {title}
        </Text>
      )}
    </AnimatedTouchableOpacity>
  );
};

const getStyles = (colors: any, theme: string) => StyleSheet.create({
  button: {
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    borderRadius: 26, // Fully rounded pill shape
  },
  primaryBackground: {
    backgroundColor: `${colors.brand}25`, // Semi-transparent brand color
    borderWidth: 1,
    borderColor: `${colors.brand}80`, // Subtle vibrant border
  },
  secondaryBackground: {
    backgroundColor: `${colors.textSecondary}15`,
    borderWidth: 1,
    borderColor: `${colors.textSecondary}30`,
  },
  dangerBackground: {
    backgroundColor: `${colors.error}25`,
    borderWidth: 1,
    borderColor: `${colors.error}80`,
  },
  ghostBackground: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border,
  },
  disabled: {
    opacity: 0.4,
  },
  text: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  primaryText: {
    color: colors.brand,
    textShadowColor: theme === 'dark' ? `${colors.brand}80` : 'transparent',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: theme === 'dark' ? 10 : 0, // Glowing text effect only in dark mode
  },
  secondaryText: {
    color: colors.textSecondary,
  },
  dangerText: {
    color: colors.error,
    textShadowColor: theme === 'dark' ? `${colors.error}80` : 'transparent',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: theme === 'dark' ? 10 : 0,
  },
  ghostText: {
    color: colors.text,
  },
});

export default Button;
