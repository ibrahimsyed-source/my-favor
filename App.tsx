import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, Text, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
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
  Poppins_400Regular,
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
      html, body, #root { font-family: "Poppins_400Regular", system-ui, -apple-system, sans-serif; }
    `;
    document.head.appendChild(style);
    // Force the embedded icon font to load immediately so icons paint on first
    // render instead of lazily (avoids a brief blank-glyph flash).
    if (document.fonts && typeof document.fonts.load === 'function') {
      document.fonts.load('16px "Ionicons"').catch(() => {});
    }
  }, []);
}

// Catches any render/runtime error in the tree so a single exception shows a
// friendly recoverable screen instead of white-screening the whole app.
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: unknown) {
    // eslint-disable-next-line no-console
    console.error('App crashed:', error);
  }
  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#FFFFFF' }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#1A1A1A', textAlign: 'center' }}>
            Something went wrong
          </Text>
          <Text style={{ fontSize: 15, color: '#68707F', textAlign: 'center', marginTop: 8 }}>
            Please close and reopen the app. If it keeps happening, let us know.
          </Text>
          <TouchableOpacity
            onPress={() => this.setState({ hasError: false })}
            style={{ marginTop: 20, backgroundColor: '#ED1C24', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 999 }}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Try again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
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
    Poppins_400Regular,
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
    <ErrorBoundary>
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
    </ErrorBoundary>
  );
}
