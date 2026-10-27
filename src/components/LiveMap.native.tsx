import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { tokens } from '../theme';
import { PalMarkerBadge } from './PalMarker';
import type { LiveMapMarker, LiveMapProps } from './LiveMap';

// LiveMap — NATIVE implementation (iOS/Android). Renders a real, interactive
// react-native-maps MapView with a marker at the primary location plus the pal's
// live GPS as a My Favor logo badge that GLIDES between poll fixes (Uber-style)
// instead of teleporting. Metro selects this file over LiveMap.tsx on native
// platforms; web falls back to the StaticMap image (see LiveMap.tsx).
//
// Deliberately UNCONTROLLED (initialRegion only): passing a controlled `region`
// snaps the map back on every re-render — e.g. each 4s active-favor poll — which
// reads as "the map is frozen". External centre changes glide via the ref
// instead (same pattern as MapPicker.native / MapScene.native).
const EPS = 1e-4; // ~11 m — ignore float-drift "moves"
// One glide per 4s poll tick: long enough to read as motion, short enough to
// finish before the next fix lands. ~30fps is indistinguishable at map scale
// and halves the marker re-commits.
const GLIDE_MS = 1200;
const FRAME_MS = 32;
// Skip the two-point auto-fit when the pal is basically at the destination
// (arrived) — fitting two near-identical points zooms to max.
const NEAR_DEG = 0.0015; // ~165 m

// Tween a coordinate toward its latest target so the pal's marker moves like a
// vehicle instead of jumping on every poll tick. The first fix snaps straight
// to position; later fixes ease out from wherever the marker currently sits.
function useGlidingCoord(lat: number, lng: number) {
  const [pos, setPos] = useState({ lat, lng });
  const posRef = useRef(pos);
  posRef.current = pos;
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (raf.current != null) cancelAnimationFrame(raf.current);
    const from = posRef.current;
    if (Math.abs(from.lat - lat) < EPS && Math.abs(from.lng - lng) < EPS) return;
    const start = Date.now();
    let lastFrame = 0;
    const step = () => {
      const now = Date.now();
      const t = Math.min(1, (now - start) / GLIDE_MS);
      if (t === 1 || now - lastFrame >= FRAME_MS) {
        lastFrame = now;
        const e = t * (2 - t); // ease-out
        setPos({ lat: from.lat + (lat - from.lat) * e, lng: from.lng + (lng - from.lng) * e });
      }
      raf.current = t < 1 ? requestAnimationFrame(step) : null;
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current != null) cancelAnimationFrame(raf.current);
    };
  }, [lat, lng]);

  return pos;
}

// Separate component so the tween's ~30fps setState re-renders only this
// marker, never the whole MapView subtree.
const GlidingPalMarker: React.FC<{ m: LiveMapMarker }> = ({ m }) => {
  const pos = useGlidingCoord(m.lat, m.lng);
  // Let the badge image rasterize, then stop tracking child view changes —
  // Android re-renders custom marker children on every frame otherwise.
  const [tracks, setTracks] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setTracks(false), 1000);
    return () => clearTimeout(t);
  }, []);
  return (
    <Marker
      coordinate={{ latitude: pos.lat, longitude: pos.lng }}
      title={m.label}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={tracks}
    >
      <PalMarkerBadge />
    </Marker>
  );
};

export const LiveMap: React.FC<LiveMapProps> = ({
  lat,
  lng,
  markers,
  height = 240,
  zoom = 14,
  children,
}) => {
  const mapRef = useRef<MapView>(null);
  const last = useRef<{ lat: number; lng: number } | null>(
    lat != null && lng != null ? { lat, lng } : null,
  );

  // First extra marker = the pal's live GPS (same convention as LiveMap.tsx).
  const pal = markers && markers.length > 0 ? markers[0] : undefined;

  // One-shot auto-fit bookkeeping: `fitted` latches on first schedule so poll
  // churn can't re-trigger it, `mapReady`/`pendingFit` defer the call until the
  // map can actually honor it (Android no-ops fitToCoordinates pre-ready), and
  // `mounted` keeps the un-cancelled timeout from touching a dead ref.
  const fitted = useRef(false);
  const mapReady = useRef(false);
  const pendingFit = useRef<(() => void) | null>(null);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  useEffect(() => {
    if (lat == null || lng == null) return;
    if (last.current && Math.abs(lat - last.current.lat) < EPS && Math.abs(lng - last.current.lng) < EPS) {
      return;
    }
    last.current = { lat, lng };
    const d = 360 / 2 ** zoom;
    mapRef.current?.animateToRegion(
      { latitude: lat, longitude: lng, latitudeDelta: d, longitudeDelta: d },
      350,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng]);

  // The pal's FIRST fix → fit destination + pal in frame once (both markers
  // visible above the bottom sheet, like a trip overview); after that the
  // member's own pans are never fought. No cleanup on dep change: the one-shot
  // must survive the 4s poll swapping in fresh coordinates mid-delay.
  useEffect(() => {
    if (fitted.current || lat == null || lng == null || !pal) return;
    fitted.current = true;
    // Pal already at the destination (e.g. opened after "arrived") — fitting
    // two near-identical points would zoom to max; keep the default region.
    if (Math.abs(pal.lat - lat) < NEAR_DEG && Math.abs(pal.lng - lng) < NEAR_DEG) return;
    const coords = [
      { latitude: lat, longitude: lng },
      { latitude: pal.lat, longitude: pal.lng },
    ];
    const run = () => {
      if (!mounted.current) return;
      mapRef.current?.fitToCoordinates(coords, {
        edgePadding: { top: 140, left: 90, right: 90, bottom: 400 },
        animated: true,
      });
    };
    if (mapReady.current) setTimeout(run, 350);
    else pendingFit.current = run;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng, pal?.lat, pal?.lng]);

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
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={region}
        rotateEnabled={false}
        pitchEnabled={false}
        showsCompass={false}
        toolbarEnabled={false}
        onMapReady={() => {
          mapReady.current = true;
          if (pendingFit.current) {
            const run = pendingFit.current;
            pendingFit.current = null;
            setTimeout(run, 350);
          }
        }}
      >
        {/* Primary pin — the favor / pickup location (red). */}
        <Marker coordinate={{ latitude: lat, longitude: lng }} pinColor="#ED1C24" />
        {/* The pal's live position — the My Favor logo badge, gliding. A stable
            key keeps the marker mounted across fixes so it moves instead of
            flickering through remounts. */}
        {pal ? <GlidingPalMarker key="pal-live" m={pal} /> : null}
        {/* Any further extra markers (none today) keep the plain blue pin. */}
        {(markers ?? []).slice(1).map((m, i) => (
          <Marker
            key={`extra-${i}`}
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
