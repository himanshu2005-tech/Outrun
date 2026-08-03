import React, { useEffect, useRef } from 'react';
import { Animated } from 'react-native';

interface AnimatedListItemProps {
  children: React.ReactNode;
  index: number;
  delayPerItem?: number;
}

export const AnimatedListItem: React.FC<AnimatedListItemProps> = ({ 
  children, 
  index, 
  delayPerItem = 50 
}) => {
  const translateY = useRef(new Animated.Value(20)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 300,
        delay: index * delayPerItem,
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        speed: 12,
        bounciness: 4,
        delay: index * delayPerItem,
        useNativeDriver: true,
      })
    ]).start();
  }, [index, delayPerItem]);

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  );
};
