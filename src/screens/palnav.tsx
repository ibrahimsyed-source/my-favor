import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TurnByTurn } from '../components/TurnByTurn';
import { getCurrentLocation } from '../lib/location';
import { openTurnByTurn } from '../lib/navigation-links';
import { useStore } from '../store';

// In-app turn-by-turn for the Favor Pal (Mapbox Navigation SDK). Pushed from
// the booked/in-progress screens' "Get Directions" instead of the old handoff
// to Apple/Google Maps — the pal keeps the app (and the GPS broadcast to the
// member) in the foreground for the whole drive. The deep-link ladder stays as
// the escape hatch when the route request fails or GPS won't fix.
//
// Dark-provider palette, pinned like pal.tsx (shared useTheme() is light-only).
const PAGE_BG = '#0D0A0A';
const TEXT = '#FFFFFF';
const SUBTLE = '#B9B4B4';
const CTA_BG = '#FFFFFF';
const CTA_TEXT = '#0D0A0A';
const P400 = 'Poppins_400Regular';
const P500 = 'Poppins_500Medium';
const P600 = 'Poppins_600SemiBold';

export const TurnByTurnScreen = ({ navigation, route }: any) => {
  const { favorId, lat, lng, address } = route.params ?? {};
  const s = useStore();
  const insets = useSafeAreaInsets();
  // One-shot GPS fix for the route's origin. null = still locating.
  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(null);
  const [error, setError] = useState('');
  const hasDest = typeof lat === 'number' && typeof lng === 'number';

  // Defensive: pushed without a destination — nothing to navigate to.
  useEffect(() => {
    if (!hasDest && navigation.canGoBack()) navigation.goBack();
  }, [hasDest]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let alive = true;
    void getCurrentLocation().then((fix) => {
      if (!alive) return;
      if (fix) setOrigin(fix);
      else setError("We couldn't get your current location, so we can't start navigation here.");
    });
    return () => { alive = false; };
  }, []);

  // The favor ended under us mid-drive (member canceled, or it completed from
  // another surface) — pop back; the screen below shows its own ended state.
  const gone = !!favorId && s.activePalFavor?.id !== favorId;
  useEffect(() => {
    if (gone && navigation.canGoBack()) navigation.goBack();
  }, [gone]); // eslint-disable-line react-hooks/exhaustive-deps

  const leave = () => { if (navigation.canGoBack()) navigation.goBack(); };
  // Escape hatch: hand off to the device's maps app after an in-app failure.
  const openMapsApp = async () => {
    await openTurnByTurn({ lat, lng, address });
    leave();
  };

  if (!hasDest) return <View style={{ flex: 1, backgroundColor: PAGE_BG }} />;

  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: PAGE_BG, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Text style={{ color: TEXT, fontSize: 18, fontFamily: P600, textAlign: 'center' }}>Navigation unavailable</Text>
        <Text style={{ color: SUBTLE, fontSize: 14, fontFamily: P400, textAlign: 'center', marginTop: 8, lineHeight: 21 }}>
          {error}
        </Text>
        <TouchableOpacity
          style={{ backgroundColor: CTA_BG, borderRadius: 8, height: 48, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', marginTop: 24 }}
          accessibilityRole="button"
          accessibilityLabel="Open in your maps app"
          onPress={() => { void openMapsApp(); }}
        >
          <Text style={{ color: CTA_TEXT, fontSize: 15, fontFamily: P500 }}>OPEN IN MAPS APP</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={leave} hitSlop={10} accessibilityRole="button" accessibilityLabel="Go back" style={{ marginTop: 20 }}>
          <Text style={{ color: SUBTLE, fontSize: 14, fontFamily: P500 }}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!origin) {
    return (
      <View style={{ flex: 1, backgroundColor: PAGE_BG, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <ActivityIndicator color={TEXT} />
        <Text style={{ color: SUBTLE, fontSize: 14, fontFamily: P400, marginTop: 16 }}>Finding your location…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: PAGE_BG, paddingBottom: insets.bottom }}>
      <TurnByTurn
        origin={origin}
        destination={{ lat, lng, address }}
        destinationName={s.activePalFavor?.id === favorId ? s.activePalFavor?.memberName : undefined}
        // Arrival doesn't advance the favor — the pal confirms "I AM HERE"
        // themselves on the screen below (GPS arrival can be wrong).
        onArrive={leave}
        onCancel={leave}
        onError={() => setError("We couldn't load a route to the favor location.")}
      />
    </View>
  );
};
