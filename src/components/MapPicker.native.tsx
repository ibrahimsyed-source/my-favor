import React, { useEffect, useRef } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import MapView, { Region } from 'react-native-maps';
import type { MapPickerProps } from './MapPicker';

// MapPicker — NATIVE implementation. Full-bleed, genuinely pannable MapView
// (Apple Maps on iOS — no Google pod/key needed) with the classic center-pin
// pattern: the pin stays fixed over the map center and the member drags the
// map underneath it. onCenterChange fires when a pan settles so the caller can
// reverse-geocode the new position into the address field.
//
// Deliberately UNCONTROLLED (initialRegion only): passing a controlled `region`
// snaps the map back on every re-render, which reads as "I can't move the map"
// (the exact bug this replaces). External moves (a picked suggestion) animate
// via the ref instead, and are told apart from the user's own pans by comparing
// against the last region this component itself reported.
const PICK_DELTA = 0.011; // ≈ zoom 15, street scale
// ~11 m: wide enough to absorb camera-settle float drift (Mercator round-trips,
// pre-layout initialRegion fitting), narrow enough that any real pan passes.
const EPS = 1e-4;

const PIN_AVATAR = require('../../assets/img/request/pin-avatar.png');

export const MapPicker: React.FC<MapPickerProps> = ({ center, onCenterChange, pinAvatar }) => {
  const mapRef = useRef<MapView>(null);
  const lastReported = useRef<{ lat: number; lng: number }>(center);

  // External center change (suggestion picked) → glide the map there. Skip when
  // the new prop just echoes the center we ourselves reported from a user pan.
  useEffect(() => {
    const echo =
      Math.abs(center.lat - lastReported.current.lat) < EPS &&
      Math.abs(center.lng - lastReported.current.lng) < EPS;
    if (echo) return;
    lastReported.current = center;
    mapRef.current?.animateToRegion(
      { latitude: center.lat, longitude: center.lng, latitudeDelta: PICK_DELTA, longitudeDelta: PICK_DELTA },
      350,
    );
  }, [center.lat, center.lng]);

  const onRegionChangeComplete = (r: Region, details?: { isGesture?: boolean }) => {
    const c = { lat: r.latitude, lng: r.longitude };
    // Programmatic settles — initial layout, animateToRegion — must never read
    // as user pans (react-native-maps fires this on mount with no gesture, and
    // the settled camera center drifts from the requested one). The library
    // marks them isGesture:false; record where the camera actually settled so
    // the echo bookkeeping stays coherent, and bail. The EPS distance check
    // below is the fallback for providers that omit `details`.
    if (details?.isGesture === false) {
      lastReported.current = c;
      return;
    }
    const moved =
      Math.abs(c.lat - lastReported.current.lat) > EPS ||
      Math.abs(c.lng - lastReported.current.lng) > EPS;
    if (!moved) return;
    lastReported.current = c;
    onCenterChange?.(c);
  };

  return (
    <View style={StyleSheet.absoluteFill}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={{
          latitude: center.lat,
          longitude: center.lng,
          latitudeDelta: PICK_DELTA,
          longitudeDelta: PICK_DELTA,
        }}
        onRegionChangeComplete={onRegionChangeComplete}
        showsCompass={false}
        toolbarEnabled={false}
      />
      {/* Fixed center pin (user-pin 100:8288 visual: red ring + avatar). The
          wrapper ignores touches so it never swallows map gestures; translateY
          lifts the ring so its visual anchor sits on the exact center. */}
      <View pointerEvents="none" style={styles.pinLayer}>
        <View style={styles.pinRing}>
          <Image
            source={pinAvatar ? { uri: pinAvatar } : PIN_AVATAR}
            style={{ width: 32, height: 32, borderRadius: 16 }}
          />
        </View>
        <View style={styles.pinStem} />
        <View style={styles.pinDot} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  pinLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinRing: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 4,
    borderColor: '#ED1C24',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    // Ring + 8px stem + 4px dot: shift up so the dot marks the true center.
    transform: [{ translateY: -26 }],
  },
  pinStem: {
    width: 2,
    height: 8,
    backgroundColor: '#ED1C24',
    transform: [{ translateY: -26 }],
  },
  pinDot: {
    position: 'absolute',
    top: '50%',
    marginTop: -2,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ED1C24',
  },
});

export default MapPicker;
