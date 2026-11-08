import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { tokens } from '../theme';
import { getDirectionsApi } from '../api/endpoints';
import { decodePolyline, haversineMiles } from '../lib/geo';
import type { LiveMapMarker, LiveMapProps } from './LiveMap';

// LiveMap — NATIVE implementation (iOS/Android). Renders a real, interactive
// react-native-maps MapView with a destination pin (the member's initials when
// provided) plus the pal's live GPS as a navy car bubble that GLIDES between
// poll fixes (Uber-style) instead of teleporting, joined by the real driving
// route in brand red. Metro selects this file over LiveMap.tsx on native
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

const WHITE = '#FFFFFF';
const NAVY = '#252A38'; // MapScene's car-bubble navy
const PIN_RED = '#ED1C24'; // v.2 brand red (destination pin)
const ROUTE_RED = '#D40000'; // brand route red
const P600 = 'Poppins_600SemiBold';

// --- directions (driving route pal -> destination) -------------------------
// A fix older than this is frozen, not live — same rule as the tracking
// screen's palLocFresh; a route from a stale origin would be fiction.
const PAL_FRESH_MS = 2 * 60 * 1000;
// Refetch the route when the pal moved >150m from the last fetch's origin OR
// the last fetch is >60s old (traffic drift) — never otherwise, so identical
// segments within the server's 30s cache window aren't even requested.
const ROUTE_REFETCH_M = 150;
const ROUTE_REFETCH_MS = 60 * 1000;
// A stationary pal never changes the effect deps, so a light interval re-runs
// the same check to honor the 60s rule; most ticks bail without a request.
const ROUTE_CHECK_MS = 15 * 1000;
const METERS_PER_MILE = 1609.344;

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
  // Let the bubble rasterize, then stop tracking child view changes —
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
      {/* The pal en route is a CAR — same bubble language as MapScene's 'car'
          marker (navy circle, white car icon), gliding between poll fixes. */}
      <View style={st.carBubble}>
        <Ionicons name="car" size={18} color={WHITE} />
      </View>
    </Marker>
  );
};

// Destination pin carrying the MEMBER's initials — the v.2 avatar-ring pin
// silhouette (brand-red bubble + small triangle pointer) so the member reads
// "that's me / my spot" at a glance instead of an anonymous red pin.
const InitialsDestinationPin: React.FC<{ lat: number; lng: number; initials: string }> = ({
  lat,
  lng,
  initials,
}) => {
  // Same rasterize-then-freeze pattern as the other custom markers; re-arm
  // when the initials change so the frozen bitmap refreshes.
  const [tracks, setTracks] = useState(true);
  useEffect(() => {
    setTracks(true);
    const t = setTimeout(() => setTracks(false), 1000);
    return () => clearTimeout(t);
  }, [initials]);
  return (
    <Marker
      coordinate={{ latitude: lat, longitude: lng }}
      anchor={{ x: 0.5, y: 1 }}
      tracksViewChanges={tracks}
    >
      <View style={{ alignItems: 'center' }}>
        <View style={st.destBubble}>
          <Text style={st.destInitials}>{initials}</Text>
        </View>
        <View style={st.destPointer} />
      </View>
    </Marker>
  );
};

