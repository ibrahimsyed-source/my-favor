import React, { createContext, useContext, useMemo, useState } from 'react';
import { lightTheme, darkTheme, AppTheme } from './colors';
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

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isDark, setIsDark] = useState(false);
  const value = useMemo(
    () => ({
      theme: isDark ? darkTheme : lightTheme,
      isDark,
      toggleDark: () => setIsDark((d) => !d),
    }),
    [isDark]
  );
  return React.createElement(ThemeContext.Provider, { value }, children);
};

export const useTheme = () => useContext(ThemeContext);

export const tokens = { typography, spacing, radius, shadow };
