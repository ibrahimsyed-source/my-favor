import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Circle, Marker } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from './index';
import type { MapSceneMarker, MapSceneProps } from './MapScene';

// MapScene — NATIVE implementation (iOS/Android): a real MapView (Apple Maps on
// iOS, no key needed) that replaces the baked Figma map art the screens keep as
// their web backdrop. Uncontrolled (initialRegion only) so user pans are never
// snapped back; external centre changes glide via the ref, same pattern as
// MapPicker.native. Markers reproduce the v.2 pin visuals (red teardrops, price
// tags, avatar ring) so the screens still read as the Figma frames.
export const MAP_SCENE_SUPPORTED = true;

const RED = '#D40000';
const WHITE = '#FFFFFF';
const NAVY = '#252A38';
const P500 = 'Poppins_500Medium';

// ~11 m — treat smaller centre changes as echoes, not real moves.
const EPS = 1e-4;

const SceneMarker: React.FC<{ m: MapSceneMarker; index: number }> = ({ m, index }) => {
  const coordinate = { latitude: m.lat, longitude: m.lng };
  const key = `${m.kind ?? 'pin'}-${index}`;
  switch (m.kind) {
    case 'pal':
      return <Marker key={key} coordinate={coordinate} pinColor="#2563EB" onPress={m.onPress} />;
    case 'price':
      return (
        <Marker key={key} coordinate={coordinate} anchor={{ x: 0.5, y: 1 }} onPress={m.onPress}>
          <View style={{ alignItems: 'center' }}>
            <View style={st.priceTag}>
              <Text style={st.priceText}>${Math.round(m.price ?? 0)}</Text>
            </View>
            <View style={st.pinTail} />
          </View>
        </Marker>
      );
    case 'avatar':
      return (
        <Marker key={key} coordinate={coordinate} anchor={{ x: 0.5, y: 0.5 }} onPress={m.onPress}>
          <View style={st.avatarRing}>
            <Avatar uri={m.avatarUri} size={33} name={m.avatarName ?? '?'} />
          </View>
        </Marker>
      );
    case 'car':
      return (
        <Marker key={key} coordinate={coordinate} anchor={{ x: 0.5, y: 0.5 }} onPress={m.onPress}>
          <View style={st.carBubble}>
            <Ionicons name="car" size={20} color={WHITE} />
          </View>
        </Marker>
      );
    case 'person':
      return (
        <Marker key={key} coordinate={coordinate} anchor={{ x: 0.5, y: 0.95 }} onPress={m.onPress}>
          <View style={{ width: 46, height: 46 }}>
            <Ionicons name="location" size={46} color={RED} />
            <Ionicons name="person" size={16} color={WHITE} style={{ position: 'absolute', top: 8, left: 15 }} />
          </View>
        </Marker>
      );
    default: // 'pin'
      return (
        <Marker key={key} coordinate={coordinate} anchor={{ x: 0.5, y: 0.95 }} onPress={m.onPress}>
          <Ionicons name="location" size={42} color={RED} />
        </Marker>
      );
  }
};

export const MapScene: React.FC<MapSceneProps> = ({
  center,
  zoom = 14,
  dark,
  interactive = true,
  radiusM,
  scrim,
  markers,
  fit,
}) => {
  const mapRef = useRef<MapView>(null);
  const last = useRef(center);

  // External centre moves (GPS fix lands, favor changes) glide the map there —
  // never re-render into a controlled region, which would cancel user pans.
  useEffect(() => {
    if (!center) return;
    if (
      last.current &&
      Math.abs(center.lat - last.current.lat) < EPS &&
      Math.abs(center.lng - last.current.lng) < EPS
    ) {
      return;
    }
    last.current = center;
    const delta = 360 / 2 ** zoom;
    mapRef.current?.animateToRegion(
      { latitude: center.lat, longitude: center.lng, latitudeDelta: delta, longitudeDelta: delta },
      350,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center?.lat, center?.lng]);

  if (!center) return null;
  const delta = 360 / 2 ** zoom;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={interactive ? 'auto' : 'none'}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={{
          latitude: center.lat,
          longitude: center.lng,
          latitudeDelta: delta,
          longitudeDelta: delta,
        }}
        userInterfaceStyle={dark ? 'dark' : 'light'}
        scrollEnabled={interactive}
        zoomEnabled={interactive}
        rotateEnabled={false}
        pitchEnabled={false}
        showsCompass={false}
        toolbarEnabled={false}
        onMapReady={() => {
          if (fit && fit.length > 1) {
            mapRef.current?.fitToCoordinates(
              fit.map((c) => ({ latitude: c.lat, longitude: c.lng })),
              { edgePadding: { top: 140, left: 70, right: 70, bottom: 340 }, animated: false },
            );
          }
        }}
      >
        {radiusM ? (
          <Circle
            center={{ latitude: center.lat, longitude: center.lng }}
            radius={radiusM}
            fillColor={dark ? 'rgba(255,255,255,0.10)' : 'rgba(13,10,10,0.08)'}
            strokeColor={dark ? 'rgba(255,255,255,0.18)' : 'rgba(13,10,10,0.15)'}
            strokeWidth={1}
          />
        ) : null}
        {(markers ?? []).map((m, i) => (
          <SceneMarker key={`${m.kind ?? 'pin'}-${i}`} m={m} index={i} />
        ))}
      </MapView>
      {scrim ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: scrim }]} />
      ) : null}
    </View>
  );
};

const st = StyleSheet.create({
  priceTag: {
    minWidth: 38,
    height: 26,
    borderRadius: 6,
    backgroundColor: RED,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  priceText: { fontFamily: P500, fontSize: 12, color: WHITE },
  pinTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: RED,
  },
  avatarRing: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: RED,
    alignItems: 'center',
    justifyContent: 'center',
  },
  carBubble: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: NAVY,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.10)',
  },
});

export default MapScene;
