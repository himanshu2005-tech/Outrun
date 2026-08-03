import React from 'react';
import { TextInput, TextInputProps, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

interface InputProps extends TextInputProps {
  style?: ViewStyle;
}

const Input: React.FC<InputProps> = ({ style, ...rest }) => {
  const { colors } = useTheme();
  const styles = React.useMemo(() => getStyles(colors), [colors]);

  return (
    <TextInput
      style={[styles.input, style]}
      placeholderTextColor={colors.textMuted}
      selectionColor={colors.textSecondary}
      {...rest}
    />
  );
};

const getStyles = (colors: any) => StyleSheet.create({
  input: {
    height: 52,
    backgroundColor: colors.surfaceLight,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    color: colors.text,
    fontSize: 16,
    fontWeight: '500',
    letterSpacing: 0.5,
  },
});

export default Input;
