import React, { useRef, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Dimensions, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

const { width } = Dimensions.get('window');
const ITEM_WIDTH = 50;

interface RulerPickerProps {
  min: number;
  max: number;
  value: number;
  onValueChange: (val: number) => void;
  label: string;
  unit?: string;
}

const RulerPicker: React.FC<RulerPickerProps> = ({ min, max, value, onValueChange, label, unit = '' }) => {
  const { colors } = useTheme();
  const styles = React.useMemo(() => getStyles(colors), [colors]);
  const data = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  const flatListRef = useRef<FlatList>(null);
  const [internalVal, setInternalVal] = useState(value);
  
  // padding so first and last items center perfectly
  const horizontalPadding = width / 2 - ITEM_WIDTH / 2;

  useEffect(() => {
    setInternalVal(value);
    const index = Math.max(0, value - min);
    setTimeout(() => {
      flatListRef.current?.scrollToOffset({ offset: index * ITEM_WIDTH, animated: false });
    }, 100);
  }, [value, min]);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {

    const offsetX = e.nativeEvent.contentOffset.x;
    let index = Math.round(offsetX / ITEM_WIDTH);
    if (index < 0) index = 0;
    if (index >= data.length) index = data.length - 1;
    if (data[index] !== internalVal) {
      setInternalVal(data[index]);
    }
  };

  const handleMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = e.nativeEvent.contentOffset.x;
    let index = Math.round(offsetX / ITEM_WIDTH);
    if (index < 0) index = 0;
    if (index >= data.length) index = data.length - 1;
    onValueChange(data[index]);
  };

  const renderItem = ({ item }: { item: number }) => {
    const isActive = internalVal === item;
    return (
      <View style={styles.item}>
        <Text style={[styles.itemText, isActive && styles.itemTextActive]}>{item}</Text>
        <View style={[styles.tick, item % 5 === 0 ? styles.tickMajor : styles.tickMinor, isActive && styles.tickActive]} />
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        {label} <Text style={styles.valueText}>{internalVal}</Text>
        <Text style={styles.unitText}>{unit}</Text>
      </Text>
      <View style={styles.pickerContainer}>
        <View style={styles.indicator} />
        <FlatList
          ref={flatListRef}
          data={data}
          keyExtractor={(item) => item.toString()}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={ITEM_WIDTH}
          decelerationRate="fast"
          bounces={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          onMomentumScrollEnd={handleMomentumScrollEnd}
          contentContainerStyle={{ paddingHorizontal: horizontalPadding }}
          renderItem={renderItem}
          initialNumToRender={20}
          getItemLayout={(data, index) => ({ length: ITEM_WIDTH, offset: ITEM_WIDTH * index, index })}
        />
      </View>
    </View>
  );
};

const getStyles = (colors: any) => StyleSheet.create({
  container: {
    marginVertical: 12,
    alignItems: 'center',
    width: '100%',
    backgroundColor: colors.surface,
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  valueText: {
    color: colors.brand,
    fontSize: 18,
    fontWeight: '800',
  },
  unitText: {
    color: colors.textSecondary,
    fontSize: 12,
    textTransform: 'lowercase',
  },
  pickerContainer: {
    height: 70,
    width: '100%',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  indicator: {
    position: 'absolute',
    bottom: 0,
    width: 4,
    height: 35,
    backgroundColor: colors.brand,
    borderRadius: 2,
    zIndex: 10,
  },
  item: {
    width: ITEM_WIDTH,
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: 70,
  },
  itemText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  itemTextActive: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 4,
  },
  tick: {
    width: 2,
    backgroundColor: colors.border,
  },
  tickMinor: {
    height: 10,
  },
  tickMajor: {
    height: 18,
  },
  tickActive: {
    backgroundColor: 'transparent',
  }
});

export default RulerPicker;
