import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, Image, StyleSheet, FlatList, RefreshControl, Modal, ActivityIndicator,
  KeyboardAvoidingView, Linking, Platform, Animated, PanResponder, Dimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFonts, Poppins_400Regular } from '@expo-google-fonts/poppins';
import { Avatar } from '../components';
import { MapScene, MAP_SCENE_SUPPORTED } from '../components/MapScene';
import type { MapSceneMarker } from '../components/MapScene';
import { useStore } from '../store';
import {
  getIncomingApi, makeOfferApi, getFavorOffersApi, counterOfferApi, declineOfferApi, rateMemberApi,
  getFavorApi, getEarningsApi, getDirectionsApi,
} from '../api/endpoints';
import { decodePolyline } from '../lib/geo';
import { GEOCODE_FALLBACK } from '../lib/geocode';
import { openTurnByTurn } from '../lib/navigation-links';
import { TURN_BY_TURN_SUPPORTED } from '../components/TurnByTurn';
import { useSheetDrag } from '../lib/useSheetDrag';
import { computePayout, computeFees, FAVOR_TIERS, Favor, FavorOffer, Transaction } from '../types';

// Favor Pal (provider) active-favor flow — "Provider App v.2" DARK design.
// Palette verified on the v.2 canvas: page/map ink #0D0A0A, navy sheets/modals
// #252A38 (fields a shade lighter #2E3442), white primary buttons w/ black
// Poppins Medium labels, red accents #D40000 (pins/route) + #ED1C24 (brand).
// The app's shared useTheme() is LIGHT and only drives auth/onboarding, so we
// pin the fixed dark palette here.
const PAGE_BG = '#0D0A0A';                 // page / map ink (v.2 provider bg)
const MAP_BG = '#0D0A0A';                  // dark map backdrop base
const SHEET = '#252A38';                   // bottom-sheet / card / modal navy
const SHEET_ALT = '#2E3442';               // raised field / pill / chip (a shade lighter)
const FIELD = '#2E3442';                   // feedback input / dark field
const RED = '#ED1C24';                     // brand red (rows / active chips)
const PIN_RED = '#D40000';                 // map pins + route red
const STAR = '#FFBD00';                    // rating amber
const TEXT = '#FFFFFF';                    // primary text
const SUBTLE = '#B9B4B4';                  // secondary gray (v.2)
const MUTED = 'rgba(255,255,255,0.45)';    // tertiary / placeholder text
const DIVIDER = 'rgba(255,255,255,0.10)';  // hairline dividers
const BORDER = 'rgba(255,255,255,0.10)';   // card / field borders
const SUCCESS = '#02CB00';                 // success checkmark green
const CTA_BG = '#FFFFFF';                  // primary CTA button bg (white-on-dark)
const CTA_TEXT = '#0D0A0A';                // primary CTA label (black)
const DARK_BTN = '#1C2331';                // secondary dark button

// Poppins: 500/600 are registered app-wide in App.tsx; 400 is loaded locally
// per screen (same fallback pattern the other v.2 screens use).
const P400 = 'Poppins_400Regular';
const P500 = 'Poppins_500Medium';
const P600 = 'Poppins_600SemiBold';
function usePoppins() {
  const [loaded] = useFonts({ Poppins_400Regular });
  return loaded;
}

const CELEBRATION = require('../../assets/img/tracking/celebration.png');

// ---- shared dark-map backdrop -------------------------------------------------
// Native: a REAL dark MapView (MapScene) centered on the favor destination (red
// pin) with the pal's live position as the car marker on en-route screens. Web
// keeps the drawn v.2 navy backdrop (react-native-maps has no web support).
// Route refetch threshold: a new directions fetch only once the origin has
// moved >150m from where the last one ran (usePalOriginFix is a one-shot fix,
// so in practice the fetch fires once per mount).
const ROUTE_REFETCH_M = 150;
const METERS_PER_MILE = 1609.344;
// A route drawn FROM a fallback anchor would be fiction — never fetch unless
// the origin is a real GPS fix that isn't one of the known fallback coords.
const isFallbackOrigin = (o: Origin) =>
  (o.lat === PAL_ORIGIN_FALLBACK.lat && o.lng === PAL_ORIGIN_FALLBACK.lng) ||
  (o.lat === GEOCODE_FALLBACK.lat && o.lng === GEOCODE_FALLBACK.lng);

function MapBackdrop({ route, dest }: { route?: boolean; dest?: { lat: number; lng: number } | null }) {
  const { origin, hasFix } = usePalOriginFix();

  // Real driving route pal → destination (Google Routes via the server geo
  // proxy) drawn as the red polyline on the native map. Soft-silent: a null
  // route / proxy error / web simply means no line — exactly how the other
  // geo endpoints degrade.
  const [routePts, setRoutePts] = useState<{ lat: number; lng: number }[] | null>(null);
  // Keyed by BOTH endpoints: a destination change (new favor on the same
  // mounted backdrop) must refetch even when the origin hasn't moved — an
  // origin-only key would pin the old favor's route to the new destination.
  const lastRoute = useRef<{ olat: number; olng: number; dlat: number; dlng: number } | null>(null);
  const wantRoute = MAP_SCENE_SUPPORTED && !!route && !!dest && hasFix && !isFallbackOrigin(origin);
  const destLat = dest?.lat;
  const destLng = dest?.lng;
  useEffect(() => {
    if (!wantRoute || destLat == null || destLng == null) {
      setRoutePts(null);
      lastRoute.current = null;
      return;
    }
    const last = lastRoute.current;
    const originMovedM = last ? haversineMiles(last.olat, last.olng, origin.lat, origin.lng) * METERS_PER_MILE : Infinity;
    const destMovedM = last ? haversineMiles(last.dlat, last.dlng, destLat, destLng) * METERS_PER_MILE : Infinity;
    if (last && originMovedM <= ROUTE_REFETCH_M && destMovedM <= 50) return;
    lastRoute.current = { olat: origin.lat, olng: origin.lng, dlat: destLat, dlng: destLng };
    let cancelled = false;
    void getDirectionsApi(origin.lat, origin.lng, destLat, destLng)
      .then(({ route: r }) => { if (!cancelled) setRoutePts(r ? decodePolyline(r.polyline) : null); })
      .catch(() => undefined); // transient / maps unconfigured — no line, no noise
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantRoute, origin.lat, origin.lng, destLat, destLng]);

  if (MAP_SCENE_SUPPORTED) {
    const markers: MapSceneMarker[] = [];
    if (dest) markers.push({ lat: dest.lat, lng: dest.lng, kind: 'pin' });
    // The car is the pal's REAL position — never draw it at the Miami fallback.
    if (route && hasFix) markers.push({ lat: origin.lat, lng: origin.lng, kind: 'car' });
    return (
      <View style={StyleSheet.absoluteFill}>
        {/* MapScene applies `fit` exactly once (onMapReady), which fires before
            the GPS fix replaces the fallback origin — so key the scene on the
            fix: the remount re-runs the fit against the pal's true position
            instead of leaving the camera framed around Miami. */}
        <MapScene
          key={hasFix ? 'origin-fix' : 'origin-fallback'}
          dark
          center={dest ?? origin}
          zoom={14}
          markers={markers}
          polyline={routePts ?? undefined}
          fit={route && dest && hasFix ? [dest, origin] : undefined}
          scrim="rgba(13,10,10,0.18)"
        />
      </View>
    );
  }
  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: MAP_BG }]} />
      <View style={{ position: 'absolute', top: 90, left: 40, width: 3, height: 600, backgroundColor: '#1A1F2B', transform: [{ rotate: '8deg' }] }} />
      <View style={{ position: 'absolute', top: 120, left: -20, right: 0, height: 8, backgroundColor: '#1C2331', opacity: 0.7 }} />
      <View style={{ position: 'absolute', top: 240, left: 120, width: 3, height: 500, backgroundColor: '#1A1F2B' }} />
      <View style={{ position: 'absolute', top: 260, left: 0, right: 30, height: 3, backgroundColor: '#1A1F2B' }} />
      {route ? (
        <>
          {/* Red route to the favor destination + car marker (v.2 en-route frames). */}
          <View style={{ position: 'absolute', top: '20%', left: '48%', width: 4, height: '22%', backgroundColor: PIN_RED, borderRadius: 2 }} />
          <View style={{ position: 'absolute', top: '42%', left: '22%', width: '27%', height: 4, backgroundColor: PIN_RED, borderRadius: 2 }} />
          <Ionicons name="location" size={40} color={PIN_RED} style={{ position: 'absolute', top: '15%', left: '44%' }} />
          <View style={{ position: 'absolute', top: '40%', left: '18%', width: 36, height: 36, borderRadius: 18, backgroundColor: SHEET, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER }}>
            <Ionicons name="car" size={20} color={TEXT} />
          </View>
        </>
      ) : null}
    </View>
  );
}

// Warning strip under the directions banner when the pal denied location
// permission mid-favor — without it the member silently waits on "Locating
// your Pal…" forever. Tapping opens device settings (native only).
function LocationDeniedBanner({ visible }: { visible: boolean }) {
  if (!visible) return null;
  const openSettings = () => {
    if (Platform.OS !== 'web') Linking.openSettings().catch(() => undefined);
  };
  return (
    <TouchableOpacity
      onPress={openSettings}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel="Location sharing is off. Open device settings to enable it"
      style={{
        position: 'absolute', top: 108, left: 16, right: 16, zIndex: 20,
        flexDirection: 'row', alignItems: 'center', gap: 10,
        backgroundColor: SHEET, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14,
        borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.18)',
      }}
    >
      <Ionicons name="location-outline" size={18} color={RED} />
      <Text style={{ color: TEXT, fontSize: 13, lineHeight: 18, fontFamily: P400, flex: 1 }}>
        Location sharing is off — the member can't see you approaching. Tap to enable it in Settings.
      </Text>
    </TouchableOpacity>
  );
}

