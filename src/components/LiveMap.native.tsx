import React from 'react';
import { View, StyleSheet } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { tokens } from '../theme';
import type { LiveMapProps } from './LiveMap';

// LiveMap — NATIVE implementation (iOS/Android). Renders a real, interactive
// react-native-maps MapView with a marker at the primary location plus any extra
// markers (e.g. the pal's live GPS). Metro selects this file over LiveMap.tsx on
// native platforms; web falls back to the StaticMap image (see LiveMap.tsx).
export const LiveMap: React.FC<LiveMapProps> = ({
  lat,
  lng,
  markers,
  height = 240,
  zoom = 14,
  children,
}) => {
  // Nothing to center on yet — render an empty box the same size.
  if (lat == null || lng == null) {
    return <View style={{ height, borderRadius: tokens.radius.lg, overflow: 'hidden', backgroundColor: '#E9EEF3' }} />;
  }

  // Approximate a Google-style zoom level as a lat/lng delta: each zoom step
  // halves the span. z=14 ≈ 0.022° ≈ neighborhood scale.
  const delta = 360 / 2 ** zoom;
  const region = {
    latitude: lat,
    longitude: lng,
    latitudeDelta: delta,
    longitudeDelta: delta,
  };

  return (
    <View style={{ height, borderRadius: tokens.radius.lg, overflow: 'hidden' }}>
      <MapView style={StyleSheet.absoluteFill} initialRegion={region} region={region}>
        {/* Primary pin — the favor / pickup location (red). */}
        <Marker coordinate={{ latitude: lat, longitude: lng }} pinColor="#ED1C24" />
        {/* Extra markers — e.g. the pal's live position (blue). */}
        {(markers ?? []).map((m, i) => (
          <Marker
            key={`${m.lat},${m.lng},${i}`}
            coordinate={{ latitude: m.lat, longitude: m.lng }}
            title={m.label}
            pinColor="#2563EB"
          />
        ))}
      </MapView>
      {children}
    </View>
  );
};

export default LiveMap;
