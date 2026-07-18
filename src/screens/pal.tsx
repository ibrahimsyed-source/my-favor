import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, Image, StyleSheet, FlatList, RefreshControl, Modal, ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFonts, Poppins_400Regular } from '@expo-google-fonts/poppins';
import { Avatar } from '../components';
import { useStore } from '../store';
import { getIncomingApi } from '../api/endpoints';
import { computePayout, computeFees, FAVOR_TIERS, Favor } from '../types';

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
function MapBackdrop({ route }: { route?: boolean }) {
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

function MapTopBar({ navigation, banner, onBack }: any) {
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
          <View style={[st.navBanner, { flex: 1, marginHorizontal: 10 }]}>
            <Ionicons name="arrow-up" size={20} color={TEXT} />
            <Text style={{ color: TEXT, fontSize: 16, marginLeft: 10, fontFamily: P500, flex: 1 }} numberOfLines={1}>{banner}</Text>
          </View>
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
      <View style={st.modalScrim}>
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

// Pal origin for distance/sort. Anchored to the demo city (Miami) so it matches
// where the seeded/incoming favors actually are — an Austin origin made every
// favor read as ~1000 mi away and flattened the "Closest" sort. TODO: replace
// with the device's live location (expo-location) once a dev build is set up.
const PAL_ORIGIN = { lat: 25.7617, lng: -80.1918 };

const toRad = (d: number) => (d * Math.PI) / 180;
function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 3958.8; // earth radius (mi)
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
const favorDistance = (f: Favor) => haversineMiles(PAL_ORIGIN.lat, PAL_ORIGIN.lng, f.location.lat, f.location.lng);
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

function FavorCard({ favor, onPress }: { favor: Favor; onPress: () => void }) {
  const { payout } = computePayout(favor.price);
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={bw.card}
      accessibilityRole="button"
      accessibilityLabel={`${tierLabel(favor)}, $${favor.price}. ${favor.description}. You earn $${payout.toFixed(2)}.`}
    >
      <View style={bw.cardTop}>
        <View style={bw.tierPill}><Text style={bw.tierPillText}>{tierLabel(favor)}</Text></View>
        <Text style={bw.price}>${favor.price}</Text>
      </View>
      <Text style={bw.desc} numberOfLines={2}>{favor.description || 'No details provided.'}</Text>
      <View style={bw.metaRow}>
        <Ionicons name="location-outline" size={14} color={SUBTLE} />
        <Text style={bw.meta} numberOfLines={1}>{favor.location?.address || 'Nearby'}</Text>
        <Text style={bw.dot}>·</Text>
        <Text style={bw.meta}>{fmtMiles(favorDistance(favor))}</Text>
        {favor.createdAt ? <Text style={bw.dot}>·</Text> : null}
        {favor.createdAt ? <Text style={bw.meta}>{relTime(favor.createdAt)}</Text> : null}
      </View>
      {favor.scheduledFor ? (
        <View style={bw.schedRow}>
          <Ionicons name="calendar-outline" size={13} color={RED} />
          <Text style={bw.schedText}>
            Scheduled · {new Date(favor.scheduledFor).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
          </Text>
        </View>
      ) : null}
      <View style={bw.cardFooter}>
        <Text style={bw.earn}>You earn <Text style={bw.earnAmt}>${payout.toFixed(2)}</Text></Text>
        <View style={bw.viewBtn}>
          <Text style={bw.viewText}>View</Text>
          <Ionicons name="chevron-forward" size={15} color={CTA_TEXT} />
        </View>
      </View>
    </TouchableOpacity>
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
    else if (sort === 'close') list = [...list].sort((a, b) => favorDistance(a) - favorDistance(b));
    return list;
  }, [favors, tier, sort]);

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
  card: { backgroundColor: SHEET, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER },
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
  // "Waiting for confirmation" — the intermediate state between ACCEPT and Favor
  // Booked (v.2 181:11331). acceptFavor already claims the favor server-side; we
  // hold on the details sheet while the member confirms instead of navigating out.
  const [waiting, setWaiting] = useState(false);
  const fontsLoaded = usePoppins();

  const onAccept = async (favorId: string) => {
    if (accepting) return;
    setAccepting(true);
    const res = await s.acceptFavor(favorId);
    setAccepting(false);
    if (res.ok) setWaiting(true);
    else if (res.code === 'unavailable') navigation.navigate('FavorUnavailable');
    else setAcceptError(res.reason || 'This favor is no longer available.');
  };

  // Once the favor is ours, settle on the waiting sheet, then advance to Favor
  // Booked when the member confirms (simulated by a short settle before Navigation).
  useEffect(() => {
    if (!waiting) return;
    const t = setTimeout(() => navigation.navigate('Navigation'), 2600);
    return () => clearTimeout(t);
  }, [waiting, navigation]);
  // Bind strictly to the requested favor. Only fall back to the first open favor
  // when no id was passed (e.g. a bare deep-link) — never substitute a different
  // favor, or ACCEPT/DECLINE would silently act on the wrong one after a refresh.
  const favorId = route?.params?.favorId;
  const favor = favorId ? s.incomingFavors.find((f) => f.id === favorId) : s.incomingFavors[0];
  const gone = !!favorId && !favor;
  // Display source: acceptFavor() removes the favor from incomingFavors and moves
  // it into activeFavor, so during the "Waiting for confirmation" hold `favor` is
  // gone. Fall back to activeFavor so the sheet keeps the REAL title/name/fees
  // instead of collapsing to placeholders ($0.58, "Favor Member").
  const shownFavor = favor ?? s.activeFavor;
  const base = shownFavor?.price ?? 20;
  // v.2 quick view shows the requester's (first) name above the description.
  const requester = shownFavor?.memberName ?? 'Favor Member';
  const title = shownFavor ? `${tierLabel(shownFavor)} $${base}` : 'Favor request';
  // Pal-side economics: what THEY take home (never the member invoice total).
  const { payout } = computePayout(base);
  const area = shownFavor?.location?.address ?? 'Nearby';
  const when = shownFavor?.scheduledFor
    ? new Date(shownFavor.scheduledFor).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : shownFavor?.createdAt
      ? `Requested ${relTime(shownFavor.createdAt)}`
      : 'As soon as possible';
  // Member invoice breakdown for the waiting sheet (kept in lockstep with the
  // request-side math via computeFees so the two can never disagree).
  const { serviceFee, transactionFee } = computeFees(base);
  // Exact address is appropriate now — the pal has claimed the favor.
  const exactAddress = shownFavor?.location?.address ?? 'Address shared by the member';

  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: PAGE_BG }} />;

  if (waiting) {
    return (
      <View style={{ flex: 1, backgroundColor: PAGE_BG }}>
        <MapBackdrop />
        {/* Neutral back lands on Favor Booked — the favor is already accepted. */}
        <MapTopBar navigation={navigation} onBack={() => navigation.navigate('Navigation')} />
        <View style={st.sheet}>
          <Handle />
          <Text style={{ color: TEXT, fontSize: 19, fontFamily: P500, textAlign: 'center', marginVertical: 14 }}>{title}</Text>
          <View style={st.divider} />
          <View style={{ flexDirection: 'row', marginTop: 16 }}>
            <Avatar uri={undefined} size={56} name={requester} />
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={{ color: TEXT, fontSize: 16, fontFamily: P500 }}>{requester}</Text>
              <Text style={{ color: SUBTLE, fontSize: 14, lineHeight: 20, marginTop: 4, fontFamily: P400 }} numberOfLines={expanded ? undefined : 2}>
                {shownFavor?.description || 'No details provided yet.'}
              </Text>
              <TouchableOpacity
                onPress={() => setExpanded((v) => !v)}
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                accessibilityLabel={expanded ? 'View less favor detail' : 'View more favor detail'}
              >
                <Text style={{ color: TEXT, fontSize: 14, marginTop: 8, fontFamily: P500 }}>{expanded ? 'View Less' : 'View More'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={[st.divider, { marginTop: 16 }]} />
          <View style={{ marginTop: 12 }}>
            <CostRow label="Service Fee" value={`$${serviceFee.toFixed(2)}`} />
            <CostRow label="Transaction Fee" value={`$${transactionFee.toFixed(2)}`} />
          </View>
          <QuickRow label="Description" value={shownFavor?.description || 'No details provided yet.'} />
          <QuickRow label="Address" value={exactAddress} />

          <View style={st.waitBanner}>
            <ActivityIndicator color={TEXT} />
            <Text style={st.waitText}>Waiting for confirmation…</Text>
          </View>
        </View>
      </View>
    );
  }

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
            <TouchableOpacity style={[st.whiteBtn, { alignSelf: 'stretch' }]} onPress={() => navigation.goBack()}>
              <Text style={st.whiteBtnTxt}>BACK TO FAVORS</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: PAGE_BG }}>
      <MapBackdrop />
      <MapTopBar navigation={navigation} onBack={() => navigation.goBack()} />
      <View style={st.sheet}>
        <Handle />
        <Text style={{ color: TEXT, fontSize: 19, fontFamily: P500, textAlign: 'center', marginVertical: 14 }}>{title}</Text>
        <View style={st.divider} />
        <View style={{ flexDirection: 'row', marginTop: 16 }}>
          <Avatar uri={undefined} size={56} name={requester} />
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={{ color: TEXT, fontSize: 16, fontFamily: P500 }}>{requester}</Text>
            <Text style={{ color: SUBTLE, fontSize: 14, lineHeight: 20, marginTop: 4, fontFamily: P400 }} numberOfLines={expanded ? undefined : 2}>
              {shownFavor?.description || 'No details provided yet.'}
            </Text>
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

        <TouchableOpacity
          style={[st.whiteBtn, accepting && { opacity: 0.6 }]}
          disabled={accepting}
          accessibilityRole="button"
          accessibilityLabel="Accept this favor"
          onPress={() => { if (favor) void onAccept(favor.id); }}
        >
          <Text style={st.whiteBtnTxt}>{accepting ? 'ACCEPTING…' : 'ACCEPT'}</Text>
        </TouchableOpacity>
        <NavyModal
          visible={!!acceptError}
          title="Can't accept this favor"
          message={acceptError}
          primaryLabel="OK"
          onPrimary={() => setAcceptError('')}
        />
        <TouchableOpacity
          onPress={() => { if (favor) s.declineFavor(favor.id); navigation.goBack(); }}
          style={{ alignSelf: 'center', marginTop: 14 }}
          accessibilityRole="button"
          accessibilityLabel="Decline this favor"
        >
          <Text style={{ color: SUBTLE, fontSize: 14, fontFamily: P500 }}>decline this favor</Text>
        </TouchableOpacity>
      </View>
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
export const Navigation = ({ navigation }: any) => {
  const s = useStore();
  const fav = s.activeFavor;
  const [callOpen, setCallOpen] = useState(false);
  const [arriveOpen, setArriveOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelledOpen, setCancelledOpen] = useState(false);
  const fontsLoaded = usePoppins();
  const memberName = fav?.memberName ?? 'Favor Member';
  const tierName = fav ? tierLabel(fav) : 'Favor';
  const distance = fav ? fmtMiles(favorDistance(fav)) : '';
  const window = fav?.etaWindow
    ?? (fav?.scheduledFor ? new Date(fav.scheduledFor).toLocaleString([], { hour: 'numeric', minute: '2-digit' }) : 'As soon as possible');
  // v.2 banner reads "↑ Head west on 2nd St." — steer to the favor's address.
  const banner = fav?.location?.address ? `Head to ${fav.location.address}` : 'Head to the favor location.';

  const openMessage = async () => {
    if (!fav?.memberId) return;
    const id = await s.openThreadWith(fav.memberId);
    if (id) navigation.navigate('MessageThread', { threadId: id });
  };

  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: PAGE_BG }} />;

  return (
    <View style={{ flex: 1, backgroundColor: PAGE_BG }}>
      <MapBackdrop route />
      <MapTopBar navigation={navigation} banner={banner} />
      <View style={st.sheet}>
        <Handle />
        <Text style={{ color: TEXT, fontSize: 18, fontFamily: P600, textAlign: 'center', marginVertical: 12 }}>Favor Booked</Text>
        <View style={st.divider} />
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16 }}>
          <Avatar uri={undefined} size={56} name={memberName} />
          <View style={{ marginLeft: 14 }}>
            <Text style={{ color: TEXT, fontSize: 17, fontFamily: P500 }}>{memberName}</Text>
            <Text style={{ color: SUBTLE, fontSize: 14, marginTop: 2, fontFamily: P400 }}>{tierName}</Text>
            {distance ? <Text style={{ color: SUBTLE, fontSize: 13, marginTop: 2, fontFamily: P400 }}>{distance} away</Text> : null}
          </View>
        </View>
        <Text style={{ color: TEXT, fontSize: 28, fontFamily: P500, textAlign: 'center', marginTop: 18 }}>{window}</Text>
        <View style={st.windowPill}><Text style={{ color: SUBTLE, fontSize: 13, fontFamily: P400 }}>Arrival Window</Text></View>

        <ActionRow icon="call" label="Call About This Favor" onPress={() => setCallOpen(true)} />
        <ActionRow icon="mail" label="Message Favor Member" red onPress={openMessage} />

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
      </View>

      {/* Arrive confirm (v.2 Arrive Modal) — fires before marking arrived. */}
      <NavyModal
        visible={arriveOpen}
        title="You have arrived to your destination"
        message={`Notify ${memberName} that you have arrived.`}
        primaryLabel="I AM HERE"
        onPrimary={() => { setArriveOpen(false); s.advanceFavor('arrived'); navigation.navigate('PalFavorInProgress'); }}
        dismissLabel="Not yet"
        onDismiss={() => setArriveOpen(false)}
      />
      {/* Cancel confirm (v.2 Cancel Favor Modal — pal copy). */}
      <NavyModal
        visible={cancelOpen}
        title="Are you sure you want to cancel?"
        message="You will not receive payment for this favor if you cancel."
        primaryLabel="AGREE"
        onPrimary={() => { setCancelOpen(false); void s.abandonFavor(); setCancelledOpen(true); }}
        dismissLabel="Keep this favor"
        onDismiss={() => setCancelOpen(false)}
      />
      {/* Cancellation confirmed (v.2). */}
      <NavyModal
        visible={cancelledOpen}
        title="Cancelled."
        message="Notification of cancelled favor was sent to favor member."
        primaryLabel="FIND ANOTHER FAVOR"
        onPrimary={() => { setCancelledOpen(false); navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] }); }}
      />
      {/* Privacy: the call is relayed — the pal never sees the member's real number. */}
      <NavyModal
        visible={callOpen}
        title="Calling privately"
        message="We connect you and the Favor Member through a private relay, so neither of you ever sees the other's real phone number."
        primaryLabel="OK"
        onPrimary={() => setCallOpen(false)}
      />
    </View>
  );
};