function MapTopBar({ navigation, banner, onBack, onBannerPress }: any) {
  const insets = useSafeAreaInsets();
  // Always expose the menu (→ SideDrawer → Home) even in banner mode: Navigation
  // and PalFavorInProgress are root-stack screens with no tab bar, so without it
  // the only exits on web were completing or destructively cancelling the favor.
  return (
    <View style={{ position: 'absolute', top: insets.top + 8, left: 0, right: 0, paddingHorizontal: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {/* Neutral back so a pal can leave the detail without declining. */}
        {onBack ? (
          <TouchableOpacity style={st.iconBtn} onPress={onBack} accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="chevron-back" size={22} color={TEXT} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}
        {banner ? (
          onBannerPress ? (
            // Tappable directions banner — hands the pal off to the device's
            // maps app for real turn-by-turn (navigate glyph signals the tap).
            <TouchableOpacity
              style={[st.navBanner, { flex: 1, marginHorizontal: 10 }]}
              onPress={onBannerPress}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={`${banner} Get directions — opens your maps app`}
            >
              <Ionicons name="arrow-up" size={20} color={TEXT} />
              <Text style={{ color: TEXT, fontSize: 16, marginLeft: 10, fontFamily: P500, flex: 1 }} numberOfLines={1}>{banner}</Text>
              <Ionicons name="navigate" size={16} color={SUBTLE} style={{ marginLeft: 8 }} />
            </TouchableOpacity>
          ) : (
            <View style={[st.navBanner, { flex: 1, marginHorizontal: 10 }]}>
              <Ionicons name="arrow-up" size={20} color={TEXT} />
              <Text style={{ color: TEXT, fontSize: 16, marginLeft: 10, fontFamily: P500, flex: 1 }} numberOfLines={1}>{banner}</Text>
            </View>
          )
        ) : (
          <View style={{ flex: 1 }} />
        )}
        <TouchableOpacity style={st.iconBtn} onPress={() => navigation.navigate('SideDrawer')} accessibilityRole="button" accessibilityLabel="Open menu">
          <Ionicons name="menu" size={22} color={TEXT} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Handle() {
  return <View style={st.handle} />;
}

// Navy modal card — v.2 dark-screen modal pattern (#252A38 card, r16, ~85%
// width, white Poppins Medium title, gray body, white primary button).
function NavyModal({ visible, title, message, primaryLabel, onPrimary, dismissLabel, onDismiss }: {
  visible: boolean;
  title: string;
  message: string;
  primaryLabel: string;
  onPrimary: () => void;
  dismissLabel?: string;
  onDismiss?: () => void;
}) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onDismiss ?? onPrimary}>
      <View style={st.modalScrim} accessibilityViewIsModal>
        <View style={st.modalCard}>
          <Text style={st.modalTitle}>{title}</Text>
          <Text style={st.modalBody}>{message}</Text>
          <TouchableOpacity
            style={[st.whiteBtn, { alignSelf: 'stretch' }]}
            onPress={onPrimary}
            accessibilityRole="button"
            accessibilityLabel={primaryLabel}
          >
            <Text style={st.whiteBtnTxt}>{primaryLabel}</Text>
          </TouchableOpacity>
          {dismissLabel && onDismiss ? (
            // app addition — no v2 frame (escape hatch so the modal isn't a trap)
            <TouchableOpacity onPress={onDismiss} style={{ marginTop: 14, paddingVertical: 4 }} accessibilityRole="button" accessibilityLabel={dismissLabel}>
              <Text style={{ color: SUBTLE, fontSize: 14, fontFamily: P500 }}>{dismissLabel}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

// ===========================================================================
// 0. BrowseFavors — a board of ALL open favor requests a pal can browse and
// pick from (backed by the live /favors/incoming feed in store.incomingFavors).
// app addition — no v2 frame (the blast sheet is the designed incoming-favor
// UX); palette aligned to v.2: #0D0A0A bg, navy cards, white primary buttons.
// ===========================================================================
const tierLabel = (f: Favor) =>
  (FAVOR_TIERS as Record<string, { label: string }>)[f.tier]?.label ?? 'Custom Favor';

// One price format across the pal surface: whole dollars stay whole ('$25'),
// fractional prices always carry cents ('$25.50') — never a bare '$25.5'.
const fmtMoney = (n: number) => (Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`);

// Fallback pal origin for distance/sort BEFORE the device's real GPS fix arrives
// (or on web / when location permission is denied). Anchored to the demo city
// (Miami) so it matches where the seeded/incoming favors are — an Austin origin
// made every favor read as ~1000 mi away and flattened the "Closest" sort.
type Origin = { lat: number; lng: number };
const PAL_ORIGIN_FALLBACK: Origin = { lat: 25.7617, lng: -80.1918 };

// The pal's real device location, used as the origin for "closest favor" and
// distance labels. Reads a single foreground fix via expo-location's
// getCurrentPositionAsync; keeps the Miami fallback until (and unless) a real fix
// lands, so the board never shows nonsense distances on web / without permission.
// Dynamic import so a build lacking the native module can't break the JS bundle.
function usePalOriginFix(): { origin: Origin; hasFix: boolean } {
  const [state, setState] = useState<{ origin: Origin; hasFix: boolean }>({ origin: PAL_ORIGIN_FALLBACK, hasFix: false });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const Location = await import('expo-location');
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!cancelled) setState({ origin: { lat: pos.coords.latitude, lng: pos.coords.longitude }, hasFix: true });
      } catch {
        /* keep the fallback — web, missing module, or permission denied */
      }
    })();
    return () => { cancelled = true; };
  }, []);
  return state;
}
export function usePalOrigin(): Origin {
  return usePalOriginFix().origin;
}

const toRad = (d: number) => (d * Math.PI) / 180;
function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 3958.8; // earth radius (mi)
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
const favorDistance = (f: Favor, origin: Origin) => haversineMiles(origin.lat, origin.lng, f.location.lat, f.location.lng);
const fmtMiles = (mi: number) => (mi < 0.1 ? 'nearby' : mi < 10 ? `${mi.toFixed(1)} mi` : `${Math.round(mi)} mi`);

const relTime = (ms?: number) => {
  if (!ms) return '';
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
};

// Swipe-to-decline: a horizontal PanResponder layered over the browse card.
// The |dx| > 12 AND |dx| > 1.5·|dy| claim gate keeps plain taps (same gate) and
// the vertical FlatList scroll winning; a decisive LEFT drag follows the finger
// (rightward drags rubber-band at 0.2), revealing the red DECLINE underlay.
// Declining without gestures stays available in the detail sheet.
function FavorCard({ favor, onPress, origin }: { favor: Favor; onPress: () => void; origin: Origin }) {
  const s = useStore();
  const { payout } = computePayout(favor.price);
  const tx = useRef(new Animated.Value(0)).current;
  // Refs (not deps) keep the once-created PanResponder from going stale: the
  // FlatList keys rows by favor id, but a feed refresh can swap the favor
  // object (and the store callback identity) under the same mounted row.
  const widthRef = useRef(0);
  const favorIdRef = useRef(favor.id);
  favorIdRef.current = favor.id;
  const declineRef = useRef(s.declineFavor);
  declineRef.current = s.declineFavor;
  const busyRef = useRef(false); // a decline in flight — ignore further gestures

  const springHome = () => {
    Animated.spring(tx, { toValue: 0, friction: 9, useNativeDriver: true }).start();
  };

  const pan = useRef(
    PanResponder.create({
      // Never claim on start — taps must fall through to the card's onPress.
      onStartShouldSetPanResponder: () => false,
      // Claim only a decisively horizontal move; anything steeper belongs to
      // the vertical FlatList scroll.
      onMoveShouldSetPanResponder: (_e, g) =>
        !busyRef.current && Math.abs(g.dx) > 12 && Math.abs(g.dx) > 1.5 * Math.abs(g.dy),
      // Once we own a horizontal swipe, don't hand it back to the list.
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_e, g) => {
        // Left-only gesture: rightward drags rubber-band at 0.2.
        tx.setValue(g.dx < 0 ? g.dx : g.dx * 0.2);
      },
      onPanResponderRelease: (_e, g) => {
        const w = widthRef.current || Dimensions.get('window').width - 32;
        if (!busyRef.current && (g.dx <= -0.4 * w || g.vx <= -0.5)) {
          busyRef.current = true;
          // Off-screen left first, then the real decline. The store removes the
          // favor optimistically (this row unmounts, no dead gap) and restores
          // the feed on API failure — resetting the local value here just makes
          // sure a still-mounted row sits back home when that happens.
          Animated.timing(tx, { toValue: -(w + 32), duration: 200, useNativeDriver: true }).start(() => {
            void declineRef.current(favorIdRef.current).then((ok) => {
              busyRef.current = false;
              if (!ok) springHome();
            });
          });
        } else {
          springHome();
        }
      },
      onPanResponderTerminate: () => springHome(),
    })
  ).current;

  return (
    <View style={bw.rowWrap} onLayout={(e) => { widthRef.current = e.nativeEvent.layout.width; }}>
      {/* Revealed by the swipe — sits behind the opaque card. */}
      <View style={bw.declineUnder} pointerEvents="none">
        <Ionicons name="trash-outline" size={20} color={TEXT} />
        <Text style={bw.declineText}>DECLINE</Text>
      </View>
      <Animated.View {...pan.panHandlers} style={{ transform: [{ translateX: tx }] }}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={onPress}
          style={bw.card}
          accessibilityRole="button"
          accessibilityLabel={`${tierLabel(favor)}, ${fmtMoney(favor.price)}. ${favor.description}. You earn $${payout.toFixed(2)}.`}
          accessibilityHint="Swipe left to decline"
        >
          <View style={bw.cardTop}>
            {/* Pill shrinks (with ellipsis) before it can shove the price off-card. */}
            <View style={[bw.tierPill, { flexShrink: 1, marginRight: 10 }]}>
              <Text style={bw.tierPillText} numberOfLines={1}>{tierLabel(favor)}</Text>
            </View>
            <Text style={bw.price}>{fmtMoney(favor.price)}</Text>
          </View>
          <Text style={bw.desc} numberOfLines={2}>{favor.description || 'No details provided.'}</Text>
          <View style={bw.metaRow}>
            <Ionicons name="location-outline" size={14} color={SUBTLE} />
            {/* flexShrink so the address truncates instead of pushing the miles/time
                (and itself) past the card edge — Text defaults to flexShrink:0 in a row. */}
            <Text style={[bw.meta, { flexShrink: 1 }]} numberOfLines={1}>{favor.location?.address || 'Nearby'}</Text>
            <Text style={bw.dot}>·</Text>
            <Text style={bw.meta}>{fmtMiles(favorDistance(favor, origin))}</Text>
            {favor.createdAt ? <Text style={bw.dot}>·</Text> : null}
            {favor.createdAt ? <Text style={bw.meta}>{relTime(favor.createdAt)}</Text> : null}
          </View>
          {favor.scheduledFor ? (
            <View style={bw.schedRow}>
              <Ionicons name="calendar-outline" size={13} color={RED} />
              <Text style={[bw.schedText, { flex: 1 }]} numberOfLines={1}>
                Scheduled · {new Date(favor.scheduledFor).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
              </Text>
            </View>
          ) : null}
          <View style={bw.cardFooter}>
            <Text style={[bw.earn, { flexShrink: 1, marginRight: 10 }]} numberOfLines={1}>
              You earn <Text style={bw.earnAmt}>${payout.toFixed(2)}</Text>
            </Text>
            <View style={bw.viewBtn}>
              <Text style={bw.viewText}>View</Text>
              <Ionicons name="chevron-forward" size={15} color={CTA_TEXT} />
            </View>
          </View>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

type SortKey = 'new' | 'high' | 'low' | 'close';
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'new', label: 'Newest' },
  { key: 'close', label: 'Closest' },
  { key: 'high', label: '$ High' },
  { key: 'low', label: '$ Low' },
];
const TIERS: { key: string; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'tiny', label: 'Tiny' },
  { key: 'small', label: 'Small' },
  { key: 'big', label: 'Big' },
  { key: 'huge', label: 'Huge' },
];

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[bw.chip, active && bw.chipActive]}
    >
      <Text style={[bw.chipText, active && bw.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

// Reusable board of open favor requests: sort + tier chips over a scrolling
// list of FavorCards. Embedded by the pal's Home (default List view) and by the
// standalone BrowseFavors screen. `header` is a render-prop so each host can
// supply its own title/back/toggle bar above the chips.
export function OpenFavorsList({
  navigation,
  defaultSort = 'new',
  onItemPress,
  header,
}: {
  navigation: any;
  defaultSort?: SortKey;
  onItemPress?: (favorId: string) => void;
  header?: (info: { shown: number; total: number; refreshing: boolean; onRefresh: () => void }) => React.ReactNode;
}) {
  const s = useStore();
  const insets = useSafeAreaInsets();
  const origin = usePalOrigin();
  const [refreshing, setRefreshing] = useState(false);
  const [errored, setErrored] = useState(false);
  const [sort, setSort] = useState<SortKey>(defaultSort);
  const [tier, setTier] = useState('all');
  const favors = s.incomingFavors;

  // The store's refreshIncoming() swallows network errors, so a probe of the
  // same endpoint (run in parallel) tells us whether the fetch actually failed,
  // letting us show a distinct error state instead of the empty state.
  const load = useCallback(async () => {
    const [probe] = await Promise.allSettled([getIncomingApi(), s.refreshIncoming()]);
    setErrored(probe.status === 'rejected');
  }, [s]);

  // #3 — keep the board fresh: refresh on open, whenever it regains focus, and
  // on a gentle interval so new requests appear without manual action.
  useEffect(() => {
    void load();
    const unsub = navigation.addListener('focus', () => { void load(); });
    const id = setInterval(() => { void s.refreshIncoming(); }, 15000);
    return () => { unsub(); clearInterval(id); };
  }, [navigation]); // eslint-disable-line react-hooks/exhaustive-deps

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // #2 — filter by tier + sort by recency/payout/distance. (Server returns newest-first.)
  const shown = useMemo(() => {
    let list = tier === 'all' ? favors : favors.filter((f) => f.tier === tier);
    if (sort === 'high') list = [...list].sort((a, b) => b.price - a.price);
    else if (sort === 'low') list = [...list].sort((a, b) => a.price - b.price);
    else if (sort === 'close') list = [...list].sort((a, b) => favorDistance(a, origin) - favorDistance(b, origin));
    return list;
  }, [favors, tier, sort, origin]);

  return (
    <View style={{ flex: 1 }}>
      {header?.({ shown: shown.length, total: favors.length, refreshing, onRefresh })}

      {/* Sort + tier filter chips */}
      <View style={bw.chipRows}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={bw.chipRow}>
          {SORTS.map((o) => <Chip key={o.key} label={o.label} active={sort === o.key} onPress={() => setSort(o.key)} />)}
          <View style={bw.chipSep} />
          {TIERS.map((o) => <Chip key={o.key} label={o.label} active={tier === o.key} onPress={() => setTier(o.key)} />)}
        </ScrollView>
      </View>

      <FlatList
        data={shown}
        keyExtractor={(f) => f.id}
        renderItem={({ item }) => (
          <FavorCard
            favor={item}
            origin={origin}
            onPress={() => (onItemPress ? onItemPress(item.id) : navigation.navigate('PalFavorDetail', { favorId: item.id }))}
          />
        )}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={RED} />}
        ListEmptyComponent={
          errored && favors.length === 0 ? (
            <View style={bw.empty}>
              <Ionicons name="cloud-offline-outline" size={56} color={SUBTLE} />
              <Text style={bw.emptyTitle}>Couldn{'’'}t load favors</Text>
              <Text style={bw.emptySub}>Check your connection and try again.</Text>
              <TouchableOpacity onPress={onRefresh} style={bw.retryBtn} accessibilityRole="button" accessibilityLabel="Retry loading favors">
                <Ionicons name="refresh" size={16} color={CTA_TEXT} />
                <Text style={bw.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={bw.empty}>
              <Ionicons name="file-tray-outline" size={56} color={SUBTLE} />
              <Text style={bw.emptyTitle}>{favors.length ? 'No favors match these filters' : 'No open favors right now'}</Text>
              <Text style={bw.emptySub}>
                {favors.length ? 'Try clearing the filters above.' : 'Pull down to refresh — new requests appear here as members post them.'}
              </Text>
            </View>
          )
        }
      />
    </View>
  );
}

export const BrowseFavors = ({ navigation }: any) => {
  const insets = useSafeAreaInsets();
  const fontsLoaded = usePoppins();

  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: PAGE_BG }} />;

  return (
    <View style={{ flex: 1, backgroundColor: PAGE_BG, paddingTop: insets.top }}>
      <OpenFavorsList
        navigation={navigation}
        header={({ shown, total, onRefresh }) => (
          <View style={bw.header}>
            {navigation.canGoBack() ? (
              <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Go back">
                <Ionicons name="chevron-back" size={26} color={TEXT} />
              </TouchableOpacity>
            ) : null}
            <View style={{ flex: 1, marginLeft: navigation.canGoBack() ? 8 : 0 }}>
              <Text style={bw.title}>Open Favors</Text>
              <Text style={bw.subtitle}>
                {shown === total
                  ? `${total} ${total === 1 ? 'request' : 'requests'} near you`
                  : `${shown} of ${total} requests`}
              </Text>
            </View>
            <TouchableOpacity onPress={onRefresh} hitSlop={10} accessibilityRole="button" accessibilityLabel="Refresh">
              <Ionicons name="refresh" size={22} color={TEXT} />
            </TouchableOpacity>
          </View>
        )}
      />
    </View>
  );
};

const bw = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  title: { color: TEXT, fontSize: 20, fontFamily: P600 },
  subtitle: { color: SUBTLE, fontSize: 13, marginTop: 2, fontFamily: P400 },
  chipRows: { paddingBottom: 4 },
  chipRow: { paddingHorizontal: 16, paddingVertical: 6, gap: 8, alignItems: 'center' },
  chipSep: { width: 1, height: 22, backgroundColor: DIVIDER, marginHorizontal: 4 },
  chip: { backgroundColor: SHEET_ALT, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  chipActive: { backgroundColor: RED },
  chipText: { color: SUBTLE, fontSize: 13, fontFamily: P500 },
  chipTextActive: { color: TEXT },
  // Swipe-to-decline row: the wrapper carries the gap (so the margin doesn't
  // slide away with the card) and deliberately does NOT clip, letting the card
  // travel off-screen while the underlay stays put behind it.
  rowWrap: { marginBottom: 12 },
  declineUnder: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: PIN_RED, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 22, gap: 8 },
  declineText: { color: TEXT, fontSize: 13, letterSpacing: 1, fontFamily: P600 },
  card: { backgroundColor: SHEET, borderRadius: 16, padding: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER, overflow: 'hidden' },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tierPill: { backgroundColor: 'rgba(237,28,36,0.18)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  tierPillText: { color: '#FF6B70', fontSize: 12, fontFamily: P600 },
  price: { color: TEXT, fontSize: 22, fontFamily: P600 },
  desc: { color: TEXT, fontSize: 15, marginTop: 12, lineHeight: 21, fontFamily: P400 },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 5 },
  meta: { color: SUBTLE, fontSize: 13, fontFamily: P400 },
  dot: { color: SUBTLE, fontSize: 13, marginHorizontal: 2, fontFamily: P400 },
  schedRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 5 },
  schedText: { color: '#FF6B70', fontSize: 13, fontFamily: P500 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: DIVIDER, paddingTop: 14 },
  earn: { color: SUBTLE, fontSize: 14, fontFamily: P400 },
  earnAmt: { color: TEXT, fontFamily: P600 },
  viewBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: CTA_BG, borderRadius: 8, paddingLeft: 14, paddingRight: 10, paddingVertical: 8 },
  viewText: { color: CTA_TEXT, fontSize: 14, fontFamily: P500 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, paddingHorizontal: 32 },
  emptyTitle: { color: TEXT, fontSize: 17, marginTop: 16, fontFamily: P600 },
  emptySub: { color: SUBTLE, fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20, fontFamily: P400 },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: CTA_BG, borderRadius: 8, paddingHorizontal: 18, paddingVertical: 10, marginTop: 18 },
  retryText: { color: CTA_TEXT, fontSize: 14, fontFamily: P500 },
});

// ===========================================================================
// 1. PalFavorDetail — "Favor Quick View" (v.2 181:10645): navy bottom sheet
// over the dark map — "{Tier} Favor $X", requester name + description +
// posted datetime + View More, white ACCEPT.
// ===========================================================================
export const PalFavorDetail = ({ navigation, route }: any) => {
  const s = useStore();
  const [expanded, setExpanded] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState('');
  const fontsLoaded = usePoppins();

  // Drag-to-dismiss on the handle: pulling the sheet down closes the quick view
  // (the back chevron stays as the tap path); up does nothing. Dismissing with
  // an offer pending is safe — the offer lives server-side and reopening the
  // favor restores it (see the getFavorOffersApi effect below).
  const dismissDrag = useSheetDrag({
    onRelease: (direction) => { if (direction === 'down') navigation.goBack(); },
    maxDown: 120,
  });

  const onAccept = async (id: string) => {
    if (accepting) return;
    setAccepting(true);
    const res = await s.acceptFavor(id);
    setAccepting(false);
    // Accept = REQUEST: the server records a list-price offer and the member
    // must approve the person. The pending-offer banner + 5s poll below take
    // over — the member's approval flips the offer to 'accepted' → booked.
    if (res.ok && res.offer) {
      setOffer(res.offer);
    } else if (res.code === 'unavailable') setTaken(true); // our own dark taken state — never the member-light FavorUnavailable screen
    else setAcceptError(res.reason || 'This favor is no longer available.');
  };

  // Bind strictly to the requested favor. Only fall back to the first open favor
  // when no id was passed (e.g. a bare deep-link) — never substitute a different
  // favor, or ACCEPT/DECLINE would silently act on the wrong one after a refresh.
  const favorId: string | undefined = route?.params?.favorId ?? s.incomingFavors[0]?.id;
  const favor = favorId ? s.incomingFavors.find((f) => f.id === favorId) : undefined;

  // ---- price negotiation ----------------------------------------------------
  // The pal's own offer on this favor (one per favor+pal; counters update it in
  // place — see server favor.routes.ts). While it's pending we poll for the
  // member's response: a counter flips lastBy to 'member', an accept matches the
  // favor to us, and the favor leaving 'requested' without our offer being
  // accepted means someone else took it.
  const [offer, setOffer] = useState<FavorOffer | null>(null);
  const [taken, setTaken] = useState(false);
  const [negotiateOpen, setNegotiateOpen] = useState(false);
  const [offerText, setOfferText] = useState('');
  const [offerBusy, setOfferBusy] = useState(false);
  const [offerError, setOfferError] = useState('');

  // Restore a previously-sent offer when this favor is reopened (404 = none yet).
  useEffect(() => {
    if (!favorId) return;
    let cancelled = false;
    void getFavorOffersApi(favorId)
      .then(({ offers }) => { if (!cancelled && offers[0]) setOffer(offers[0]); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [favorId]);

  // One-shot latch across accept paths (list-price accept, counter accept, or
  // the member accepting our offer remotely): once we're booked and navigating,
  // later poll ticks must not flip the sheet to "taken".
  const bookedRef = useRef(false);

  const offerPending = offer?.status === 'pending';
  useEffect(() => {
    if (!favorId || !offerPending) return;
    const id = setInterval(async () => {
      try {
        const { offers, favorStatus } = await getFavorOffersApi(favorId);
        if (bookedRef.current) return;
        const mine = offers[0] ?? null;
        if (mine?.status === 'accepted') {
          // The member accepted our price — the favor is OURS. Navigate
          // unconditionally: updating `offer` first would flip offerPending,
          // tear this effect down and strand the pal on a dead sheet (the
          // cleanup-flag race the first cut of this effect had).
          bookedRef.current = true;
          clearInterval(id);
          // refreshActive returns null on ANY error (a timeout looks identical
          // to a cancel race) and `pal ?? member` can be a dual-role user's own
          // member favor — so require OUR favor by id and retry once before
          // telling a booked pal the favor was taken.
          let fav = await s.refreshActive();
          if (fav?.id !== favorId) {
            await new Promise((r) => setTimeout(r, 1500));
            fav = await s.refreshActive();
          }
          if (fav?.id === favorId) {
            // Reset (not push) so Android back can't land on this stale sheet.
            navigation.reset({ index: 1, routes: [{ name: 'Tabs' }, { name: 'Navigation' }] });
          } else setTaken(true); // accepted but already ended (cancel race)
          return;
        }
        if (mine) setOffer(mine);
        if (favorStatus !== 'requested') setTaken(true); // someone else won it
      } catch (e: any) {
        // 404 = our offer row no longer exists (withdrawn from another device)
        // — clear it so the sheet can't wait for an approval that can't come.
        if (e?.status === 404) setOffer(null);
        /* otherwise transient — keep last known state */
      }
    }, 5000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [favorId, offerPending]);

  // Comma-decimal locales: the decimal pad types '12,50' — normalize before
  // parsing or parseFloat stops at the comma and sends $12.00.
  const offerValue = Math.round(parseFloat(offerText.replace(',', '.')) * 100) / 100;
  const offerValid = !Number.isNaN(offerValue) && offerValue > 0 && offerValue <= 100000;
  const memberCountered = !!offer && offer.status === 'pending' && offer.lastBy === 'member';
  // The member declined our request: the server keeps the row as 'declined' and
  // 409s any re-accept, so the sheet must explain instead of re-offering ACCEPT.
  const memberDeclined = offer?.status === 'declined';

  const sendOffer = async () => {
    if (!favorId || !offerValid || offerBusy) return;
    setOfferBusy(true);
    try {
      // Replying to a member counter re-counters the same offer row; otherwise
      // open (or re-price) our offer.
      const { offer: o } = memberCountered && offer
        ? await counterOfferApi(favorId, offer.id, offerValue)
        : await makeOfferApi(favorId, offerValue);
      setOffer(o);
      setNegotiateOpen(false);
      setOfferText('');
    } catch (e: any) {
      setOfferError(e?.message || 'Could not send the offer. Please try again.');
    } finally {
      setOfferBusy(false);
    }
  };

  const acceptCounter = async () => {
    if (!favorId || !offer || offerBusy) return;
    setOfferBusy(true);
    // Echo the exact counter price on screen — the server 409s if it changed.
    const res = await s.acceptOffer(favorId, offer.id, offer.price);
    setOfferBusy(false);
    if (res.ok) {
      bookedRef.current = true;
      // Reset (not push): unmounts this sheet — killing its 5s offers poll —
      // and keeps Android back from landing on a stale pre-booking detail.
      navigation.reset({ index: 1, routes: [{ name: 'Tabs' }, { name: 'Navigation' }] });
    } else setOfferError(res.reason || 'This offer is no longer available.');
  };

  const withdrawOffer = async () => {
    if (!favorId || !offer || offerBusy) return;
    setOfferBusy(true);
    try {
      // Awaited on purpose: clearing local state on a FAILED withdraw would
      // kill the poll while the server still has a live offer the member can
      // accept — silently booking a pal who thinks they withdrew.
      await declineOfferApi(favorId, offer.id);
      setOffer(null);
    } catch (e: any) {
      // 404 = the offer is already gone server-side (withdrawn on another
      // device) — the withdraw is effectively done, so just clear local state.
      if (e?.status === 404) setOffer(null);
      else setOfferError('Could not withdraw the offer — please try again.');
    } finally {
      setOfferBusy(false);
    }
  };

  // Gone = taken by someone else (polled), or vanished from the feed with no
  // live negotiation of ours still deciding its fate.
  const gone = taken || (!!route?.params?.favorId && !favor && !offerPending);
  // Display source: acceptFavor()/acceptOffer() move the favor out of
  // incomingFavors into the pal slot — fall back to it so the sheet keeps the
  // REAL title/name/fees during the transition instead of placeholders.
  const shownFavor = favor ?? s.activePalFavor;
  const base = shownFavor?.price ?? 20;
  // v.2 quick view shows the requester's (first) name above the description.
  const requester = shownFavor?.memberName ?? 'Favor Member';
  const title = shownFavor ? `${tierLabel(shownFavor)} ${fmtMoney(base)}` : 'Favor request';
  // Pal-side economics: what THEY take home (never the member invoice total).
  const { payout } = computePayout(base);
  const area = shownFavor?.location?.address ?? 'Nearby';
  const when = shownFavor?.scheduledFor
    ? new Date(shownFavor.scheduledFor).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : shownFavor?.createdAt
      ? `Requested ${relTime(shownFavor.createdAt)}`
      : 'As soon as possible';
  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: PAGE_BG }} />;

  if (gone) {
    return (
      <View style={{ flex: 1, backgroundColor: PAGE_BG }}>
        <MapBackdrop />
        <MapTopBar navigation={navigation} onBack={() => navigation.goBack()} />
        <View style={st.sheet}>
          <Handle />
          <View style={{ alignItems: 'center', paddingVertical: 24 }}>
            <Ionicons name="time-outline" size={48} color={SUBTLE} />
            <Text style={{ color: TEXT, fontSize: 19, fontFamily: P500, textAlign: 'center', marginTop: 14 }}>This favor was just taken</Text>
            <Text style={{ color: SUBTLE, fontSize: 14, lineHeight: 21, fontFamily: P400, textAlign: 'center', marginTop: 8 }}>
              Another Favor Pal accepted it, or the member cancelled. Browse other open favors.
            </Text>
            <TouchableOpacity
              style={[st.whiteBtn, { alignSelf: 'stretch' }]}
              onPress={() => navigation.goBack()}
              accessibilityRole="button"
              accessibilityLabel="Back to favors"
            >
              <Text style={st.whiteBtnTxt}>BACK TO FAVORS</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: PAGE_BG }}>
      <MapBackdrop dest={shownFavor?.location} />
      <MapTopBar navigation={navigation} onBack={() => navigation.goBack()} />
      <Animated.View style={[st.sheet, { transform: [{ translateY: dismissDrag.y }] }]}>
        {/* Grab strip (handle + its row only — never the whole sheet, so the
            ScrollView below is never fought over). */}
        <View {...dismissDrag.panHandlers} style={st.grab}>
          <Handle />
        </View>
        {/* The sheet caps at ~86% of the screen (st.sheet maxHeight) and scrolls:
            a long description (server allows 2000 chars) expanded via View More
            must not push the title/requester of this bottom-anchored sheet above
            the top screen edge. */}
        <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
          <Text style={{ color: TEXT, fontSize: 19, fontFamily: P500, textAlign: 'center', marginVertical: 14 }}>{title}</Text>
          <View style={st.divider} />
          <View style={{ flexDirection: 'row', marginTop: 16 }}>
            <Avatar uri={undefined} size={56} name={requester} />
            <View style={{ flex: 1, marginLeft: 14 }}>
              {/* Tap-through: judge the requester (profile + reviews) before committing. */}
              <TouchableOpacity
                onPress={() => { if (shownFavor?.memberId) navigation.navigate('MemberProfile', { userId: shownFavor.memberId }); }}
                accessibilityRole="button"
                accessibilityLabel={`View ${requester}'s profile and reviews`}
                style={{ flexDirection: 'row', alignItems: 'center' }}
              >
                <Text style={{ color: TEXT, fontSize: 16, fontFamily: P500 }}>{requester}</Text>
                {shownFavor?.memberRating && shownFavor.memberRating > 0 ? (
                  <Text style={{ color: SUBTLE, fontSize: 13, fontFamily: P400 }}>{`  ★ ${shownFavor.memberRating.toFixed(1)}`}</Text>
                ) : null}
                <Ionicons name="chevron-forward" size={14} color={SUBTLE} style={{ marginLeft: 4 }} />
              </TouchableOpacity>
              <Text style={{ color: SUBTLE, fontSize: 14, lineHeight: 20, marginTop: 4, fontFamily: P400 }} numberOfLines={expanded ? undefined : 2}>
                {shownFavor?.description || 'No details provided yet.'}
              </Text>
              {/* Member-attached photos (favor create, max 5) — dark-kit
                  thumbnail strip; view-only for now (no tap action). */}
              {shownFavor?.images?.length ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ marginTop: 10 }}
                  contentContainerStyle={{ gap: 8 }}
                >
                  {shownFavor.images.map((uri, i) => (
                    <Image
                      key={`${uri}-${i}`}
                      source={{ uri }}
                      style={{
                        width: 64, height: 64, borderRadius: 8, backgroundColor: SHEET_ALT,
                        borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER,
                      }}
                      accessibilityLabel={`Favor photo ${i + 1} of ${shownFavor.images.length}`}
                    />
                  ))}
                </ScrollView>
              ) : null}
              <Text style={{ color: SUBTLE, fontSize: 13, marginTop: 6, fontFamily: P400 }}>{when}</Text>
              {/* app addition — no v2 frame (pal-side payout + area at a glance) */}
              <Text style={{ fontSize: 14, marginTop: 6, fontFamily: P400 }}>
                <Text style={{ color: TEXT, fontFamily: P500 }}>{`You earn $${payout.toFixed(2)}`}</Text>
                <Text style={{ color: SUBTLE, fontFamily: P400 }}>{`   ·   ${area}`}</Text>
              </Text>
              <TouchableOpacity
                onPress={() => setExpanded((v) => !v)}
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                accessibilityLabel={expanded ? 'View less favor detail' : 'View more favor detail'}
              >
                <Text style={{ color: TEXT, fontSize: 14, marginTop: 8, fontFamily: P500 }}>
                  {expanded ? 'View Less' : 'View More'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {expanded && (
            <View style={{ marginTop: 16 }}>
              <View style={st.divider} />
              <QuickRow label="When" value={when} />
              {/* Privacy: precise address is withheld until the pal accepts the favor. */}
              <QuickRow label="Pickup area" value={`${area} · exact address shared once you accept`} />
              <QuickRow label="You earn (after 20% commission)" value={`$${payout.toFixed(2)}`} />
            </View>
          )}

          {/* Negotiation / approval state — our pending request or the member's counter. */}
          {offer && offer.status === 'pending' ? (
            <View style={st.waitBanner}>
              {offer.lastBy === 'pal' ? <ActivityIndicator color={TEXT} /> : null}
              <Text style={st.waitText}>
                {offer.lastBy === 'pal'
                  ? offer.price === (favor?.price ?? offer.price)
                    ? `Waiting for ${requester} to approve you — ${fmtMoney(offer.price)}`
                    : `You offered ${fmtMoney(offer.price)} — waiting for ${requester}`
                  : `${requester} countered ${fmtMoney(offer.price)}`}
              </Text>
            </View>
          ) : null}

          {/* The member said no — say so on the sheet instead of silently
              reverting to a plain ACCEPT the server would only 409. */}
          {memberDeclined ? (
            <View style={st.waitBanner}>
              <Ionicons name="close-circle" size={18} color="#FF6B70" />
              <Text style={[st.waitText, { flexShrink: 1 }]}>
                {`${requester} declined your request for this favor.`}
              </Text>
            </View>
          ) : null}

          {memberDeclined ? (
            // Accepting again would only 409 — steer back to the open board.
            <TouchableOpacity
              style={st.whiteBtn}
              accessibilityRole="button"
              accessibilityLabel="Browse other favors"
              onPress={() => navigation.goBack()}
            >
              <Text style={st.whiteBtnTxt}>BROWSE OTHER FAVORS</Text>
            </TouchableOpacity>
          ) : memberCountered && offer ? (
            // Accept the member's counter price → booked at that price (the member
            // engaged this pal by countering, so their counter is the approval).
            <TouchableOpacity
              style={[st.whiteBtn, offerBusy && { opacity: 0.6 }]}
              disabled={offerBusy}
              accessibilityRole="button"
              accessibilityLabel={`Accept the counter offer of ${fmtMoney(offer.price)}`}
              onPress={acceptCounter}
            >
              <Text style={st.whiteBtnTxt}>{offerBusy ? 'ACCEPTING…' : `ACCEPT ${fmtMoney(offer.price)}`}</Text>
            </TouchableOpacity>
          ) : offerPending && offer?.lastBy === 'pal' ? (
            // Our request/offer is on the member's screen — nothing to tap here.
            <View style={[st.whiteBtn, { opacity: 0.55 }]} accessibilityLabel="Waiting for the member's approval">
              <Text style={st.whiteBtnTxt}>WAITING FOR APPROVAL</Text>
            </View>
          ) : (
            // Request at the listed price (while the favor is open).
            <TouchableOpacity
              style={[st.whiteBtn, accepting && { opacity: 0.6 }]}
              disabled={accepting}
              accessibilityRole="button"
              accessibilityLabel="Accept this favor"
              onPress={() => { if (favor) void onAccept(favor.id); }}
            >
              <Text style={st.whiteBtnTxt}>{accepting ? 'SENDING…' : 'ACCEPT'}</Text>
            </TouchableOpacity>
          )}

          {/* Propose (or revise) a price instead of accepting as listed. */}
          {!memberDeclined ? (
            <TouchableOpacity
              style={st.darkBtn}
              accessibilityRole="button"
              accessibilityLabel="Negotiate the price"
              onPress={() => { setOfferText(''); setNegotiateOpen(true); }}
            >
              <Text style={st.darkBtnTxt}>
                {offer && offer.status === 'pending'
                  ? offer.lastBy === 'pal' ? 'CHANGE YOUR OFFER' : 'COUNTER BACK'
                  : 'NEGOTIATE PRICE'}
              </Text>
            </TouchableOpacity>
          ) : null}

          {offer && offer.status === 'pending' ? (
            <TouchableOpacity
              onPress={withdrawOffer}
              style={{ alignSelf: 'center', marginTop: 14 }}
              accessibilityRole="button"
              accessibilityLabel="Withdraw your offer"
            >
              <Text style={{ color: SUBTLE, fontSize: 14, fontFamily: P500 }}>withdraw your offer</Text>
            </TouchableOpacity>
          ) : !memberDeclined ? (
            <TouchableOpacity
              onPress={() => { if (favor) s.declineFavor(favor.id); navigation.goBack(); }}
              style={{ alignSelf: 'center', marginTop: 14 }}
              accessibilityRole="button"
              accessibilityLabel="Decline this favor"
            >
              <Text style={{ color: SUBTLE, fontSize: 14, fontFamily: P500 }}>decline this favor</Text>
            </TouchableOpacity>
          ) : null}
        </ScrollView>

        <NavyModal
          visible={!!acceptError}
          title="Can't accept this favor"
          message={acceptError}
          primaryLabel="OK"
          onPrimary={() => setAcceptError('')}
        />
        <NavyModal
          visible={!!offerError}
          title="Offer problem"
          message={offerError}
          primaryLabel="OK"
          onPrimary={() => setOfferError('')}
        />
      </Animated.View>

      {/* Offer / counter input */}
      <Modal visible={negotiateOpen} transparent animationType="fade" onRequestClose={() => setNegotiateOpen(false)}>
        {/* Keyboard avoidance: the decimal pad must push the centered card up,
            not cover the SEND OFFER / Cancel controls on small screens. */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={st.offerScrim}
          accessibilityViewIsModal
        >
          <View style={st.offerCard}>
            <Text style={st.offerTitle}>Negotiate the price</Text>
            <Text style={st.offerBody}>
              {memberCountered && offer
                ? `${requester} countered ${fmtMoney(offer.price)}. Counter back with your price.`
                : `Listed at ${fmtMoney(base)}. Propose your price — ${requester} can accept or counter.`}
            </Text>
            <View style={st.offerField}>
              <TextInput
                value={offerText}
                onChangeText={setOfferText}
                keyboardType="decimal-pad"
                placeholder="$ Your offer"
                placeholderTextColor={MUTED}
                style={st.offerInput}
                accessibilityLabel="Offer amount"
              />
            </View>
            <TouchableOpacity
              style={[st.whiteBtn, (!offerValid || offerBusy) && { opacity: 0.5 }]}
              disabled={!offerValid || offerBusy}
              accessibilityRole="button"
              accessibilityLabel="Send offer"
              onPress={sendOffer}
            >
              <Text style={st.whiteBtnTxt}>
                {offerBusy ? 'SENDING…' : offerValid ? `SEND OFFER — ${fmtMoney(offerValue)}` : 'SEND OFFER'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setNegotiateOpen(false)}
              style={{ alignSelf: 'center', marginTop: 14 }}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={{ color: SUBTLE, fontSize: 14, fontFamily: P500 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

function QuickRow({ label, value }: any) {
  return (
    <View style={{ marginTop: 12 }}>
      <Text style={{ color: SUBTLE, fontSize: 12, letterSpacing: 0.5, textTransform: 'uppercase', fontFamily: P500 }}>{label}</Text>
      <Text style={{ color: TEXT, fontSize: 14, marginTop: 2, fontFamily: P400 }}>{value}</Text>
    </View>
  );
}

// ===========================================================================
// 2. Navigation — "Favor Booked" (v.2 181:10690): dark map + navy directions
// banner + navy sheet: title, requester row, big arrival window + chip,
// Call / red Message rows, white I AM HERE, dark CANCEL THIS FAVOR.
// ===========================================================================
// Shown when the pal's in-flight favor vanished out from under them — the
// member canceled (store raised memberCanceled) or the favor otherwise ended.
// Without this, the booked/in-progress screens keep ghost "I AM HERE"/"CANCEL"
// buttons wired to a favor that no longer exists.
function PalFavorEndedState({ navigation }: any) {
  const s = useStore();
  const canceled = s.memberCanceled;
  return (
    <View style={{ flex: 1, backgroundColor: PAGE_BG, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <Ionicons name="close-circle" size={64} color={RED} />
      <Text style={{ color: TEXT, fontSize: 20, fontFamily: P600, textAlign: 'center', marginTop: 16 }}>
        {canceled ? 'This favor was canceled' : 'No active favor'}
      </Text>
      <Text style={{ color: SUBTLE, fontSize: 14, fontFamily: P400, textAlign: 'center', marginTop: 8, lineHeight: 21 }}>
        {canceled
          ? 'The Favor Member canceled this favor. You will not be charged or penalized — you are free to pick up another one.'
          : 'This favor is no longer active.'}
      </Text>
      <TouchableOpacity
        style={[st.whiteBtn, { marginTop: 24, alignSelf: 'stretch' }]}
        accessibilityRole="button"
        accessibilityLabel="Find another favor"
        onPress={() => {
          s.clearMemberCanceled();
          navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] });
        }}
      >
        <Text style={st.whiteBtnTxt}>FIND ANOTHER FAVOR</Text>
      </TouchableOpacity>
    </View>
  );
}

export const Navigation = ({ navigation }: any) => {
  const s = useStore();
  const origin = usePalOrigin();
  const fav = s.activePalFavor;
  const [callOpen, setCallOpen] = useState(false);
  const [arriveOpen, setArriveOpen] = useState(false);
  const [arriveBusy, setArriveBusy] = useState(false);
  const [arriveError, setArriveError] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const [cancelledOpen, setCancelledOpen] = useState(false);
  const [mapsError, setMapsError] = useState(false);
  const fontsLoaded = usePoppins();

  // Minimized variant: the booked sheet collapses to a compact row so the map
  // reads almost full-screen. Drag down on the handle (or tap it) minimizes;
  // drag up (or tap) restores. Deliberately not persisted — default expanded.
  const [minimized, setMinimized] = useState(false);
  const bookedDrag = useSheetDrag({
    onRelease: (direction) => {
      if (direction === 'down') setMinimized(true);
      else if (direction === 'up') setMinimized(false);
    },
    maxUp: 60,
    maxDown: 60,
  });

  const memberName = fav?.memberName ?? 'Favor Member';
  const tierName = fav ? tierLabel(fav) : 'Favor';
  const distance = fav ? fmtMiles(favorDistance(fav, origin)) : '';

  // Turn-by-turn (banner + action row): in-app Mapbox navigation when the
  // native module + token are in this build, else hand off to the device's
  // maps app (openTurnByTurn returns false only when every deep-link rung
  // threw).
  const getDirections = async () => {
    if (!fav?.location) return;
    if (TURN_BY_TURN_SUPPORTED) {
      navigation.navigate('TurnByTurn', { favorId: fav.id, ...fav.location });
      return;
    }
    const ok = await openTurnByTurn(fav.location);
    if (!ok) setMapsError(true);
  };
  const window = fav?.etaWindow
    ?? (fav?.scheduledFor ? new Date(fav.scheduledFor).toLocaleString([], { hour: 'numeric', minute: '2-digit' }) : 'As soon as possible');
  // v.2 banner reads "↑ Head west on 2nd St." — steer to the favor's address.
  const banner = fav?.location?.address ? `Head to ${fav.location.address}` : 'Head to the favor location.';

  const [msgBusy, setMsgBusy] = useState(false);
  const [msgError, setMsgError] = useState(false);
  // Fast path: a thread with this member is usually already in the store —
  // open it instantly instead of blocking on a create-thread round trip.
  const memberThread = s.threads.find((t) => t.withUser.id === fav?.memberId);
  const openMessage = async () => {
    if (!fav?.memberId || msgBusy) return;
    if (memberThread) {
      navigation.navigate('MessageThread', { threadId: memberThread.id });
      return;
    }
    setMsgBusy(true);
    const id = await s.openThreadWith(fav.memberId);
    setMsgBusy(false);
    if (id) navigation.navigate('MessageThread', { threadId: id });
    else setMsgError(true); // openThreadWith swallows the error — never fail silently
  };

  // Real phone call — the in-flight favor carries the member's number for the
  // assigned pal. Web / missing number falls back to the info modal.
  const callMember = () => {
    const phone = fav?.memberPhone;
    if (Platform.OS === 'web' || !phone) {
      setCallOpen(true);
      return;
    }
    Linking.openURL(`tel:${phone}`).catch(() => setCallOpen(true));
  };

  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: PAGE_BG }} />;
  // The favor ended under us (member canceled). Guard — but never while OUR own
  // cancel confirmation modal is up (abandonFavor also clears the slot).
  if (!fav && !cancelledOpen) return <PalFavorEndedState navigation={navigation} />;

  return (
    <View style={{ flex: 1, backgroundColor: PAGE_BG }}>
      <MapBackdrop route dest={fav?.location} />
      <MapTopBar navigation={navigation} banner={banner} onBannerPress={fav?.location ? getDirections : undefined} />
      <LocationDeniedBanner visible={s.locationDenied} />
      <Animated.View style={[st.sheet, { transform: [{ translateY: bookedDrag.y }] }]}>
        {/* Grab strip (handle row only — never the whole sheet). The pan claims
            only on a >6px vertical move, so plain taps still reach the toggle.
            The padding lives on the TOUCHABLE and the negative margin on the
            pan view, keeping the whole strip inside the pan view's bounds —
            Android drops touches that land outside a parent's box. */}
        <View {...bookedDrag.panHandlers} style={st.grabWrap}>
          <TouchableOpacity
            onPress={() => setMinimized((m) => !m)}
            style={st.grabBtn}
            accessibilityRole="button"
            accessibilityState={{ expanded: !minimized }}
            accessibilityLabel={minimized ? 'Expand favor details' : 'Minimize favor details'}
          >
            <Handle />
          </TouchableOpacity>
        </View>
        {minimized ? (
          // Compact row — the map stays almost full-screen; I AM HERE / CANCEL
          // exist only in the expanded variant.
          <View style={st.miniRow}>
            <Avatar uri={undefined} size={40} name={memberName} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={{ color: TEXT, fontSize: 15, fontFamily: P500 }} numberOfLines={1}>{memberName}</Text>
              <Text style={{ color: SUBTLE, fontSize: 13, marginTop: 1, fontFamily: P400 }} numberOfLines={1}>{tierName}</Text>
            </View>
            <Text style={{ color: TEXT, fontSize: 15, fontFamily: P500, textAlign: 'right', flexShrink: 1, marginLeft: 10 }} numberOfLines={1}>{window}</Text>
            <Ionicons name="chevron-up" size={18} color={SUBTLE} style={{ marginLeft: 8 }} />
          </View>
        ) : (
          <>
            <Text style={{ color: TEXT, fontSize: 18, fontFamily: P600, textAlign: 'center', marginVertical: 12 }}>Favor Booked</Text>
            <View style={st.divider} />
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16 }}
              onPress={() => { if (fav?.memberId) navigation.navigate('MemberProfile', { userId: fav.memberId }); }}
              accessibilityRole="button"
              accessibilityLabel={`View ${memberName}'s profile and reviews`}
            >
              <Avatar uri={undefined} size={56} name={memberName} />
              {/* flex:1 + numberOfLines so a long member name truncates instead of
                  running off the sheet (rows default to flexShrink:0). */}
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={{ color: TEXT, fontSize: 17, fontFamily: P500 }} numberOfLines={1}>{memberName}</Text>
                <Text style={{ color: SUBTLE, fontSize: 14, marginTop: 2, fontFamily: P400 }}>{tierName}</Text>
                {distance ? <Text style={{ color: SUBTLE, fontSize: 13, marginTop: 2, fontFamily: P400 }}>{distance} away</Text> : null}
              </View>
            </TouchableOpacity>
            <Text style={{ color: TEXT, fontSize: 28, fontFamily: P500, textAlign: 'center', marginTop: 18 }}>{window}</Text>
            <View style={st.windowPill}><Text style={{ color: SUBTLE, fontSize: 13, fontFamily: P400 }}>Arrival Window</Text></View>

            <ActionRow icon="navigate" label="Get directions (opens Maps)" onPress={getDirections} />
            <ActionRow icon="call" label="Call About This Favor" onPress={callMember} />
            <ActionRow icon="mail" label={msgBusy ? 'Opening chat…' : 'Message Favor Member'} red disabled={msgBusy} onPress={openMessage} />

            <TouchableOpacity
              style={st.whiteBtn}
              accessibilityRole="button"
              accessibilityLabel="I have arrived"
              onPress={() => setArriveOpen(true)}
            >
              <Text style={st.whiteBtnTxt}>I AM HERE</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={st.darkBtn}
              accessibilityRole="button"
              accessibilityLabel="Cancel this favor"
              onPress={() => setCancelOpen(true)}
            >
              <Text style={st.darkBtnTxt}>CANCEL THIS FAVOR</Text>
            </TouchableOpacity>
          </>
        )}
      </Animated.View>

      {/* Arrive confirm (v.2 Arrive Modal) — fires before marking arrived.
          Awaited: advanceFavor reverts + returns false on API failure, and
          navigating forward on a failed advance would leave the server on
          'matched' while the UI claims arrival (the finish would then 409). */}
      <NavyModal
        visible={arriveOpen}
        title="You have arrived to your destination"
        message={`Notify ${memberName} that you have arrived.`}
        primaryLabel={arriveBusy ? 'CONFIRMING…' : 'I AM HERE'}
        onPrimary={async () => {
          if (arriveBusy) return;
          setArriveBusy(true);
          const ok = await s.advanceFavor('arrived');
          setArriveBusy(false);
          setArriveOpen(false);
          // replace (not push): back from In Progress must not land on this
          // stale "Favor Booked" sheet with a dead I AM HERE.
          if (ok) navigation.replace('PalFavorInProgress');
          else setArriveError("We couldn't mark you as arrived. Check your connection and try again.");
        }}
        dismissLabel="Not yet"
        onDismiss={() => { if (!arriveBusy) setArriveOpen(false); }}
      />
      <NavyModal
        visible={!!arriveError}
        title="Couldn't update your status"
        message={arriveError}
        primaryLabel="OK"
        onPrimary={() => setArriveError('')}
      />
      {/* Cancel confirm (v.2 Cancel Favor Modal — pal copy). Awaited: the
          "member was notified" confirmation may only appear when the server
          actually released the favor. */}
      <NavyModal
        visible={cancelOpen}
        title="Are you sure you want to cancel?"
        message="You will not receive payment for this favor if you cancel."
        primaryLabel={cancelBusy ? 'CANCELLING…' : 'AGREE'}
        onPrimary={async () => {
          if (cancelBusy) return;
          setCancelBusy(true);
          const ok = await s.abandonFavor();
          setCancelBusy(false);
          setCancelOpen(false);
          if (ok) setCancelledOpen(true);
          else setCancelError("We couldn't cancel this favor. Check your connection and try again — you are still assigned to it.");
        }}
        dismissLabel="Keep this favor"
        onDismiss={() => { if (!cancelBusy) setCancelOpen(false); }}
      />
      <NavyModal
        visible={!!cancelError}
        title="Couldn't cancel"
        message={cancelError}
        primaryLabel="OK"
        onPrimary={() => setCancelError('')}
      />
      {/* Cancellation confirmed (v.2). */}
      <NavyModal
        visible={cancelledOpen}
        title="Cancelled."
        message="Notification of cancelled favor was sent to favor member."
        primaryLabel="FIND ANOTHER FAVOR"
        onPrimary={() => { setCancelledOpen(false); navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] }); }}
      />
      {/* Fallback when a phone call can't start on this device (web / no number). */}
      <NavyModal
        visible={callOpen}
        title="Call unavailable"
        message={`We couldn't start a phone call to ${memberName} on this device. You can message them instead.`}
        primaryLabel="OK"
        onPrimary={() => setCallOpen(false)}
      />
      {/* Every maps deep link failed (openTurnByTurn exhausted its ladder). */}
      <NavyModal
        visible={mapsError}
        title="Couldn't open Maps"
        message="We couldn't hand off to a maps app on this device. Head to the address shown at the top of the screen."
        primaryLabel="OK"
        onPrimary={() => setMapsError(false)}
      />
      {/* Chat open failed (openThreadWith swallows the error). */}
      <NavyModal
        visible={msgError}
        title="Chat unavailable"
        message={`We couldn't open a chat with ${memberName}. Check your connection and try again.`}
        primaryLabel="OK"
        onPrimary={() => setMsgError(false)}
      />
    </View>
  );
};

