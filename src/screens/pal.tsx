import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, Image, StyleSheet, FlatList, RefreshControl,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Txt, InfoModal, Avatar } from '../components';
import { useStore } from '../store';
import { getIncomingApi } from '../api/endpoints';
import { computePayout, FAVOR_TIERS, Favor } from '../types';
import { lightTheme, fonts, tokens } from '../theme';

// Favor Pal (provider) active-favor flow. All screens sit on a light map with
// white bottom sheets, so they match the rest of the app's light theme.
const PAGE_BG = lightTheme.background;   // white screen background
const SHEET = lightTheme.card;           // white bottom-sheet surface
const SHEET_ALT = lightTheme.surfaceAlt; // raised field / pill / chip
const RED = lightTheme.primary;          // brand red accent
const STAR = lightTheme.star;            // rating amber
const SUBTLE = lightTheme.textSecondary; // secondary text
const DIVIDER = lightTheme.divider;      // hairline dividers
const TEXT = lightTheme.text;            // primary text
const MUTED = lightTheme.textTertiary;   // placeholder / tertiary text
const BORDER = lightTheme.border;        // card / field borders
const SUCCESS = lightTheme.success;      // success/checkmark green (#02CB00)

const CHARACTERS = require('../../assets/img/onboarding/launch-people.png');

// Tier illustration per favor tier (custom/negotiate fall back to the small icon).
const TIER_IMG: Record<string, ReturnType<typeof require>> = {
  tiny: require('../../assets/img/request/tier-tiny.png'),
  small: require('../../assets/img/request/tier-small.png'),
  big: require('../../assets/img/request/tier-big.png'),
  huge: require('../../assets/img/request/tier-huge.png'),
};
const tierImage = (tier?: string) => TIER_IMG[tier ?? ''] ?? TIER_IMG.small;

// ---- shared light-map backdrop ------------------------------------------------
function MapBackdrop() {
  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#E9EEF3' }]} />
      <View style={{ position: 'absolute', top: 90, left: 40, width: 3, height: 600, backgroundColor: '#D2DAE2', transform: [{ rotate: '8deg' }] }} />
      <View style={{ position: 'absolute', top: 120, left: -20, right: 0, height: 8, backgroundColor: '#DCE3EA', opacity: 0.8 }} />
      <View style={{ position: 'absolute', top: 240, left: 120, width: 3, height: 500, backgroundColor: '#D2DAE2' }} />
      <View style={{ position: 'absolute', top: 260, left: 0, right: 30, height: 3, backgroundColor: '#D2DAE2' }} />
    </View>
  );
}

function MapTopBar({ navigation, banner, onBack }: any) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ position: 'absolute', top: insets.top + 8, left: 0, right: 0, paddingHorizontal: 16 }}>
      {banner ? (
        <View style={st.navBanner}>
          <Ionicons name="arrow-up" size={20} color="#fff" />
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600', marginLeft: 10, fontFamily: fonts.bodySemiBold }}>{banner}</Text>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Neutral back so a pal can leave the detail without declining. */}
          {onBack ? (
            <TouchableOpacity style={st.iconBtn} onPress={onBack} accessibilityRole="button" accessibilityLabel="Go back">
              <Ionicons name="chevron-back" size={22} color={TEXT} />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 40 }} />
          )}
          <TouchableOpacity style={st.iconBtn} onPress={() => navigation.navigate('SideDrawer')} accessibilityRole="button" accessibilityLabel="Open menu">
            <Ionicons name="menu" size={22} color={TEXT} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function Handle() {
  return <View style={st.handle} />;
}

// ===========================================================================
// 0. BrowseFavors — a board of ALL open favor requests a pal can browse and
// pick from (backed by the live /favors/incoming feed in store.incomingFavors).
// Not in the original Figma; styled to match the app's light surfaces.
// ===========================================================================
const tierLabel = (f: Favor) =>
  (FAVOR_TIERS as Record<string, { label: string }>)[f.tier]?.label ?? 'Custom Favor';

// Pal origin for distance/sort. TODO: replace with the device's live location
// (expo-location) once a dev build is set up; a fixed city center keeps the
// distance math real and runnable in the meantime.
const PAL_ORIGIN = { lat: 30.2672, lng: -97.7431 };

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
          <Ionicons name="chevron-forward" size={15} color="#fff" />
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

