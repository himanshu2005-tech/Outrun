import React, { useRef, useState, useEffect } from 'react';
import { View, Text, Animated, StyleSheet, PanResponder, ActivityIndicator, Dimensions, TouchableWithoutFeedback, Vibration } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Svg, { Circle } from 'react-native-svg';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface StartRunButtonProps {
  title?: string;
  onPress: () => void;
  isRunning?: boolean;
  disabled?: boolean;
  loading?: boolean;
}

const { width } = Dimensions.get('window');
const SLIDER_WIDTH = width - 40;
const THUMB_SIZE = 48;
const PADDING = 4;
const MAX_DRAG = SLIDER_WIDTH - THUMB_SIZE - (PADDING * 2);

// SVG Circle properties for the Hold-To-Stop ring
const RING_SIZE = 72;
const RING_STROKE = 4;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export const StartRunButton: React.FC<StartRunButtonProps> = ({ title, onPress, isRunning, disabled, loading }) => {
  const { colors, theme } = useTheme();
  const isDark = theme === 'dark';

  // --- SWIPE TO START STATE ---
  const pan = useRef(new Animated.ValueXY()).current;
  const [isSwiping, setIsSwiping] = useState(false);

  // --- HOLD TO STOP STATE ---
  const holdProgress = useRef(new Animated.Value(0)).current;
  const holdScale = useRef(new Animated.Value(1)).current;
  const [isHolding, setIsHolding] = useState(false);
  const holdTimeout = useRef<NodeJS.Timeout | null>(null);

  // Reset animations if loading finishes or isRunning changes
  useEffect(() => {
    if (!loading || isRunning) {
      Animated.spring(pan, {
        toValue: { x: 0, y: 0 },
        useNativeDriver: false,
      }).start();
    }
    if (!isRunning) {
      holdProgress.setValue(0);
      holdScale.setValue(1);
    }
  }, [loading, isRunning]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (holdTimeout.current) clearTimeout(holdTimeout.current);
    };
  }, []);

  // --- PAN RESPONDER (SWIPE TO START) ---
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabled && !loading && !isRunning,
      onPanResponderGrant: () => {
        setIsSwiping(true);
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dx > 0 && gestureState.dx < MAX_DRAG) {
          pan.setValue({ x: gestureState.dx, y: 0 });
        } else if (gestureState.dx >= MAX_DRAG) {
          pan.setValue({ x: MAX_DRAG, y: 0 });
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        setIsSwiping(false);
        if (gestureState.dx > MAX_DRAG * 0.75) {
          Animated.timing(pan, {
            toValue: { x: MAX_DRAG, y: 0 },
            duration: 150,
            useNativeDriver: false
          }).start(() => {
            Vibration.vibrate(50);
            onPress();
          });
        } else {
          Animated.spring(pan, {
            toValue: { x: 0, y: 0 },
            friction: 6,
            tension: 50,
            useNativeDriver: false,
          }).start();
        }
      }
    })
  ).current;

  // --- HOLD TO STOP HANDLERS ---
  const handleHoldIn = () => {
    if (disabled || loading) return;
    setIsHolding(true);
    
    // Scale up the inner button slightly
    Animated.spring(holdScale, {
      toValue: 0.9,
      useNativeDriver: true,
    }).start();

    // Draw the progress ring
    Animated.timing(holdProgress, {
      toValue: 1,
      duration: 1200,
      useNativeDriver: false, // strokeDashoffset doesn't reliably support native driver on all SVGs
    }).start(({ finished }) => {
      if (finished) {
        Vibration.vibrate(50);
        onPress();
      }
    });
  };

  const handleHoldOut = () => {
    if (disabled || loading) return;
    setIsHolding(false);

    // Spring back scale
    Animated.spring(holdScale, {
      toValue: 1,
      useNativeDriver: true,
    }).start();

    // Retract the progress ring
    Animated.spring(holdProgress, {
      toValue: 0,
      useNativeDriver: false,
    }).start();
  };

  // --- SHARED STYLES ---
  const trackBorder = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
  const trackBg = isDark ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.5)';

  if (isRunning) {
    // --- HOLD TO STOP RENDER ---
    const strokeDashoffset = holdProgress.interpolate({
      inputRange: [0, 1],
      outputRange: [RING_CIRCUMFERENCE, 0],
    });
    
    const textOpacity = holdProgress.interpolate({
      inputRange: [0, 0.2],
      outputRange: [1, 0],
      extrapolate: 'clamp'
    });

    return (
      <View style={styles.holdContainer}>
        <TouchableWithoutFeedback onPressIn={handleHoldIn} onPressOut={handleHoldOut} disabled={disabled || loading}>
          <View style={styles.holdButtonWrap}>
            {/* SVG Progress Ring */}
            <Svg width={RING_SIZE} height={RING_SIZE} style={styles.svgRing}>
              <Circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_RADIUS}
                stroke={trackBorder}
                strokeWidth={RING_STROKE}
                fill="none"
              />
              <AnimatedCircle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_RADIUS}
                stroke={colors.error}
                strokeWidth={RING_STROKE}
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                fill="none"
                rotation="-90"
                origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
              />
            </Svg>

            {/* Inner Button */}
            <Animated.View style={[
              styles.holdInnerBtn,
              { 
                backgroundColor: trackBg,
                transform: [{ scale: holdScale }] 
              }
            ]}>
              {loading ? (
                <ActivityIndicator color={colors.error} />
              ) : (
                <Ionicons name="square" size={20} color={colors.error} />
              )}
            </Animated.View>
          </View>
        </TouchableWithoutFeedback>
        
        <Animated.Text style={[styles.holdText, { opacity: textOpacity, color: colors.textSecondary }]}>
          HOLD TO STOP
        </Animated.Text>
      </View>
    );
  }

  // --- SWIPE TO START RENDER ---
  const textOpacity = pan.x.interpolate({
    inputRange: [0, MAX_DRAG / 2],
    outputRange: [1, 0],
    extrapolate: 'clamp'
  });

  const fillWidth = pan.x.interpolate({
    inputRange: [0, MAX_DRAG],
    outputRange: [THUMB_SIZE + PADDING * 2, SLIDER_WIDTH],
    extrapolate: 'clamp'
  });

  const displayTitle = title || 'SWIPE TO START';

  return (
    <View style={[styles.container, { width: SLIDER_WIDTH }]}>
      <View style={[styles.track, { borderColor: trackBorder, backgroundColor: trackBg }]}>
        <Animated.View style={[
          styles.fill,
          {
            width: fillWidth,
            backgroundColor: isDark ? 'rgba(255, 107, 26, 0.15)' : 'rgba(255, 107, 26, 0.1)',
          }
        ]} />

        <Animated.View style={[styles.textContainer, { opacity: textOpacity }]} pointerEvents="none">
          <Text style={[styles.text, { color: colors.textSecondary }]}>
            {loading ? 'PROCESSING...' : displayTitle}
          </Text>
        </Animated.View>

        <Animated.View
          {...panResponder.panHandlers}
          style={[
            styles.thumb,
            {
              backgroundColor: colors.brand,
              transform: [{ translateX: pan.x }],
              opacity: (disabled && !loading) ? 0.5 : 1
            }
          ]}
        >
          {loading ? (
            <ActivityIndicator color={isDark ? '#000' : '#FFF'} size="small" />
          ) : (
            <Ionicons name="arrow-forward" size={18} color={isDark ? '#000' : '#FFF'} />
          )}
        </Animated.View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  // Shared & Swipe Styles
  container: {
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
  },
  track: {
    width: '100%',
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 28,
  },
  textContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 4,
  },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: 24,
    position: 'absolute',
    left: 4,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  
  // Hold-to-Stop Styles
  holdContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    height: 100,
  },
  holdButtonWrap: {
    width: RING_SIZE,
    height: RING_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  svgRing: {
    position: 'absolute',
  },
  holdInnerBtn: {
    width: RING_SIZE - (RING_STROKE * 4),
    height: RING_SIZE - (RING_STROKE * 4),
    borderRadius: (RING_SIZE - (RING_STROKE * 4)) / 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  holdText: {
    marginTop: 12,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
  }
});
