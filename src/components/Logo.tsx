import React from 'react';
import { Text, StyleSheet, ViewStyle, TextStyle, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

interface LogoProps {
  containerStyle?: ViewStyle;
  textStyle?: TextStyle;
  text?: string;
}

const Logo: React.FC<LogoProps> = ({ containerStyle, textStyle, text = "OUTRUN" }) => {
  const { colors } = useTheme();
  const styles = React.useMemo(() => getStyles(colors), [colors]);

  return (
    <View style={[styles.container, containerStyle]}>
      <Text style={[styles.logoText, textStyle]}>{text}</Text>
      <View style={styles.line} />
    </View>
  );
};

const getStyles = (colors: any) => StyleSheet.create({
  container: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logoText: {
    fontSize: 28,
    fontWeight: '200',
    color: colors.primary,
    letterSpacing: 16,
  },
  line: {
    width: 32,
    height: 1,
    backgroundColor: colors.textMuted,
    marginTop: 16,
  },
});

export default Logo;