export const BrowseFavors = ({ navigation }: any) => {
  const s = useStore();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [errored, setErrored] = useState(false);
  const [sort, setSort] = useState<SortKey>('new');
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

  // #2 — filter by tier + sort by recency/payout. (Server returns newest-first.)
  const shown = useMemo(() => {
    let list = tier === 'all' ? favors : favors.filter((f) => f.tier === tier);
    if (sort === 'high') list = [...list].sort((a, b) => b.price - a.price);
    else if (sort === 'low') list = [...list].sort((a, b) => a.price - b.price);
    else if (sort === 'close') list = [...list].sort((a, b) => favorDistance(a) - favorDistance(b));
    return list;
  }, [favors, tier, sort]);

  const subtitle = shown.length === favors.length
    ? `${favors.length} ${favors.length === 1 ? 'request' : 'requests'} near you`
    : `${shown.length} of ${favors.length} requests`;

  return (
    <View style={{ flex: 1, backgroundColor: PAGE_BG, paddingTop: insets.top }}>
      <View style={bw.header}>
        {navigation.canGoBack() ? (
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="chevron-back" size={26} color={TEXT} />
          </TouchableOpacity>
        ) : null}
        <View style={{ flex: 1, marginLeft: navigation.canGoBack() ? 8 : 0 }}>
          <Text style={bw.title}>Open Favors</Text>
          <Text style={bw.subtitle}>{subtitle}</Text>
        </View>
        <TouchableOpacity onPress={onRefresh} hitSlop={10} accessibilityRole="button" accessibilityLabel="Refresh">
          <Ionicons name="refresh" size={22} color={TEXT} />
        </TouchableOpacity>
      </View>

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
          <FavorCard favor={item} onPress={() => navigation.navigate('PalFavorDetail', { favorId: item.id })} />
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
                <Ionicons name="refresh" size={16} color="#fff" />
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
};

const bw = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  title: { color: TEXT, fontSize: 20, fontWeight: '700', fontFamily: fonts.display },
  subtitle: { color: SUBTLE, fontSize: 13, marginTop: 2, fontFamily: fonts.bodyRegular },
  chipRows: { paddingBottom: 4 },
  chipRow: { paddingHorizontal: 16, paddingVertical: 6, gap: 8, alignItems: 'center' },
  chipSep: { width: 1, height: 22, backgroundColor: DIVIDER, marginHorizontal: 4 },
  chip: { backgroundColor: SHEET_ALT, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  chipActive: { backgroundColor: RED },
  chipText: { color: SUBTLE, fontSize: 13, fontWeight: '600', fontFamily: fonts.bodySemiBold },
  chipTextActive: { color: '#fff' },
  card: { backgroundColor: SHEET, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER, ...tokens.shadow.card },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tierPill: { backgroundColor: 'rgba(237,28,36,0.12)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  tierPillText: { color: RED, fontSize: 12, fontWeight: '700', fontFamily: fonts.bodyBold },
  price: { color: TEXT, fontSize: 22, fontWeight: '800', fontFamily: fonts.display },
  desc: { color: TEXT, fontSize: 15, marginTop: 12, lineHeight: 21, fontFamily: fonts.bodyRegular },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 5 },
  meta: { color: SUBTLE, fontSize: 13, fontFamily: fonts.bodyRegular },
  dot: { color: SUBTLE, fontSize: 13, marginHorizontal: 2, fontFamily: fonts.bodyRegular },
  schedRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 5 },
  schedText: { color: RED, fontSize: 13, fontWeight: '600', fontFamily: fonts.bodySemiBold },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: DIVIDER, paddingTop: 14 },
  earn: { color: SUBTLE, fontSize: 14, fontFamily: fonts.bodyRegular },
  earnAmt: { color: TEXT, fontWeight: '700', fontFamily: fonts.bodyBold },
  viewBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: RED, borderRadius: 999, paddingLeft: 14, paddingRight: 10, paddingVertical: 8 },
  viewText: { color: '#fff', fontWeight: '700', fontSize: 14, fontFamily: fonts.bodyBold },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, paddingHorizontal: 32 },
  emptyTitle: { color: TEXT, fontSize: 17, fontWeight: '700', marginTop: 16, fontFamily: fonts.display },
  emptySub: { color: SUBTLE, fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20, fontFamily: fonts.bodyRegular },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: RED, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10, marginTop: 18 },
  retryText: { color: '#fff', fontWeight: '700', fontSize: 14, fontFamily: fonts.bodyBold },
});