function ActionRow({ icon, label, red, onPress, disabled }: any) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      disabled={!!disabled}
      style={[st.actionRow, disabled && { opacity: 0.6 }]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
    >
      <Ionicons name={icon} size={20} color={red ? RED : TEXT} />
      <Text style={{ color: red ? RED : TEXT, fontSize: 15, marginLeft: 14, flex: 1, fontFamily: P500 }}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={red ? RED : SUBTLE} />
    </TouchableOpacity>
  );
}

// ===========================================================================
// 3. PalFavorInProgress — "Favor In Progress / Arrived" (v.2 181:10783):
// dark map + red route, "You have arrived." banner once arrived, bottom mini
// card (requester, time window, distance) + white MARK AS DONE.
// ===========================================================================
export const PalFavorInProgress = ({ navigation }: any) => {
  const s = useStore();
  const insets = useSafeAreaInsets();
  const origin = usePalOrigin();
  const fontsLoaded = usePoppins();
  const [finishBusy, setFinishBusy] = useState(false);
  const [finishError, setFinishError] = useState('');
  const [mapsError, setMapsError] = useState(false);
  const fav = s.activePalFavor;
  // Finished-but-unreleased work belongs to the awaiting-release screen — a
  // cold reopen (or a poll tick landing 'pending_release' mid-view) hands over
  // there so this screen never shows MARK AS DONE for work that's already done.
  // Guarded on !finishBusy: our OWN finish resets to it with the payout params,
  // and this redirect must not double-navigate around that reset.
  const awaitingRelease = fav?.status === 'pending_release';
  useEffect(() => {
    if (awaitingRelease && fav && !finishBusy) navigation.replace('PalAwaitingRelease', { favorId: fav.id });
  }, [awaitingRelease, finishBusy]); // eslint-disable-line react-hooks/exhaustive-deps
  const base = fav?.price ?? 20;
  // Pal-side breakdown — what the pal takes home, NOT the member's invoice.
  const { payout, commission } = computePayout(base);
  // Exact address is appropriate here: the pal has already accepted the favor.
  const address = fav?.location?.address || 'Address shared by the member';
  const memberName = fav?.memberName ?? 'Favor Member';
  const tierName = fav ? tierLabel(fav) : 'Favor';
  const distance = fav ? fmtMiles(favorDistance(fav, origin)) : '';
  const arrived = fav?.status === 'arrived' || fav?.status === 'in_progress';
  const window = fav?.etaWindow
    ?? (fav?.scheduledFor ? new Date(fav.scheduledFor).toLocaleString([], { hour: 'numeric', minute: '2-digit' }) : 'As soon as possible');
  const banner = arrived
    ? 'You have arrived.'
    : (fav?.location?.address ? `Head to ${fav.location.address}` : 'Head to the favor location.');

  // Turn-by-turn (banner + mini-card action row, both only while still en
  // route — directions after arrival are noise): in-app Mapbox navigation when
  // the native module + token are in this build, else hand off to the device's
  // maps app (openTurnByTurn returns false only when every rung threw).
  const getDirections = async () => {
    if (!fav?.location) return;
    if (TURN_BY_TURN_SUPPORTED) {
      navigation.navigate('TurnByTurn', { favorId: fav.id, ...fav.location });
      return;
    }
    const ok = await openTurnByTurn(fav.location);
    if (!ok) setMapsError(true);
  };

  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: PAGE_BG }} />;
  // Blank frame while the awaiting-release replace above lands — the
  // in-progress UI below would be a lie for finished work.
  if (awaitingRelease) return <View style={{ flex: 1, backgroundColor: PAGE_BG }} />;
  // The favor ended under us (member canceled) — our own finish resets straight
  // to the awaiting-release screen, so a null favor here is the other side's doing.
  if (!fav) return <PalFavorEndedState navigation={navigation} />;

  return (
    <View style={{ flex: 1, backgroundColor: PAGE_BG }}>
      <MapBackdrop route dest={fav?.location} />
      <MapTopBar navigation={navigation} banner={banner} onBannerPress={!arrived && fav?.location ? getDirections : undefined} />
      <LocationDeniedBanner visible={s.locationDenied} />
      <View style={[st.miniCard, { bottom: insets.bottom + 16 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Avatar uri={undefined} size={48} name={memberName} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={{ color: TEXT, fontSize: 16, fontFamily: P500 }}>{memberName}</Text>
            <Text style={{ color: SUBTLE, fontSize: 13, marginTop: 2, fontFamily: P400 }}>{tierName}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ color: TEXT, fontSize: 15, fontFamily: P500 }}>{window}</Text>
            <Text style={{ color: SUBTLE, fontSize: 13, marginTop: 2, fontFamily: P400 }}>{arrived ? '0 mile away' : distance ? `${distance} away` : ''}</Text>
          </View>
        </View>
        {/* app addition — no v2 frame (destination + pal-side payout breakdown) */}
        <View style={[st.divider, { marginTop: 14 }]} />
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
          <Ionicons name="location" size={15} color={SUBTLE} />
          <Text style={{ color: SUBTLE, fontSize: 13, marginLeft: 6, flex: 1, fontFamily: P400 }} numberOfLines={1}>{address}</Text>
        </View>
        {/* Maps handoff — only while still heading there; once arrived the row
            would only invite a pointless re-route to where the pal is standing. */}
        {!arrived ? (
          <ActionRow icon="navigate" label="Get directions (opens Maps)" onPress={getDirections} />
        ) : null}
        <View style={{ marginTop: 8 }}>
          <CostRow label={tierName} value={`$${base.toFixed(2)}`} bold />
          <CostRow label="Platform commission (20%)" value={`-$${commission.toFixed(2)}`} />
          <CostRow label="You earn" value={`$${payout.toFixed(2)}`} bold />
        </View>
        <TouchableOpacity
          style={[st.whiteBtn, { marginTop: 16, opacity: fav && !finishBusy ? 1 : 0.5 }]}
          disabled={!fav || finishBusy}
          accessibilityRole="button"
          accessibilityLabel="Mark favor done and ask for the payment release"
          accessibilityState={{ disabled: !fav || finishBusy }}
          onPress={async () => {
            // Guards: never let a null favor produce a phantom payout, and never
            // fire a second finish while one is in flight.
            if (!s.activePalFavor || finishBusy) return;
            const finishedId = s.activePalFavor.id;
            setFinishBusy(true);
            const res = await s.finishFavorAsPal();
            if (res.ok) {
              // The work is done but NO money moved yet — park on the
              // awaiting-release screen (its 5s poll catches the member's
              // release). Reset so backing out lands on Tabs, not this
              // now-stale in-progress screen. finishBusy stays true: we're
              // leaving, and releasing it would re-arm the redirect above.
              navigation.reset({
                index: 1,
                routes: [{ name: 'Tabs' }, {
                  name: 'PalAwaitingRelease',
                  params: { payout: res.payout, favorId: finishedId },
                }],
              });
            } else {
              setFinishBusy(false);
              // The server rejected the finish — say why instead of celebrating.
              setFinishError(res.reason || 'Could not complete the favor. Please try again.');
            }
          }}
        >
          <Text style={st.whiteBtnTxt}>{finishBusy ? 'FINISHING…' : 'MARK AS DONE'}</Text>
        </TouchableOpacity>
      </View>
      <NavyModal
        visible={!!finishError}
        title="Couldn't complete the favor"
        message={finishError}
        primaryLabel="OK"
        onPrimary={() => setFinishError('')}
      />
      {/* Every maps deep link failed (openTurnByTurn exhausted its ladder). */}
      <NavyModal
        visible={mapsError}
        title="Couldn't open Maps"
        message="We couldn't hand off to a maps app on this device. Head to the address shown at the top of the screen."
        primaryLabel="OK"
        onPrimary={() => setMapsError(false)}
      />
    </View>
  );
};