export const LiveMap: React.FC<LiveMapProps> = ({
  lat,
  lng,
  markers,
  height = 240,
  zoom = 14,
  initials,
  onRouteInfo,
  routingEnabled = true,
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

  // --- driving route: pal -> destination (brand-red line + real ETA) --------
  // Decoded route points; null = no line (server soft-degraded, fetch failed,
  // or no fresh origin). Silent either way — the map just shows no route.
  const [routePts, setRoutePts] = useState<{ lat: number; lng: number }[] | null>(null);
  const lastFetch = useRef<{ olat: number; olng: number; dlat: number; dlng: number; at: number } | null>(null);
  const fetching = useRef(false);
  // Monotonic fetch token: a resolve from an outdated flight (inputs went
  // stale / routing disabled / newer fetch started) must not redraw the line.
  const fetchSeq = useRef(0);
  // Latest inputs/callback in refs so the pacing interval and the dep-driven
  // effect share ONE check without re-subscribing per render (the host may
  // pass an inline onRouteInfo lambda).
  const onRouteInfoRef = useRef(onRouteInfo);
  onRouteInfoRef.current = onRouteInfo;
  const routeInputs = useRef({ pal, lat, lng, routingEnabled });
  routeInputs.current = { pal, lat, lng, routingEnabled };

  const checkRoute = async () => {
    const { pal: p, lat: dLat, lng: dLng, routingEnabled: enabled } = routeInputs.current;
    // Route only while the host still wants routing (en-route phases; an
    // arrived/finished trip would refetch forever for a result nothing shows)
    // and only from a FRESH pal fix to a real destination — `at` missing or
    // <=2min old counts as fresh (tracking's palLocFresh rule).
    const fresh = p != null && (p.at == null || Date.now() - p.at <= PAL_FRESH_MS);
    if (enabled === false || dLat == null || dLng == null || !p || !fresh) {
      // No honest origin — invalidate any in-flight result, drop the drawn
      // line, AND tell the host (stale route info must not drive a fake ETA);
      // clearing lastFetch makes the next fresh fix refetch immediately.
      fetchSeq.current += 1;
      lastFetch.current = null;
      if (mounted.current) {
        setRoutePts((cur) => {
          if (cur !== null) onRouteInfoRef.current?.(null);
          return null;
        });
      }
      return;
    }
    const prev = lastFetch.current;
    const movedM = prev ? haversineMiles(p.lat, p.lng, prev.olat, prev.olng) * METERS_PER_MILE : Infinity;
    const destMovedM = prev ? haversineMiles(dLat, dLng, prev.dlat, prev.dlng) * METERS_PER_MILE : Infinity;
    if (prev && movedM <= ROUTE_REFETCH_M && destMovedM <= 50 && Date.now() - prev.at <= ROUTE_REFETCH_MS) return;
    if (fetching.current) return;
    fetching.current = true;
    const seq = ++fetchSeq.current;
    // Stamp at request time so a failed fetch is paced by the 60s rule too,
    // never retried hot on every poll render. Keyed by BOTH endpoints: a
    // destination change must refetch even when the pal hasn't moved.
    lastFetch.current = { olat: p.lat, olng: p.lng, dlat: dLat, dlng: dLng, at: Date.now() };
    try {
      const res = await getDirectionsApi(p.lat, p.lng, dLat, dLng);
      // Discard outdated flights: unmounted, superseded, or inputs invalidated.
      if (!mounted.current || seq !== fetchSeq.current) return;
      setRoutePts(res.route && res.route.polyline ? decodePolyline(res.route.polyline) : null);
      onRouteInfoRef.current?.(
        res.route
          ? { durationSec: res.route.durationSec, distanceMeters: res.route.distanceMeters }
          : null,
      );
    } catch {
      // Network/server failure — same soft degrade as route:null (silent).
      if (!mounted.current || seq !== fetchSeq.current) return;
      setRoutePts(null);
      onRouteInfoRef.current?.(null);
    } finally {
      fetching.current = false;
    }
  };
  const checkRouteRef = useRef(checkRoute);
  checkRouteRef.current = checkRoute;

  // Re-check when the fix or destination moves (each 4s poll lands new pal
  // coords) — the >150m / >60s rules inside decide whether to actually fetch.
  useEffect(() => {
    void checkRouteRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pal?.lat, pal?.lng, pal?.at, lat, lng]);
  // …and on a timer, so a STATIONARY pal (unchanged deps) still refreshes the
  // route/ETA once the last fetch ages past 60s.
  useEffect(() => {
    const iv = setInterval(() => { void checkRouteRef.current(); }, ROUTE_CHECK_MS);
    return () => clearInterval(iv);
  }, []);

  const routeCoords = useMemo(
    () => (routePts ? routePts.map((p) => ({ latitude: p.lat, longitude: p.lng })) : null),
    [routePts],
  );

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
        {/* Driving route pal -> destination — drawn before the markers (and at
            zIndex 0) so the car/pin bubbles stay on top. No route = no line. */}
        {routeCoords && routeCoords.length > 1 ? (
          <Polyline coordinates={routeCoords} strokeWidth={4} strokeColor={ROUTE_RED} zIndex={0} />
        ) : null}
        {/* Primary pin — the favor / pickup location (red). With the member's
            initials it becomes the v.2 initials pin; without, the default pin. */}
        {initials ? (
          <InitialsDestinationPin lat={lat} lng={lng} initials={initials} />
        ) : (
          <Marker coordinate={{ latitude: lat, longitude: lng }} pinColor={PIN_RED} />
        )}
        {/* The pal's live position — the navy car bubble, gliding. A stable
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

const st = StyleSheet.create({
  // Pal en route — 34pt navy car bubble (MapScene's car-marker language).
  carBubble: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: NAVY,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: WHITE,
  },
  // Destination — brand-red bubble with the member's initials…
  destBubble: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: PIN_RED,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: WHITE,
  },
  destInitials: { fontFamily: P600, fontSize: 13, color: WHITE },
  // …over a small triangle pointer (the v.2 avatar-ring pin silhouette).
  destPointer: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: PIN_RED,
  },
});

export default LiveMap;