// ===========================================================================
// 1. PalFavorDetail — incoming favor quick view (figma 97:5700)
// ===========================================================================
export const PalFavorDetail = ({ navigation, route }: any) => {
  const s = useStore();
  const [expanded, setExpanded] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState('');

  const onAccept = async (favorId: string) => {
    if (accepting) return;
    setAccepting(true);
    const res = await s.acceptFavor(favorId);
    setAccepting(false);
    if (res.ok) navigation.navigate('Navigation');
    else setAcceptError(res.reason || 'This favor is no longer available.');
  };
  // Bind strictly to the requested favor. Only fall back to the first open favor
  // when no id was passed (e.g. a bare deep-link) — never substitute a different
  // favor, or ACCEPT/DECLINE would silently act on the wrong one after a refresh.
  const favorId = route?.params?.favorId;
  const favor = favorId ? s.incomingFavors.find((f) => f.id === favorId) : s.incomingFavors[0];
  const gone = !!favorId && !favor;
  const base = favor?.price ?? 20;
  // Real favor framing. The requester stays anonymous until the pal accepts
  // (privacy), so we show the request itself, not a fake person.
  const title = favor ? `${tierLabel(favor)} · $${base}` : 'Favor request';
  // Pal-side economics: what THEY take home (never the member invoice total).
  const { payout } = computePayout(base);
  const area = favor?.location?.address ?? 'Nearby';
  const when = favor?.scheduledFor
    ? new Date(favor.scheduledFor).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : favor?.createdAt
      ? `Requested ${relTime(favor.createdAt)}`
      : 'As soon as possible';

  if (gone) {
    return (
      <View style={{ flex: 1, backgroundColor: PAGE_BG }}>
        <MapBackdrop />
        <MapTopBar navigation={navigation} onBack={() => navigation.goBack()} />
        <View style={st.sheet}>
          <Handle />
          <View style={{ alignItems: 'center', paddingVertical: 24 }}>
            <Ionicons name="time-outline" size={48} color={SUBTLE} />
            <Txt variant="h4" color={TEXT} center style={{ marginTop: 14 }}>This favor was just taken</Txt>
            <Txt variant="body" color={SUBTLE} center style={{ marginTop: 8 }}>
              Another Favor Pal accepted it, or the member cancelled. Browse other open favors.
            </Txt>
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
        <Txt variant="h3" color={TEXT} center style={{ marginVertical: 14 }}>{title}</Txt>
        <View style={st.divider} />
        <View style={{ flexDirection: 'row', marginTop: 16 }}>
          <View style={[st.avatar, { backgroundColor: SHEET_ALT, alignItems: 'center', justifyContent: 'center' }]}>
            <Ionicons name="cube" size={26} color={TEXT} />
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={{ color: TEXT, fontWeight: '700', fontSize: 18, fontFamily: fonts.bodyBold }}>New favor request</Text>
            <Text style={{ color: SUBTLE, fontSize: 14, marginTop: 4, fontFamily: fonts.bodyRegular }} numberOfLines={expanded ? undefined : 2}>
              {favor?.description || 'No details provided yet.'}
            </Text>
            <Text style={{ color: SUBTLE, fontSize: 13, marginTop: 6, fontFamily: fonts.bodyRegular }}>{when}</Text>
            <Text style={{ fontSize: 14, marginTop: 6, fontFamily: fonts.bodyRegular }}>
              <Text style={{ color: TEXT, fontWeight: '700', fontFamily: fonts.bodyBold }}>{`You earn $${payout.toFixed(2)}`}</Text>
              <Text style={{ color: SUBTLE, fontFamily: fonts.bodyRegular }}>{`   ·   ${area}`}</Text>
            </Text>
            <TouchableOpacity
              onPress={() => setExpanded((v) => !v)}
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              accessibilityLabel={expanded ? 'View less favor detail' : 'View more favor detail'}
            >
              <Text style={{ color: RED, fontWeight: '700', fontSize: 14, marginTop: 8, fontFamily: fonts.bodyBold }}>
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
        <InfoModal
          visible={!!acceptError}
          title="Can't accept this favor"
          message={acceptError}
          buttonLabel="OK"
          onClose={() => setAcceptError('')}
        />
        <TouchableOpacity
          onPress={() => { if (favor) s.declineFavor(favor.id); navigation.goBack(); }}
          style={{ alignSelf: 'center', marginTop: 14 }}
          accessibilityRole="button"
          accessibilityLabel="Decline this favor"
        >
          <Text style={{ color: SUBTLE, fontWeight: '600', fontFamily: fonts.bodySemiBold }}>decline this favor</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

function QuickRow({ label, value }: any) {
  return (
    <View style={{ marginTop: 12 }}>
      <Text style={{ color: SUBTLE, fontSize: 12, letterSpacing: 0.5, textTransform: 'uppercase', fontFamily: fonts.bodySemiBold }}>{label}</Text>
      <Text style={{ color: TEXT, fontSize: 14, marginTop: 2, fontFamily: fonts.bodyRegular }}>{value}</Text>
    </View>
  );
}

// ===========================================================================
// 2. Navigation — accepted favor w/ directions banner (figma 181:10690)
// ===========================================================================
export const Navigation = ({ navigation }: any) => {
  const s = useStore();
  const fav = s.activeFavor;
  const [callOpen, setCallOpen] = useState(false);
  const memberName = fav?.memberName ?? 'Favor Member';
  const tierName = fav ? tierLabel(fav) : 'Favor';
  const distance = fav ? fmtMiles(favorDistance(fav)) : '';
  const window = fav?.etaWindow
    ?? (fav?.scheduledFor ? new Date(fav.scheduledFor).toLocaleString([], { hour: 'numeric', minute: '2-digit' }) : 'As soon as possible');

  const openMessage = async () => {
    if (!fav?.memberId) return;
    const id = await s.openThreadWith(fav.memberId);
    if (id) navigation.navigate('MessageThread', { threadId: id });
  };

  return (
    <View style={{ flex: 1, backgroundColor: PAGE_BG }}>
      <MapBackdrop />
      <MapTopBar navigation={navigation} banner="Head to the favor location." />
      <View style={st.sheet}>
        <Handle />
        <Txt variant="h6" color={TEXT} center style={{ marginVertical: 12 }}>Favor Booked</Txt>
        <View style={st.divider} />
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16 }}>
          <Avatar uri={undefined} size={56} name={memberName} />
          <View style={{ marginLeft: 14 }}>
            <Text style={{ color: TEXT, fontWeight: '700', fontSize: 18, fontFamily: fonts.bodyBold }}>{memberName}</Text>
            <Text style={{ color: SUBTLE, fontSize: 14, marginTop: 2, fontFamily: fonts.bodyRegular }}>{tierName}</Text>
            {distance ? <Text style={{ color: SUBTLE, fontSize: 13, marginTop: 2, fontFamily: fonts.bodyRegular }}>{distance}</Text> : null}
          </View>
        </View>
        <Text style={{ color: TEXT, fontSize: 26, fontWeight: '800', textAlign: 'center', marginTop: 18, fontFamily: fonts.display }}>{window}</Text>
        <View style={st.windowPill}><Text style={{ color: SUBTLE, fontSize: 13, fontFamily: fonts.bodyRegular }}>Arrival Window</Text></View>

        <ActionRow icon="call" label="Call About This Favor" onPress={() => setCallOpen(true)} />
        <ActionRow icon="mail" label="Message Favor Member" red onPress={openMessage} />

        <TouchableOpacity
          style={st.whiteBtn}
          accessibilityRole="button"
          accessibilityLabel="I have arrived"
          onPress={() => { s.advanceFavor('arrived'); navigation.navigate('PalFavorInProgress'); }}
        >
          <Text style={st.whiteBtnTxt}>I AM HERE</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={st.blackBtn}
          accessibilityRole="button"
          accessibilityLabel="Cancel this favor"
          onPress={() => { void s.abandonFavor(); navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] }); }}
        >
          <Text style={{ color: TEXT, fontWeight: '700', letterSpacing: 0.5, fontFamily: fonts.bodySemiBold }}>CANCEL THIS FAVOR</Text>
        </TouchableOpacity>
      </View>
      {/* Privacy: the call is relayed — the pal never sees the member's real number. */}
      <InfoModal
        visible={callOpen}
        title="Calling privately"
        message="We connect you and the Favor Member through a private relay, so neither of you ever sees the other's real phone number."
        buttonLabel="OK"
        onClose={() => setCallOpen(false)}
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
      <Text style={{ color: TEXT, fontSize: 15, marginLeft: 14, flex: 1, fontFamily: fonts.bodyRegular }}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={SUBTLE} />
    </TouchableOpacity>
  );
}

