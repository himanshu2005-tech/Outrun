import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Modal, Animated } from 'react-native';
import Button from './Button';
import { useTheme } from '../theme/ThemeContext';

export interface AlertConfig {
  title: string;
  message: string;
  buttons?: { text: string; onPress?: () => void; style?: 'cancel' | 'default' | 'destructive' }[];
}

let globalShowAlert: ((config: AlertConfig) => void) | null = null;

export const showAlert = (title: string, message: string, buttons?: AlertConfig['buttons']) => {
  if (globalShowAlert) {
    globalShowAlert({ title, message, buttons });
  } else {
    import('react-native').then(({ Alert }) => {
      Alert.alert(title, message, buttons);
    });
  }
};

export const GlobalAlert = () => {
  const { colors } = useTheme();
  const styles = React.useMemo(() => getStyles(colors), [colors]);
  const [config, setConfig] = useState<AlertConfig | null>(null);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    globalShowAlert = (newConfig) => {
      setConfig(newConfig);
      Animated.timing(anim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    };
    return () => {
      globalShowAlert = null;
    };
  }, [anim]);

  const close = (onPress?: () => void) => {
    Animated.timing(anim, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      setConfig(null);
      if (onPress) onPress();
    });
  };

  if (!config) return null;

  const defaultButtons = [{ text: 'OK', onPress: () => {} }];
  const buttonsToRender = config.buttons || defaultButtons;

  return (
    <Modal transparent visible={true} animationType="none">
      <View style={styles.overlay}>
        <Animated.View 
          style={[
            styles.alertBox, 
            { 
              opacity: anim, 
              transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) }] 
            }
          ]}
        >
          <Text style={styles.title}>{config.title}</Text>
          <Text style={styles.message}>{config.message}</Text>
          
          <View style={styles.buttonRow}>
            {buttonsToRender.map((btn, index) => (
              <View key={index} style={{ flex: 1, marginLeft: index > 0 ? 8 : 0 }}>
                <Button
                  variant={btn.style === 'destructive' ? 'danger' : btn.style === 'cancel' ? 'ghost' : 'primary'}
                  title={btn.text}
                  onPress={() => close(btn.onPress)}
                  style={{ width: '100%', height: 44 }}
                />
              </View>
            ))}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

const getStyles = (colors: any) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  alertBox: {
    width: '100%',
    backgroundColor: colors.background,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.brand,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  message: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 24,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    width: '100%',
  },
});
