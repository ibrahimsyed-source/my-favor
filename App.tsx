import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  useFonts,
  Roboto_400Regular,
  Roboto_500Medium,
  Roboto_700Bold,
} from '@expo-google-fonts/roboto';
import {
  OpenSans_400Regular,
  OpenSans_600SemiBold,
  OpenSans_700Bold,
} from '@expo-google-fonts/open-sans';
import {
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins';

import { ThemeProvider } from './src/theme';
import { StoreProvider } from './src/store';
import RootNavigator from './src/navigation';
import { IONICONS_TTF_BASE64 } from './src/assets/ioniconsFont';

// On web, (1) embed the Ionicons glyph font directly as a data URI so icons never
// depend on a static host serving the deep vendor font file (Netlify drops it →
// tofu rectangles); (2) strip the browser's default input focus outline; and
// (3) give unstyled text a sensible default family. Injected once.
function useWebGlobalStyles() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const style = document.createElement('style');
    style.textContent = `
      @font-face {
        font-family: 'Ionicons';
        src: url(data:font/ttf;base64,${IONICONS_TTF_BASE64}) format('truetype');
        font-weight: normal; font-style: normal; font-display: block;
      }
      input, textarea, select, [contenteditable] { outline: none !important; }
      input:focus, textarea:focus { outline: none !important; box-shadow: none !important; }
      /* Default any unstyled text to the brand body font (custom-styled <Txt> keeps its own). */
      html, body, #root { font-family: "OpenSans_400Regular", system-ui, -apple-system, sans-serif; }
    `;
    document.head.appendChild(style);
    // Force the embedded icon font to load immediately so icons paint on first
    // render instead of lazily (avoids a brief blank-glyph flash).
    if (document.fonts && typeof document.fonts.load === 'function') {
      document.fonts.load('16px "Ionicons"').catch(() => {});
    }
  }, []);
}

export default function App() {
  useWebGlobalStyles();
  const [fontsLoaded] = useFonts({
    Roboto_400Regular,
    Roboto_500Medium,
    Roboto_700Bold,
    OpenSans_400Regular,
    OpenSans_600SemiBold,
    OpenSans_700Bold,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
    // Note: the Ionicons glyph font is provided via the embedded @font-face above
    // (web) and auto-loaded by @expo/vector-icons on native — no preload here.
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <StoreProvider>
          <NavigationContainer>
            <StatusBar style="dark" />
            <RootNavigator />
          </NavigationContainer>
        </StoreProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