// ===========================================================================
// 3. PalFavorInProgress — doing the favor (figma 523:17839)
// ===========================================================================
export const PalFavorInProgress = ({ navigation }: any) => {
  const s = useStore();
  const fav = s.activeFavor;
  const base = fav?.price ?? 20;
  // Pal-side breakdown — what the pal takes home, NOT the member's invoice.
  const { payout, commission } = computePayout(base);
  const description = fav?.description || 'No description provided.';
  // Exact address is appropriate here: the pal has already accepted the favor.
  const address = fav?.location?.address || 'Address shared by the member';
  const memberName = fav?.memberName ?? 'Favor Member';
  const tierName = fav ? tierLabel(fav) : 'Favor';
  const when = fav?.scheduledFor
    ? new Date(fav.scheduledFor).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : fav?.createdAt
      ? new Date(fav.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
      : '';
  return (
    <View style={{ flex: 1, backgroundColor: PAGE_BG }}>
      <MapBackdrop />
      <MapTopBar navigation={navigation} />
      <ScrollView style={st.scrollSheet} contentContainerStyle={{ paddingBottom: 24 }}>
        <Handle />
        <Txt variant="h6" color={TEXT} center style={{ marginVertical: 12 }}>You are currently doing a favor.</Txt>
        <View style={st.divider} />
        <View style={{ flexDirection: 'row', marginTop: 16 }}>
          <Avatar uri={undefined} size={56} name={memberName} />
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={{ color: TEXT, fontWeight: '700', fontSize: 18, fontFamily: fonts.bodyBold }}>{memberName}</Text>
            <Text style={{ color: SUBTLE, fontSize: 14, marginTop: 4, fontFamily: fonts.bodyRegular }}>{description}</Text>
            {when ? <Text style={{ color: SUBTLE, fontSize: 13, marginTop: 4, fontFamily: fonts.bodyRegular }}>{when}</Text> : null}
          </View>
        </View>
        <View style={[st.divider, { marginTop: 18 }]} />
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16 }}>
          <Image source={tierImage(fav?.tier)} style={{ width: 44, height: 44, marginRight: 12 }} resizeMode="contain" />
          <View style={{ flex: 1 }}>
            <CostRow label={tierName} value={`$${base.toFixed(2)}`} bold />
            <CostRow label="Platform commission (20%)" value={`-$${commission.toFixed(2)}`} />
            <CostRow label="You earn" value={`$${payout.toFixed(2)}`} bold />
          </View>
        </View>
        <Section icon="document-text" title="Description" body={description} />
        <Section icon="location" title="Address" body={address} />
        <TouchableOpacity
          style={[st.whiteBtn, { opacity: fav ? 1 : 0.5 }]}
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
          <Text style={st.whiteBtnTxt}>MARK FAVOR DONE</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

function CostRow({ label, value, bold }: any) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginVertical: 2 }}>
      <Text style={{ color: bold ? TEXT : SUBTLE, fontSize: 14, fontWeight: bold ? '700' : '400', fontFamily: bold ? fonts.bodyBold : fonts.bodyRegular }}>{label}</Text>
      <Text style={{ color: bold ? TEXT : SUBTLE, fontSize: 14, fontWeight: bold ? '700' : '400', fontFamily: bold ? fonts.bodyBold : fonts.bodyRegular }}>{value}</Text>
    </View>
  );
}