function CostRow({ label, value, bold }: any) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginVertical: 2 }}>
      <Text style={{ color: bold ? TEXT : SUBTLE, fontSize: 14, fontFamily: bold ? P500 : P400 }}>{label}</Text>
      <Text style={{ color: bold ? TEXT : SUBTLE, fontSize: 14, fontFamily: bold ? P500 : P400 }}>{value}</Text>
    </View>
  );
}

// ===========================================================================
// 3b. PalAwaitingRelease — "Favor finished!" — app addition — no v2 frame
// (release flow); v.2 dark success language. The work is done but NO money has
// moved: the member was asked to release the payment, and this screen polls
// the favor every 5s until the release lands (→ PalFavorSuccess). The pal is
// free to pick up new work meanwhile — FIND ANOTHER FAVOR resets to Tabs.
// ===========================================================================
export const PalAwaitingRelease = ({ navigation, route }: any) => {
  const s = useStore();
  const fontsLoaded = usePoppins();
  const paramFavorId: string | undefined = route?.params?.favorId;
  const paramPayout: number | undefined = route?.params?.payout;
  // Pin the favor on first render: the app-wide poll clears the pal slot the
  // moment the member releases (the favor leaves the active set), and this
  // screen must keep its name/amounts while its own poll confirms the release.
  const pinnedRef = useRef<Favor | null>(null);
  if (!pinnedRef.current) {
    const slot = s.activePalFavor;
    if (slot?.status === 'pending_release' && (!paramFavorId || slot.id === paramFavorId)) {
      pinnedRef.current = slot;
    }
  }
  const fav = pinnedRef.current;
  const favorId: string | undefined = paramFavorId ?? fav?.id;
  const [gone, setGone] = useState(false);

  // Release watch: every 5s ask the server whether the member released. A
  // 'cancelled' can't happen (the server 409s cancel on pending_release), so
  // the only exits are completed → success, or the favor no longer being
  // visible to us → neutral ended state.
  useEffect(() => {
    if (!favorId) return;
    let busy = false;
    const id = setInterval(async () => {
      if (busy) return; // slow network — never stack ticks
      busy = true;
      try {
        const { favor } = await getFavorApi(favorId);
        if (favor?.status === 'completed') {
          clearInterval(id);
          // ledgerStatus is deliberately undefined: PalFavorSuccess refreshes
          // the earnings ledger and derives the honest paid / pending-collection
          // copy from the REAL earning row for this favor.
          navigation.reset({
            index: 1,
            routes: [{ name: 'Tabs' }, {
              name: 'PalFavorSuccess',
              params: {
                payout: paramPayout ?? computePayout(favor.price).payout,
                favorId,
                ledgerStatus: undefined,
              },
            }],
          });
        }
      } catch (e: any) {
        // 403/404 = the favor is no longer ours/visible — a neutral ended
        // state. Anything else is transient: keep waiting.
        if (e?.status === 403 || e?.status === 404) {
          clearInterval(id);
          setGone(true);
        }
      } finally {
        busy = false;
      }
    }, 5000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [favorId]);

  const memberName = fav?.memberName ?? 'the member';
  const base = fav?.price;
  const { payout: computedPayout, commission } = computePayout(base ?? 0);
  const payout = paramPayout ?? (typeof base === 'number' ? computedPayout : undefined);

  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: PAGE_BG }} />;
  if (gone || !favorId) return <PalFavorEndedState navigation={navigation} />;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: PAGE_BG }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
        <Ionicons name="checkmark-circle" size={120} color={SUCCESS} />
        <Text style={{ color: TEXT, fontSize: 24, fontFamily: P500, textAlign: 'center', marginTop: 24 }}>
          Favor finished!
        </Text>
        <Text style={{ color: SUBTLE, fontSize: 15, lineHeight: 22, fontFamily: P400, textAlign: 'center', marginTop: 10 }}>
          {`We’ve asked ${memberName} to release your payment.`}
        </Text>
        {typeof payout === 'number' ? (
          <Text style={{ color: TEXT, fontSize: 18, fontFamily: P500, textAlign: 'center', marginTop: 18 }}>
            {`You’ll receive $${payout.toFixed(2)}`}
          </Text>
        ) : null}
        {fav && typeof base === 'number' ? (
          // Same pal-side breakdown the in-progress card shows — the exact
          // numbers the member's release will settle.
          <View style={{ alignSelf: 'stretch', backgroundColor: SHEET, borderRadius: 16, padding: 16, marginTop: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER }}>
            <CostRow label={tierLabel(fav)} value={`$${base.toFixed(2)}`} bold />
            <CostRow label="Platform commission (20%)" value={`-$${commission.toFixed(2)}`} />
            <CostRow label="You earn" value={`$${computedPayout.toFixed(2)}`} bold />
          </View>
        ) : null}
      </View>
      <View style={{ paddingHorizontal: 24, paddingBottom: 12 }}>
        <TouchableOpacity
          style={st.whiteBtn}
          accessibilityRole="button"
          accessibilityLabel="Find another favor"
          onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] })}
        >
          <Text style={st.whiteBtnTxt}>FIND ANOTHER FAVOR</Text>
        </TouchableOpacity>
        <Text style={{ color: SUBTLE, fontSize: 13, lineHeight: 19, fontFamily: P400, textAlign: 'center', marginTop: 14 }}>
          {'We’ll notify you the moment it’s released.'}
        </Text>
      </View>
    </SafeAreaView>
  );
};