function ActionRow({ icon, label, red, onPress }: any) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={st.actionRow}
      accessibilityRole="button"
      accessibilityLabel={label}
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
  const fontsLoaded = usePoppins();
  const fav = s.activeFavor;
  const base = fav?.price ?? 20;
  // Pal-side breakdown — what the pal takes home, NOT the member's invoice.
  const { payout, commission } = computePayout(base);
  // Exact address is appropriate here: the pal has already accepted the favor.
  const address = fav?.location?.address || 'Address shared by the member';
  const memberName = fav?.memberName ?? 'Favor Member';
  const tierName = fav ? tierLabel(fav) : 'Favor';
  const distance = fav ? fmtMiles(favorDistance(fav)) : '';
  const arrived = fav?.status === 'arrived' || fav?.status === 'in_progress';
  const window = fav?.etaWindow
    ?? (fav?.scheduledFor ? new Date(fav.scheduledFor).toLocaleString([], { hour: 'numeric', minute: '2-digit' }) : 'As soon as possible');
  const banner = arrived
    ? 'You have arrived.'
    : (fav?.location?.address ? `Head to ${fav.location.address}` : 'Head to the favor location.');

  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: PAGE_BG }} />;

  return (
    <View style={{ flex: 1, backgroundColor: PAGE_BG }}>
      <MapBackdrop route />
      <MapTopBar navigation={navigation} banner={banner} />
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
        <View style={{ marginTop: 8 }}>
          <CostRow label={tierName} value={`$${base.toFixed(2)}`} bold />
          <CostRow label="Platform commission (20%)" value={`-$${commission.toFixed(2)}`} />
          <CostRow label="You earn" value={`$${payout.toFixed(2)}`} bold />
        </View>
        <TouchableOpacity
          style={[st.whiteBtn, { marginTop: 16, opacity: fav ? 1 : 0.5 }]}
          disabled={!fav}
          accessibilityRole="button"
          accessibilityLabel="Mark favor done and get paid"
          accessibilityState={{ disabled: !fav }}
          onPress={() => {
            // Guard: never let a null favor produce a phantom payout.
            if (!s.activeFavor) return;
            const earned = s.finishFavorAsPal();
            // Terminal transition: reset so backing out lands on Tabs (not this
            // now-stale in-progress screen) and can't refire "You got paid".
            navigation.reset({ index: 1, routes: [{ name: 'Tabs' }, { name: 'PalFavorSuccess', params: { payout: earned } }] });
          }}
        >
          <Text style={st.whiteBtnTxt}>MARK AS DONE</Text>
        </TouchableOpacity>
      </View>
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
// 4. PalFavorSuccess — "Favor Success" (v.2): black full screen, green check
// circle, "You just got paid!", white ADD FEEDBACK + dark FIND ANOTHER FAVOR.
// ===========================================================================
export const PalFavorSuccess = ({ navigation, route }: any) => {
  const fontsLoaded = usePoppins();
  const payout = route?.params?.payout;
  const paid = typeof payout === 'number';
  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: PAGE_BG }} />;
  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: PAGE_BG }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
        <Ionicons name="checkmark-circle" size={120} color={SUCCESS} />
        <Text style={{ color: TEXT, fontSize: 24, fontFamily: P500, textAlign: 'center', marginTop: 24 }}>
          You just got paid!
        </Text>
        {paid && (
          // app addition — no v2 frame (surface the exact amount + ledger note)
          <Text style={{ color: SUBTLE, fontSize: 15, lineHeight: 22, fontFamily: P400, textAlign: 'center', marginTop: 10 }}>
            {`$${payout.toFixed(2)} was added to your Earning History.`}
          </Text>
        )}
      </View>
      <View style={{ paddingHorizontal: 24, paddingBottom: 12 }}>
        <TouchableOpacity
          style={st.whiteBtn}
          accessibilityRole="button"
          accessibilityLabel="Add feedback"
          onPress={() => navigation.navigate('PalFavorComplete')}
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
export const PalFavorComplete = ({ navigation }: any) => {
  const s = useStore();
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState('');
  // "Feedback Submitted" confirmation (v.2 181:11267) — a green-check success
  // state shown after rating, before returning home, instead of exiting silently.
  const [submitted, setSubmitted] = useState(false);
  const fontsLoaded = usePoppins();
  // The favor itself was completed at MARK AS DONE; here the pal rates the
  // MEMBER (the reverse review), persisted via rateMember().
  const onSubmit = () => {
    if (rating) s.rateMember(rating, feedback);
    setSubmitted(true);
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
          />
        </View>
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          style={[st.whiteBtn, { marginTop: 28, opacity: rating ? 1 : 0.5 }]}
          disabled={!rating}
          accessibilityRole="button"
          accessibilityLabel="Submit feedback"
          accessibilityState={{ disabled: !rating }}
          onPress={onSubmit}
        >
          <Text style={st.whiteBtnTxt}>SUBMIT FEEDBACK</Text>
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
    </SafeAreaView>
  );
};

