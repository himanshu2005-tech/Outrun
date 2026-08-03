import React, { useRef, useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

interface OtpInputProps {
  code: string;
  setCode: (code: string) => void;
  maxLength?: number;
}

const OtpInput: React.FC<OtpInputProps> = ({ code, setCode, maxLength = 6 }) => {
  const { colors } = useTheme();
  const styles = React.useMemo(() => getStyles(colors), [colors]);
  const inputRef = useRef<TextInput>(null);
  const [isFocused, setIsFocused] = useState(false);

  const handlePress = () => {

    inputRef.current?.focus();
  };

  const codeDigitsArray = new Array(maxLength).fill(0);

  const toDigitInput = (_value: number, index: number) => {
    const digit = code[index] || '';
    const isCurrentDigit = index === code.length;
    const isLastDigit = index === maxLength - 1;
    const isCodeFull = code.length === maxLength;
    const isFocusedBox = isFocused && (isCurrentDigit || (isLastDigit && isCodeFull));
    const hasDigt = digit !== '';

    return (
      <View
        key={index}
        style={[
          styles.box,
          isFocusedBox && styles.focusedBox,
          hasDigt && styles.filledBox,
        ]}
      >
        <Text style={[styles.digitText, hasDigt && styles.filledDigitText]}>
          {digit || '—'}
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Pressable style={styles.boxesContainer} onPress={handlePress}>
        {codeDigitsArray.map(toDigitInput)}
      </Pressable>
      <TextInput
        ref={inputRef}
        value={code}
        onChangeText={setCode}
        maxLength={maxLength}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        style={styles.hiddenInput}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
      />
    </View>
  );
};

const getStyles = (colors: any) => StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
    width: '100%',
  },
  boxesContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  box: {
    width: 44,
    height: 52,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  focusedBox: {
    borderBottomColor: colors.primary,
    borderBottomWidth: 2,
  },
  filledBox: {
    borderBottomColor: colors.textSecondary,
  },
  digitText: {
    fontSize: 20,
    color: colors.textMuted,
    fontWeight: '300',
    letterSpacing: 1,
  },
  filledDigitText: {
    color: colors.text,
    fontWeight: '400',
  },
  hiddenInput: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
});

export default OtpInput;