// ===========================================================================
// 4. PalFavorSuccess — "Favor Success" (v.2): black full screen, green check
// circle, "You just got paid!", white ADD FEEDBACK + dark FIND ANOTHER FAVOR.
// ===========================================================================
export const PalFavorSuccess = ({ navigation, route }: any) => {
  const fontsLoaded = usePoppins();
  const s = useStore();
  const { payout: optimisticPayout, favorId, ledgerStatus } = route?.params ?? {};
  // The member's release settled the ledger seconds ago, server-side — fetch a
  // fresh earnings snapshot so the paid / pending-collection copy below derives
  // from the REAL earning row (the awaiting-release path passes no ledgerStatus
  // param at all; the store's copy predates the settle).
  const [freshEarnings, setFreshEarnings] = useState<Transaction[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    void getEarningsApi()
      .then(({ earnings }) => { if (!cancelled) setFreshEarnings(earnings); })
      .catch(() => undefined); // transient — the store snapshot below still serves
    return () => { cancelled = true; };
  }, []);
  // The amount passed in params is the server's response; once the earnings
  // refresh lands, the ledger row for this favor carries the authoritative
  // payout AND status — prefer it.
  const rows = freshEarnings ?? s.earnings;
  const serverRow = favorId
    ? rows.find((e) => e.favorId === favorId && e.kind === 'earning' && !e.id.startsWith('pending_'))
    : undefined;
  const payout = serverRow?.amount ?? optimisticPayout;
  const paid = typeof payout === 'number';
  // "You just got paid!" is only honest when the earning settled 'completed' —
  // an 'incomplete' row was recorded but not collected (not cashable yet).
  const collected = (serverRow?.status ?? ledgerStatus) !== 'incomplete';
  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: PAGE_BG }} />;
  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: PAGE_BG }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
        <Ionicons name="checkmark-circle" size={120} color={SUCCESS} />
        <Text style={{ color: TEXT, fontSize: 24, fontFamily: P500, textAlign: 'center', marginTop: 24 }}>
          {collected ? 'You just got paid!' : 'Favor completed!'}
        </Text>
        {paid && (
          // app addition — no v2 frame (surface the exact amount + ledger note)
          <Text style={{ color: SUBTLE, fontSize: 15, lineHeight: 22, fontFamily: P400, textAlign: 'center', marginTop: 10 }}>
            {collected
              ? `$${payout.toFixed(2)} was added to your Earning History.`
              : `$${payout.toFixed(2)} is pending collection — it will show in your Earning History.`}
          </Text>
        )}
      </View>
      <View style={{ paddingHorizontal: 24, paddingBottom: 12 }}>
        <TouchableOpacity
          style={st.whiteBtn}
          accessibilityRole="button"
          accessibilityLabel="Add feedback"
          onPress={() => navigation.navigate('PalFavorComplete', { favorId })}
        >
          <Text style={st.whiteBtnTxt}>ADD FEEDBACK</Text>
        </TouchableOpacity>
        {/* Feedback is optional — a neutral exit so the pal is never trapped. */}
        <TouchableOpacity
          style={st.darkBtn}
          accessibilityRole="button"
          accessibilityLabel="Find another favor"
          onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] })}
        >
          <Text style={st.darkBtnTxt}>FIND ANOTHER FAVOR</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