const st = StyleSheet.create({
  iconBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: SHEET_ALT, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER },
  navBanner: { backgroundColor: SHEET, borderRadius: 8, paddingHorizontal: 18, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: SHEET, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 36, borderTopWidth: StyleSheet.hairlineWidth, borderColor: BORDER, shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 16 },
  miniCard: { position: 'absolute', left: 16, right: 16, backgroundColor: SHEET, borderRadius: 16, padding: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 16 },
  handle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.25)' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: DIVIDER },
  windowPill: { alignSelf: 'center', backgroundColor: SHEET_ALT, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 6, marginTop: 8 },
  waitBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: SHEET_ALT, borderRadius: 10, paddingVertical: 14, marginTop: 22, borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER },
  waitText: { color: TEXT, fontSize: 15, fontFamily: P500 },
  actionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: DIVIDER },
  whiteBtn: { backgroundColor: CTA_BG, borderRadius: 8, height: 48, alignItems: 'center', justifyContent: 'center', marginTop: 22 },
  whiteBtnTxt: { color: CTA_TEXT, fontSize: 15, letterSpacing: 0.5, fontFamily: P500 },
  darkBtn: { backgroundColor: DARK_BTN, borderRadius: 8, height: 48, alignItems: 'center', justifyContent: 'center', marginTop: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER },
  darkBtnTxt: { color: TEXT, fontSize: 15, letterSpacing: 0.5, fontFamily: P500 },
  modalScrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  modalCard: { width: '88%', backgroundColor: SHEET, borderRadius: 16, paddingHorizontal: 24, paddingVertical: 28, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER },
  modalTitle: { color: TEXT, fontSize: 22, lineHeight: 30, fontFamily: P500, textAlign: 'center' },
  modalBody: { color: SUBTLE, fontSize: 15, lineHeight: 22, fontFamily: P400, textAlign: 'center', marginTop: 12 },
  feedbackBox: { backgroundColor: FIELD, borderRadius: 12, padding: 16, marginTop: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER },
});