function Section({ icon, title, body }: any) {
  return (
    <View style={{ marginTop: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Ionicons name={icon} size={18} color={TEXT} />
        <Text style={{ color: TEXT, fontWeight: '700', fontSize: 16, marginLeft: 8, fontFamily: fonts.bodyBold }}>{title}</Text>
      </View>
      <Text style={{ color: SUBTLE, fontSize: 14, marginTop: 6, marginLeft: 26, fontFamily: fonts.bodyRegular }}>{body}</Text>
    </View>
  );
}

// ===========================================================================
// 4. PalFavorSuccess — "You just got paid!" confirmation (figma pal-success)
// ===========================================================================
export const PalFavorSuccess = ({ navigation, route }: any) => {
  const payout = route?.params?.payout;
  const paid = typeof payout === 'number';
  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: PAGE_BG }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
        <Ionicons name="checkmark-circle-outline" size={120} color={SUCCESS} />
        <Txt variant="h2" color={TEXT} center style={{ marginTop: 24 }}>
          {paid ? `You just got paid $${payout.toFixed(2)}!` : 'You just got paid!'}
        </Txt>
        {paid && (
          <Txt variant="body" color={SUBTLE} center style={{ marginTop: 10 }}>
            {`$${payout.toFixed(2)} was added to your Earning History.`}
          </Txt>
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
          style={st.blackBtn}
          accessibilityRole="button"
          accessibilityLabel="Done"
          onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] })}
        >
          <Text style={{ color: TEXT, fontWeight: '700', letterSpacing: 0.5, fontFamily: fonts.bodySemiBold }}>DONE</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

