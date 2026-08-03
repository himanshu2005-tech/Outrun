import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { lightColors, darkColors } from './colors';
import { dbService } from '../services/DatabaseService';

type ThemeType = 'light' | 'dark';

interface ThemeContextData {
  theme: ThemeType;
  colors: typeof darkColors;
  toggleTheme: () => void;
  setTheme: (theme: ThemeType) => void;
}

const ThemeContext = createContext<ThemeContextData>({
  theme: 'dark',
  colors: darkColors,
  toggleTheme: () => {},
  setTheme: () => {},
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const scheme = useColorScheme();
  const systemTheme: ThemeType = (scheme === 'light' || scheme === 'dark') ? scheme : 'dark';
  const [theme, setThemeState] = useState<ThemeType>(systemTheme);

  useEffect(() => {
    const loadTheme = async () => {
      try {
        const savedTheme = await dbService.getSetting('appTheme');
        if (savedTheme === 'light' || savedTheme === 'dark') {
          setThemeState(savedTheme);
        }
      } catch (e) {
        console.error('Failed to load theme:', e);
      }
    };
    loadTheme();
  }, []);

  const toggleTheme = async () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setThemeState(newTheme);
    try {
      await dbService.saveSetting('appTheme', newTheme);
    } catch (e) {
      console.error('Failed to save theme:', e);
    }
  };

  const setTheme = async (newTheme: ThemeType) => {
    setThemeState(newTheme);
    try {
      await dbService.saveSetting('appTheme', newTheme);
    } catch (e) {
      console.error('Failed to save theme:', e);
    }
  };

  const colors = theme === 'light' ? lightColors : darkColors;

  return (
    <ThemeContext.Provider value={{ theme, colors, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
