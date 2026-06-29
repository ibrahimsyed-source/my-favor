import React, { createContext, useContext, useMemo } from 'react';
import { lightTheme, AppTheme } from './colors';
import { typography } from './typography';
import { spacing, radius, shadow } from './spacing';

export * from './colors';
export * from './typography';
export * from './spacing';

type ThemeContextValue = {
  theme: AppTheme;
  isDark: boolean;
  toggleDark: () => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: lightTheme,
  isDark: false,
  toggleDark: () => {},
});

// The app ships a single, consistent light theme. (A dark palette still exists
// in ./colors for reference, but there is no in-app toggle — every screen is
// light, so the experience is uniform throughout.)
export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const value = useMemo(
    () => ({ theme: lightTheme, isDark: false, toggleDark: () => {} }),
    []
  );
  return React.createElement(ThemeContext.Provider, { value }, children);
};

export const useTheme = () => useContext(ThemeContext);

export const tokens = { typography, spacing, radius, shadow };