// ===========================================================================
// 5. PalFavorComplete — "Favor Complete" (v.2 181:11282): "Thank You!" +
// celebration illustration + Rating stars + navy feedback field + white
// SUBMIT FEEDBACK, on the dark page bg.
// ===========================================================================
export const PalFavorComplete = ({ navigation, route }: any) => {
  const s = useStore();
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState('');
  // "Feedback Submitted" confirmation (v.2 181:11267) — a green-check success
  // state shown after rating, before returning home, instead of exiting silently.
  const [submitted, setSubmitted] = useState(false);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const fontsLoaded = usePoppins();
  // The favor itself was completed at MARK AS DONE; here the pal rates the
  // MEMBER (the reverse review). The favor id travels via navigation params so
  // the review still lands after an app restart; success is only claimed when
  // the server actually persisted it.
  const onSubmit = async () => {
    if (!rating || submitBusy) return;
    setSubmitBusy(true);
    const favorId = route?.params?.favorId ?? null;
    try {
      if (favorId) {
        // Call the API directly when we know the favor id so the server's real
        // reasons (e.g. 409 "Favor already rated") reach the pal — the store's
        // rateMember collapses every failure to connection blame.
        await rateMemberApi(favorId, { rating, feedback: feedback ?? '' });
      } else if (!(await s.rateMember(null, rating, feedback))) {
        throw new Error('Could not submit your feedback. Check your connection and try again.');
      }
      setSubmitted(true);
    } catch (e: any) {
      setSubmitError(e?.message || 'Could not submit your feedback. Check your connection and try again.');
    } finally {
      setSubmitBusy(false);
    }
  };
  // Rating the member is optional — let the pal leave without being forced to rate.
  const skip = () => navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] });
  const done = () => navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] });
  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: PAGE_BG }} />;

  if (submitted) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: PAGE_BG }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
          <Ionicons name="checkmark-circle" size={120} color={SUCCESS} />
          <Text style={{ color: TEXT, fontSize: 24, fontFamily: P500, textAlign: 'center', marginTop: 24 }}>
            Feedback Submitted
          </Text>
          <Text style={{ color: SUBTLE, fontSize: 15, lineHeight: 22, fontFamily: P400, textAlign: 'center', marginTop: 10 }}>
            Thanks for your feedback.
          </Text>
        </View>
        <View style={{ paddingHorizontal: 24, paddingBottom: 12 }}>
          <TouchableOpacity
            style={st.whiteBtn}
            accessibilityRole="button"
            accessibilityLabel="Find another favor"
            onPress={done}
          >
            <Text style={st.whiteBtnTxt}>FIND ANOTHER FAVOR</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: PAGE_BG }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24, flexGrow: 1 }}>
        <Text style={{ color: TEXT, fontSize: 26, fontFamily: P600, textAlign: 'center', marginTop: 24 }}>Thank You!</Text>
        <Image source={CELEBRATION} style={{ width: '100%', height: 280, marginTop: 12 }} resizeMode="contain" />
        <View style={[st.divider, { marginTop: 8 }]} />
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 20 }}>
          <Text style={{ color: TEXT, fontSize: 20, fontFamily: P500, marginRight: 24 }}>Rating</Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {[1, 2, 3, 4, 5].map((i) => (
              <TouchableOpacity
                key={i}
                onPress={() => setRating(i)}
                accessibilityRole="button"
                accessibilityLabel={`Rate ${i} ${i === 1 ? 'star' : 'stars'}`}
                accessibilityState={{ selected: i <= rating }}
              >
                <Ionicons name={i <= rating ? 'star' : 'star-outline'} size={30} color={STAR} />
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View style={[st.divider, { marginTop: 20 }]} />
        <Text style={{ color: TEXT, fontSize: 15, fontFamily: P400, marginTop: 20 }}>Tell us about your experience</Text>
        <View style={st.feedbackBox}>
          <TextInput
            style={{ color: TEXT, fontSize: 15, lineHeight: 22, fontFamily: P400, minHeight: 120, textAlignVertical: 'top' }}
            multiline
            maxLength={700}
            value={feedback}
            onChangeText={setFeedback}
            placeholder="Write your feedback..."
            placeholderTextColor={MUTED}
            accessibilityLabel="Write your feedback"
          />
        </View>
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          style={[st.whiteBtn, { marginTop: 28, opacity: rating && !submitBusy ? 1 : 0.5 }]}
          disabled={!rating || submitBusy}
          accessibilityRole="button"
          accessibilityLabel="Submit feedback"
          accessibilityState={{ disabled: !rating || submitBusy }}
          onPress={onSubmit}
        >
          <Text style={st.whiteBtnTxt}>{submitBusy ? 'SUBMITTING…' : 'SUBMIT FEEDBACK'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={skip}
          style={{ alignSelf: 'center', marginTop: 16, paddingVertical: 6 }}
          accessibilityRole="button"
          accessibilityLabel="Skip rating and return home"
        >
          <Text style={{ color: SUBTLE, fontSize: 14, fontFamily: P500 }}>Maybe later</Text>
        </TouchableOpacity>
      </ScrollView>
      <NavyModal
        visible={!!submitError}
        title="Feedback not sent"
        message={submitError}
        primaryLabel="OK"
        onPrimary={() => setSubmitError('')}
      />
    </SafeAreaView>
  );
};

const st = StyleSheet.create({
  iconBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: SHEET_ALT, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER },
  navBanner: { backgroundColor: SHEET, borderRadius: 8, paddingHorizontal: 18, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER },
  // maxHeight so an expanded long description scrolls inside the sheet instead
  // of growing the bottom-anchored sheet past the top of the screen.
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '86%', backgroundColor: SHEET, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 36, borderTopWidth: StyleSheet.hairlineWidth, borderColor: BORDER, shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 16 },
  miniCard: { position: 'absolute', left: 16, right: 16, backgroundColor: SHEET, borderRadius: 16, padding: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 16 },
  handle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.25)' },
  // Full-width grab strip around the handle: the vertical padding fattens the
  // drag/tap target while the matching negative margin keeps the sheet layout
  // pixel-identical to the bare <Handle />.
  grab: { alignSelf: 'stretch', paddingVertical: 10, marginVertical: -10 },
  // Same strip split for the booked sheet, where a toggle TouchableOpacity sits
  // inside the pan view: margin on the wrapper, padding on the touchable.
  grabWrap: { alignSelf: 'stretch', marginVertical: -10 },
  grabBtn: { alignSelf: 'stretch', paddingVertical: 10 },
  // Minimized booked-sheet row (Avatar 40 · name + tier · arrival window · chevron).
  miniRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: DIVIDER },
  windowPill: { alignSelf: 'center', backgroundColor: SHEET_ALT, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 6, marginTop: 8 },
  waitBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: SHEET_ALT, borderRadius: 10, paddingVertical: 14, marginTop: 22, borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER },
  waitText: { color: TEXT, fontSize: 15, fontFamily: P500 },
  actionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: DIVIDER },
  whiteBtn: { backgroundColor: CTA_BG, borderRadius: 8, height: 48, alignItems: 'center', justifyContent: 'center', marginTop: 22 },
  // Negotiation modal (navy card over 50% scrim, matches NavyModal visuals)
  offerScrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  offerCard: { alignSelf: 'stretch', backgroundColor: SHEET, borderRadius: 16, paddingHorizontal: 20, paddingVertical: 24, borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER },
  offerTitle: { color: TEXT, fontSize: 19, fontFamily: P500, textAlign: 'center' },
  offerBody: { color: SUBTLE, fontSize: 14, lineHeight: 21, fontFamily: P400, textAlign: 'center', marginTop: 10 },
  offerField: { marginTop: 18, height: 48, borderRadius: 10, backgroundColor: FIELD, paddingHorizontal: 14, justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER },
  offerInput: { color: TEXT, fontSize: 16, fontFamily: P500, padding: 0 },
  whiteBtnTxt: { color: CTA_TEXT, fontSize: 15, letterSpacing: 0.5, fontFamily: P500 },
  darkBtn: { backgroundColor: DARK_BTN, borderRadius: 8, height: 48, alignItems: 'center', justifyContent: 'center', marginTop: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER },
  darkBtnTxt: { color: TEXT, fontSize: 15, letterSpacing: 0.5, fontFamily: P500 },
  modalScrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  modalCard: { width: '88%', backgroundColor: SHEET, borderRadius: 16, paddingHorizontal: 24, paddingVertical: 28, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER },
  modalTitle: { color: TEXT, fontSize: 22, lineHeight: 30, fontFamily: P500, textAlign: 'center' },
  modalBody: { color: SUBTLE, fontSize: 15, lineHeight: 22, fontFamily: P400, textAlign: 'center', marginTop: 12 },
  feedbackBox: { backgroundColor: FIELD, borderRadius: 12, padding: 16, marginTop: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER },
});