// ===========================================================================
// 5. PalFavorComplete — Thank You / feedback (figma 97:6337 / 97:6307)
// ===========================================================================
export const PalFavorComplete = ({ navigation }: any) => {
  const s = useStore();
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState('');
  // The favor itself was completed at MARK FAVOR DONE; here the pal rates the
  // MEMBER (the reverse review), persisted via rateMember().
  const onSubmit = () => {
    if (rating) s.rateMember(rating, feedback);
    navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] });
  };
  // Rating the member is optional — let the pal leave without being forced to rate.
  const skip = () => navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] });
  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: PAGE_BG }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24, flexGrow: 1 }}>
        <Txt variant="h2" color={TEXT} center style={{ marginTop: 24 }}>Thank You!</Txt>
        <Image source={CHARACTERS} style={{ width: '100%', height: 320, marginTop: 12 }} resizeMode="contain" />
        <View style={[st.divider, { marginTop: 8 }]} />
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 20 }}>
          <Txt variant="h4" color={TEXT} style={{ marginRight: 24 }}>Rating</Txt>
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
        <Txt variant="body" color={TEXT} style={{ marginTop: 20 }}>Tell us about your experience</Txt>
        <View style={st.feedbackBox}>
          <TextInput
            style={[tokens.typography.body, { color: TEXT, minHeight: 120, textAlignVertical: 'top' }]}
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
          <Text style={{ color: SUBTLE, fontWeight: '600', fontFamily: fonts.bodySemiBold }}>Maybe later</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const st = StyleSheet.create({
  iconBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER, ...tokens.shadow.card },
  navBanner: { backgroundColor: lightTheme.cta, borderRadius: 14, paddingHorizontal: 18, paddingVertical: 14, flexDirection: 'row', alignItems: 'center' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: SHEET, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 36, borderTopWidth: StyleSheet.hairlineWidth, borderColor: BORDER, shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 16 },
  scrollSheet: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '78%', backgroundColor: SHEET, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderColor: BORDER, shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 16 },
  handle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: DIVIDER },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: DIVIDER },
  avatar: { width: 56, height: 56, borderRadius: 28 },
  redBadge: { position: 'absolute', top: -4, right: -4, width: 22, height: 22, borderRadius: 11, backgroundColor: RED, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: SHEET },
  windowPill: { alignSelf: 'center', backgroundColor: SHEET_ALT, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 6, marginTop: 8 },
  actionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: DIVIDER },
  whiteBtn: { backgroundColor: lightTheme.cta, borderRadius: 14, height: 54, alignItems: 'center', justifyContent: 'center', marginTop: 22 },
  whiteBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 16, letterSpacing: 0.5, fontFamily: fonts.bodySemiBold },
  blackBtn: { backgroundColor: lightTheme.secondaryBtn, borderRadius: 14, height: 54, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  feedbackBox: { backgroundColor: SHEET_ALT, borderRadius: 16, padding: 16, marginTop: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER },
});
