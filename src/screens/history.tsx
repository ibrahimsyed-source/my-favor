import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, ScrollView, TouchableOpacity, StyleSheet, Image, FlatList, RefreshControl, TextInput, Text, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFonts, Poppins_400Regular } from '@expo-google-fonts/poppins';
import { useTheme, tokens, fonts } from '../theme';
import { Avatar, StarRating, InfoModal, TopBar } from '../components';
import { EmptyState, ErrorState, LoadingState } from '../components/states';
import { useStore } from '../store';
import { getFavorsApi, rateFavorApi } from '../api/endpoints';
import { FAVOR_TIERS, Favor, computePayout } from '../types';

// ---------------------------------------------------------------------------
// User App v.2 — "Payment History" module (light theme).
// Frames: Payment History #125:8089 ("Transactions" grouped list),
// Payment History - no record #125:7884, Payment History - Detailed View of
// Favor completed #125:7216, Payment History - Detailed View incomplete
// #880:18160. White canvas, Poppins headings, status chips, hairline dividers.
// ---------------------------------------------------------------------------

const PAY_BADGE_BORDER = '#D9D9D9';

// v.2 body/label typography is Poppins 400/500 (canvas-verified).
const P400 = 'Poppins_400Regular'; // loaded locally (App.tsx registers 500/600/700)
const P500 = 'Poppins_500Medium'; // registered app-wide in App.tsx

// Poppins Regular isn't registered app-wide; expo-font caches globally so this
// resolves instantly after the first mount anywhere in the app.
function usePoppinsRegular() {
  const [loaded] = useFonts({ Poppins_400Regular });
  return loaded;
}

// ---------------------------------------------------------------------------
// Date helpers (deterministic formatting from ms epoch)
// ---------------------------------------------------------------------------
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function dParts(ms: number) {
  const d = new Date(ms);
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return {
    day: d.getDate(),
    monIdx: d.getMonth(),
    mon: MONTHS[d.getMonth()],
    year: d.getFullYear(),
    dayName: DAYS[d.getDay()],
    h,
    mm: m < 10 ? `0${m}` : `${m}`,
    ampm,
  };
}
// "24 Mar 2021" — list row date
const rowDate = (ms: number) => {
  const p = dParts(ms);
  return `${p.day} ${p.mon} ${p.year}`;
};
// "March 2021" — month group header
const monthLabel = (ms: number) => {
  const p = dParts(ms);
  return `${MONTHS_FULL[p.monIdx]} ${p.year}`;
};
// "Monday, Feb 16 2021"
const longDay = (ms: number) => {
  const p = dParts(ms);
  return `${p.dayName}, ${p.mon} ${p.day} ${p.year}`;
};
// "12:00 PM"
const timeOnly = (ms: number) => {
  const p = dParts(ms);
  return `${p.h}:${p.mm} ${p.ampm}`;
};
// "24 Mar 2021, 12:00 PM"
const stampDate = (ms: number) => {
  const p = dParts(ms);
  return `${p.day} ${p.mon} ${p.year}, ${p.h}:${p.mm} ${p.ampm}`;
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const money = (n?: number) => `$${(n ?? 0).toFixed(2)}`;
const when = (f?: Favor) => f?.scheduledFor ?? f?.createdAt ?? 0;

// Tier illustrations (same art the request flow uses) for the detail thumbnail.
const TIER_ART: Record<string, any> = {
  tiny: require('../../assets/img/request/tier-tiny.png'),
  small: require('../../assets/img/request/tier-small.png'),
  big: require('../../assets/img/request/tier-big.png'),
  huge: require('../../assets/img/request/tier-huge.png'),
};

// Stable, per-favor transaction id derived from the favor id (FNV-1a), so each
// receipt shows its own consistent id instead of one shared literal.
function txnId(id?: string): string {
  if (!id) return 'N/A';
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const a = h.toString(36);
  const b = (Math.imul(h ^ 0x5bd1e995, 0x01000193) >>> 0).toString(36);
  return (a + b).padEnd(13, '0').slice(0, 13);
}

// A favor is "incomplete" (v.2 sense) when the pal finished it but the member
// hasn't confirmed/rated yet — the detail screen then offers rating + tip +
// MARK FAVOR COMPLETE (frame #880:18160). Member-only: GET /api/favors also
// returns favors the user fulfilled as a PAL, which are read-only payout rows
// (never flagged Incomplete, never rateable) — callers gate on `palSide`.
const isIncomplete = (f?: Favor) => !!f && f.status === 'completed' && f.rating == null;

const isCancelled = (f?: Favor) => !!f && (f.status === 'cancelled' || f.status === 'no_pal');

// Row/receipt headline amount. Pal-side rows show the payout earned (price −
// commission + tip), not what the member paid. Cancelled favors were charged at
// most a cancellation fee we don't store per-favor, so no full-charge amount —
// an em dash. Tipped member receipts include the tip (favor.total never does).
function amountLabel(favor: Favor, palSide: boolean): string {
  if (isCancelled(favor)) return '—';
  if (palSide) return money(computePayout(favor.price, favor.tip ?? 0).payout);
  return money(favor.total + (favor.tip ?? 0));
}

// Status chip meta for the v.2 list rows: Completed (green), In Progress
// (amber), Cancelled (red), Incomplete (red + flag, member rows only).
function chipMeta(favor: Favor, theme: any, palSide: boolean): { label: string; bg: string; flag?: boolean } {
  switch (favor.status) {
    case 'completed':
      return !palSide && isIncomplete(favor)
        ? { label: 'Incomplete', bg: theme.primary, flag: true }
        : { label: 'Completed', bg: theme.success };
    case 'cancelled':
    case 'no_pal':
      return { label: 'Cancelled', bg: theme.primary };
    case 'requested':
    case 'matched':
    case 'enroute':
    case 'arrived':
    case 'in_progress':
      return { label: 'In Progress', bg: theme.warning };
    case 'pending_release':
      // Role-aware: the member owes an action (release the payment — red +
      // flag, like Incomplete); the pal just waits for it (read-only, amber).
      return palSide
        ? { label: 'Waiting for release', bg: theme.warning }
        : { label: 'Finish & release', bg: theme.primary, flag: true };
    default:
      return { label: 'Incomplete', bg: theme.primary, flag: true };
  }
}

// Small Apple Pay-style badge at the left of each transaction row.
const PayBadge = () => (
  <View style={styles.payBadge}>
    <Ionicons name="logo-apple" size={11} color="#141414" />
    <Text style={styles.payBadgeTxt}>Pay</Text>
  </View>
);

// ===========================================================================
// History — "Transactions": payment history grouped by month (v.2 #125:8089),
// with the "no record" empty state (#125:7884).
// ===========================================================================

type ListItem =
  | { key: string; kind: 'month'; label: string }
  | { key: string; kind: 'favor'; favor: Favor };

// Memoized row so scrolling/refresh never re-renders off-screen rows.
const HistoryRow = React.memo(function HistoryRow({
  favor,
  theme,
  palSide,
  onPress,
}: {
  favor: Favor;
  theme: any;
  palSide: boolean;
  onPress: (favorId: string) => void;
}) {
  const chip = chipMeta(favor, theme, palSide);
  const date = rowDate(when(favor));
  const amount = amountLabel(favor, palSide);
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => onPress(favor.id)}
      style={[styles.listRow, { borderBottomColor: theme.divider }]}
      accessibilityRole="button"
      accessibilityLabel={`${date}, ${amount}, ${chip.label}. View payment details`}
    >
      <PayBadge />
      <View style={{ flex: 1, marginLeft: tokens.spacing.md }}>
        <Text style={[styles.rowDate, { color: theme.text }]}>{date}</Text>
        <View style={[styles.inline, { marginTop: 8 }]}>
          <View style={[styles.chip, { backgroundColor: chip.bg }]}>
            <Text style={styles.chipTxt}>{chip.label}</Text>
          </View>
          {chip.flag && (
            <Ionicons name="flag" size={16} color={theme.primary} style={{ marginLeft: 10 }} />
          )}
        </View>
      </View>
      <View style={styles.inline}>
        <Text style={[styles.rowAmount, { color: theme.text }]}>{amount}</Text>
        <Ionicons name="chevron-forward" size={18} color={theme.text} style={{ marginLeft: 10 }} />
      </View>
    </TouchableOpacity>
  );
});

export const History = ({ navigation }: any) => {
  const { theme } = useTheme();
  const s = useStore();

  // The store owns `history` (seeded at login, updated by favor mutations) but
  // exposes no public refresher, so we mirror it locally and re-pull via the
  // existing /api/favors endpoint on pull-to-refresh and on focus. The mirror
  // re-syncs whenever the store's history changes, so the store stays the
  // source of truth.
  const [items, setItems] = useState<Favor[]>(s.history);
  const [refreshing, setRefreshing] = useState(false);
  // Track the first-load status so the empty area can show a spinner (initial
  // load) or an error+retry (network failure with nothing cached) instead of a
  // bare message. Start idle when the store already seeded history; once any
  // rows exist the list itself renders and this flag no longer surfaces.
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>(
    s.history.length ? 'idle' : 'loading',
  );
  // Client-side status filter over the fetched rows (no server change — history
  // is already the user's own ≤100 favors).
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'completed' | 'cancelled'>('all');
  useEffect(() => { setItems(s.history); }, [s.history]);

  const refresh = useCallback(async () => {
    try {
      const { favors } = await getFavorsApi();
      setItems(favors);
      setStatus('idle');
    } catch {
      // Keep showing the cached list on a transient network failure; only
      // surface the error state when there was nothing cached to fall back to.
      setStatus((prev) => (prev === 'loading' ? 'error' : prev));
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  // Retry from the error state: re-enter loading so the empty area shows the
  // spinner while the re-pull is in flight.
  const retry = useCallback(() => {
    setStatus('loading');
    void refresh();
  }, [refresh]);

  // Kick off an initial pull when we mounted without any cached history, so the
  // loading state resolves to real data / empty / error (the focus listener
  // below doesn't fire for the very first focus).
  useEffect(() => {
    if (s.history.length === 0) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh whenever the screen regains focus so a favor completed/cancelled
  // from another screen appears without a full app reload.
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => { void refresh(); });
    return unsub;
  }, [navigation, refresh]);

  // Newest first, grouped under "March 2021"-style month headers — after the
  // status filter.
  const rows = useMemo<ListItem[]>(() => {
    const ACTIVE = ['requested', 'matched', 'enroute', 'arrived', 'in_progress', 'pending_release'];
    const matchesFilter = (f: Favor) =>
      statusFilter === 'all' ? true
        : statusFilter === 'active' ? ACTIVE.includes(f.status)
          : statusFilter === 'completed' ? f.status === 'completed'
            : (f.status === 'cancelled' || f.status === 'no_pal');
    const sorted = [...items].filter(matchesFilter).sort((a, b) => when(b) - when(a));
    const out: ListItem[] = [];
    let lastMonth = '';
    for (const f of sorted) {
      const label = monthLabel(when(f));
      if (label !== lastMonth) {
        lastMonth = label;
        out.push({ key: `m_${label}`, kind: 'month', label });
      }
      out.push({ key: f.id, kind: 'favor', favor: f });
    }
    return out;
  }, [items]);

  const openDetail = useCallback(
    (favorId: string) => navigation.navigate('FavorHistoryDetail', { favorId }),
    [navigation],
  );
  const userId = s.user?.id;
  const renderItem = useCallback(
    ({ item }: { item: ListItem }) =>
      item.kind === 'month' ? (
        <View style={[styles.monthHead, { borderBottomColor: theme.divider }]}>
          <Text style={[styles.monthTxt, { color: theme.text }]}>{item.label}</Text>
        </View>
      ) : (
        <HistoryRow
          favor={item.favor}
          theme={theme}
          palSide={!!userId && item.favor.memberId !== userId}
          onPress={openDetail}
        />
      ),
    [theme, openDetail, userId],
  );

  const empty = items.length === 0;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      {/* v.2: the populated list is titled "Transactions" (#125:8089); the
          no-record state is titled "Payment History" (#125:7884). */}
      <TopBar title={empty ? 'Payment History' : 'Transactions'} onBack={() => navigation.goBack()} />
      {!empty ? (
        <View style={styles.filterRow}>
          {([
            { key: 'all', label: 'All' },
            { key: 'active', label: 'Active' },
            { key: 'completed', label: 'Completed' },
            { key: 'cancelled', label: 'Cancelled' },
          ] as const).map((t) => {
            const active = statusFilter === t.key;
            return (
              <TouchableOpacity
                key={t.key}
                onPress={() => setStatusFilter(t.key)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[
                  styles.filterTab,
                  { borderColor: theme.divider },
                  active && { backgroundColor: theme.primary, borderColor: theme.primary },
                ]}
              >
                <Text style={[styles.filterTabTxt, { color: active ? '#FFFFFF' : theme.textSecondary }]}>{t.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}
      <FlatList
        data={rows}
        keyExtractor={(it) => it.key}
        renderItem={renderItem}
        contentContainerStyle={{ paddingHorizontal: tokens.spacing.xl, flexGrow: 1 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.text} colors={[theme.primary]} />
        }
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={7}
        ListEmptyComponent={
          status === 'loading' ? (
            <LoadingState label="Loading your payment history..." />
          ) : status === 'error' ? (
            <ErrorState
              title="Couldn't load history"
              message="We couldn't load your payment history. Check your connection and try again."
              onRetry={retry}
            />
          ) : statusFilter !== 'all' ? (
            <EmptyState
              icon="filter-outline"
              title="No matching favors"
              message={`No ${statusFilter} favors to show. Tap “All” to see everything.`}
            />
          ) : (
            <EmptyState
              icon="receipt-outline"
              title="No Payment History"
              message="No record of payment history."
            />
          )
        }
      />
    </SafeAreaView>
  );
};

// ===========================================================================
// FavorHistoryDetail — "Payment History Detail" (v.2 #125:7216 completed /
// #880:18160 incomplete).
// ===========================================================================
export const FavorHistoryDetail = ({ navigation, route }: any) => {
  const { theme } = useTheme();
  const s = useStore();
  const fontsReady = usePoppinsRegular();

  const favorId: string | undefined = route?.params?.favorId;
  const storeFavor: Favor | undefined =
    s.history.find((f) => f.id === favorId) ??
    (s.activeMemberFavor && s.activeMemberFavor.id === favorId ? s.activeMemberFavor : undefined) ??
    (s.activePalFavor && s.activePalFavor.id === favorId ? s.activePalFavor : undefined);
  // The History list re-pulls /api/favors locally, so it can show rows the
  // store's history doesn't carry yet. When the store lookup misses, try one
  // fetch by id — NEVER fall back to history[0], which would render (and let
  // the user rate/tip) a completely different favor. undefined = fetching,
  // null = genuinely not found.
  const [fetched, setFetched] = useState<Favor | null | undefined>(undefined);
  useEffect(() => {
    if (storeFavor || !favorId) return;
    let alive = true;
    getFavorsApi()
      .then(({ favors }) => { if (alive) setFetched(favors.find((f) => f.id === favorId) ?? null); })
      .catch(() => { if (alive) setFetched(null); });
    return () => { alive = false; };
  }, [storeFavor, favorId]);
  const favor: Favor | undefined = storeFavor ?? fetched ?? undefined;

  // Pal-side rows (favors the user fulfilled) are read-only payout receipts:
  // the rate/tip/mark-complete UI is the MEMBER's (the server 403s otherwise).
  const palSide = !!favor && !!s.user && favor.memberId !== s.user.id;
  const pal = s.palById(favor?.palId);
  const card = s.cards[0];
  const ts = when(favor) || Date.now();
  const tierLabel = FAVOR_TIERS[favor?.tier as keyof typeof FAVOR_TIERS]?.label ?? 'Custom Favor';
  const palName = pal ? `${pal.firstName} ${pal.lastName}` : 'Favor Pal';
  const memberName = favor?.memberName ?? 'Favor Member';
  const feeTotal = (favor?.serviceFee ?? 0) + (favor?.transactionFee ?? 0);
  const payout = computePayout(favor?.price ?? 0, favor?.tip ?? 0);
  const cancelled = isCancelled(favor);
  const tierArt = favor ? TIER_ART[favor.tier] : undefined;

  // ---- support: open the real inbox (same mailto pattern as scenarios.tsx) ----
  const contactSupport = () => {
    const subject = encodeURIComponent(`Help with favor ${favor?.id ?? ''}`);
    const body = encodeURIComponent(`Favor ID: ${favor?.id ?? 'unknown'}`);
    void Linking.openURL(`mailto:support@myfavorr.com?subject=${subject}&body=${body}`).catch(() => {});
  };

  // ---- incomplete variant: rating + tip + feedback + mark complete ----
  const [rating, setRating] = useState(favor?.rating ?? 0);
  const [tipChoice, setTipChoice] = useState<number | 'other' | null>(null);
  const [otherTip, setOtherTip] = useState('');
  const [feedback, setFeedback] = useState('');
  const [needRating, setNeedRating] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Server-confirmed: the success modal only shows once the rating/tip actually
  // persisted — a failed request surfaces its error so nothing is silently lost.
  const markComplete = async () => {
    if (!favor || submitting) return;
    if (rating < 1) {
      setNeedRating(true);
      return;
    }
    // Clamp a custom "Other" tip to the server's inclusive $1000 max — otherwise
    // an over-cap tip 400s the whole rating request.
    const tipVal = tipChoice === 'other' ? Math.min(1000, Math.max(0, parseFloat(otherTip) || 0)) : tipChoice ?? 0;
    setSubmitting(true);
    setSubmitError(null);
    try {
      if (s.activeMemberFavor?.id === favor.id) {
        // The store action owns the active favor (clears it + syncs history).
        const ok = await s.rateFavor(rating, feedback.trim(), tipVal || undefined);
        if (!ok) {
          setSubmitError('Could not submit your rating. Check your connection and try again.');
          return;
        }
      } else {
        await rateFavorApi(favor.id, {
          rating,
          feedback: feedback.trim(),
          ...(tipVal ? { tip: tipVal } : {}),
        });
      }
      setCompleted(true);
    } catch (e: any) {
      setSubmitError(e?.message || 'Could not submit your rating. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ---- pending_release variant: the pal finished; the MEMBER releases the payment ----
  const [releasing, setReleasing] = useState(false);
  const [releaseError, setReleaseError] = useState<string | null>(null);
  // Set once OUR release was server-confirmed — flips this view to the
  // rate/complete variant immediately (the store's background history refresh
  // brings the completed record in right after).
  const [released, setReleased] = useState(false);
  const pendingRelease = !!favor && favor.status === 'pending_release';
  const memberPendingRelease = !palSide && pendingRelease && !released;
  // Member detail is "incomplete" (rate + tip + mark complete) once the favor is
  // completed-but-unrated — including right after a release confirmed here.
  const incomplete = !palSide && (isIncomplete(favor) || (pendingRelease && released));

  // Server-confirmed, honest result: the view only flips once the release
  // actually settled; a failed request surfaces the server's reason inline.
  const releasePayment = async () => {
    if (!favor || releasing) return;
    setReleasing(true);
    setReleaseError(null);
    const res = await s.releaseFavor(favor.id);
    setReleasing(false);
    if (res.ok) setReleased(true);
    else setReleaseError(res.reason ?? 'Could not release the payment. Please try again.');
  };

  const Divider = () => <View style={[styles.divider, { backgroundColor: theme.divider }]} />;

  if (!fontsReady) return <View style={{ flex: 1, backgroundColor: theme.background }} />; // flash-guard

  if (!favor) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
        <TopBar title="Payment History Detail" onBack={() => navigation.goBack()} />
        {favorId && fetched === undefined ? (
          <LoadingState label="Loading favor details..." />
        ) : (
          <EmptyState
            icon="receipt-outline"
            title="Favor Not Found"
            message="We couldn't find this favor. It may have been removed — go back and refresh your payment history."
          />
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <TopBar title="Payment History Detail" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: tokens.spacing.xl, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {/* ---- Header: favor type + schedule ---- */}
        <View style={[styles.inline, { alignItems: 'center' }]}>
          <View style={[styles.thumb, { backgroundColor: theme.surfaceAlt }]}>
            {tierArt ? (
              <Image source={tierArt} style={styles.thumbImg} resizeMode="contain" />
            ) : favor.images?.[0] ? (
              <Image source={{ uri: favor.images[0] }} style={styles.thumbImg} />
            ) : (
              <Ionicons name="cube" size={22} color={theme.textTertiary} />
            )}
          </View>
          <View style={{ marginLeft: tokens.spacing.base, flex: 1 }}>
            <Text style={[styles.titleLg, { color: theme.text }]}>{tierLabel}</Text>
            <Text style={[styles.caption, { color: theme.textSecondary, marginTop: 2 }]}>
              {longDay(ts)}
            </Text>
            <Text style={[styles.caption, { color: theme.textSecondary }]}>
              {timeOnly(ts)}
            </Text>
          </View>
        </View>

        <Divider />

        {/* ---- Description ---- */}
        <View style={styles.sectionHead}>
          <Ionicons name="document-text" size={20} color={theme.text} />
          <Text style={[styles.heading, { color: theme.text, marginLeft: 12 }]}>Description</Text>
        </View>
        <Text style={[styles.bodySm, { color: theme.textSecondary, marginTop: 8, paddingLeft: 32 }]}>
          {favor.description}
        </Text>

        <Divider />

        {/* ---- Address ---- */}
        <View style={styles.sectionHead}>
          <Ionicons name="location" size={20} color={theme.text} />
          <Text style={[styles.heading, { color: theme.text, marginLeft: 12 }]}>Address</Text>
        </View>
        <Text style={[styles.bodySm, { color: theme.textSecondary, marginTop: 8, paddingLeft: 32 }]}>
          {favor.location?.address}
        </Text>

        <Divider />

        {/* ---- Favor Pal (member rows) / Favor Member (pal rows) ---- */}
        {palSide ? (
          <>
            <Text style={[styles.heading, { color: theme.text, marginBottom: tokens.spacing.base }]}>
              Favor Member
            </Text>
            <View style={[styles.inline, { alignItems: 'flex-start' }]}>
              <Avatar size={56} name={memberName} />
              <View style={{ flex: 1, marginLeft: tokens.spacing.base }}>
                <View style={styles.rowBetween}>
                  <Text style={[styles.titleMd, { color: theme.text }]}>{memberName}</Text>
                  {favor.memberRating != null && (
                    <View style={styles.inline}>
                      <Ionicons name="star" size={16} color={theme.star} />
                      <Text style={[styles.titleMd, { color: theme.text, marginLeft: 8 }]}>
                        {favor.memberRating.toFixed(1)}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.caption, { color: theme.textSecondary, marginTop: 2 }]}>
                  You fulfilled this favor.
                </Text>
              </View>
            </View>
          </>
        ) : (
          <>
            <Text style={[styles.heading, { color: theme.text, marginBottom: tokens.spacing.base }]}>
              Favor Pal
            </Text>
            <View style={[styles.inline, { alignItems: 'flex-start' }]}>
              <Avatar uri={pal?.avatar} size={56} name={palName} />
              <View style={{ flex: 1, marginLeft: tokens.spacing.base }}>
                <View style={styles.rowBetween}>
                  <Text style={[styles.titleMd, { color: theme.text }]}>{palName}</Text>
                  {pal && (
                    <View style={styles.inline}>
                      <Ionicons name="star" size={16} color={theme.star} />
                      <Text style={[styles.titleMd, { color: theme.text, marginLeft: 8 }]}>
                        {pal.rating?.toFixed(1)}
                      </Text>
                    </View>
                  )}
                </View>
                {pal ? (
                  <>
                    <Text style={[styles.caption, { color: theme.textSecondary, marginTop: 2 }]}>
                      3 Miles away
                    </Text>
                    <View style={[styles.inline, { marginTop: 10 }]}>
                      <Ionicons name="thumbs-up" size={14} color={theme.textSecondary} />
                      <Text style={[styles.caption, { color: theme.textSecondary, marginLeft: 8 }]}>
                        {pal.reliability}% Reliable
                      </Text>
                    </View>
                    <View style={[styles.inline, { marginTop: 6 }]}>
                      <Ionicons name="star" size={14} color={theme.textSecondary} />
                      <Text style={[styles.caption, { color: theme.textSecondary, marginLeft: 8 }]}>
                        {pal.positiveReviews}% Positive Reviews
                      </Text>
                    </View>
                  </>
                ) : (
                  <Text style={[styles.caption, { color: theme.textSecondary, marginTop: 2 }]}>
                    Pal details unavailable for this favor.
                  </Text>
                )}
              </View>
            </View>
          </>
        )}

        <Divider />

        {/* ---- Payment ---- */}
        <Text style={[styles.heading, { color: theme.text, marginBottom: tokens.spacing.base }]}>
          Payment
        </Text>
        <View style={styles.rowBetween}>
          <View style={styles.inline}>
            <Ionicons name="card" size={20} color={theme.text} />
            <Text style={[styles.titleMd, { color: theme.text, marginLeft: 12 }]}>
              {palSide ? 'Favor payout' : card ? `${cap(card.brand)} • ${card.last4}` : 'Card on file'}
            </Text>
          </View>
          {/* v.2 #125:7216 shows the payment amount "+$20.00"-style. Cancelled
              favors show an em dash (no full charge happened); pal rows show the
              payout earned; tipped member receipts include the tip. */}
          <Text style={[styles.titleMd, { color: theme.text }]}>
            {cancelled ? '—' : `+${amountLabel(favor, palSide)}`}
          </Text>
        </View>
        {cancelled ? (
          <Text style={[styles.bodySm, { color: theme.textSecondary, marginTop: 6, paddingLeft: 32 }]}>
            This favor was cancelled — at most a cancellation fee applied.
          </Text>
        ) : palSide ? (
          <Text style={[styles.bodySm, { color: theme.textSecondary, marginTop: 6, paddingLeft: 32 }]}>
            Favor {money(favor.price)} − service commission {money(payout.commission)}
            {favor.tip ? ` + tip ${money(favor.tip)}` : ''}
          </Text>
        ) : (
          <Text style={[styles.bodySm, { color: theme.textSecondary, marginTop: 6, paddingLeft: 32 }]}>
            Favor {money(favor.price)} + fees {money(feeTotal)}
            {favor.tip ? ` + tip ${money(favor.tip)}` : ''}
          </Text>
        )}
        {/* Pal-side pending_release: the payout above hasn't settled yet —
             read-only status; the member (not the pal) releases it. */}
        {palSide && pendingRelease ? (
          <View style={[styles.inline, { marginTop: 8, paddingLeft: 32 }]}>
            <Ionicons name="time-outline" size={14} color={theme.warning} />
            <Text style={[styles.caption, { color: theme.textSecondary, marginLeft: 8 }]}>
              Waiting for release
            </Text>
          </View>
        ) : null}
        <View style={[styles.inline, { marginTop: 14, paddingLeft: 32 }]}>
          <Text style={[styles.caption, { color: theme.textSecondary, width: 110 }]}>
            Date &amp; Time
          </Text>
          <Text style={[styles.caption, { color: theme.text }]}>{stampDate(ts)}</Text>
        </View>
        <View style={[styles.inline, { marginTop: 8, paddingLeft: 32 }]}>
          <Text style={[styles.caption, { color: theme.textSecondary, width: 110 }]}>
            Transaction ID
          </Text>
          <Text style={[styles.caption, { color: theme.text }]}>{txnId(favor.id)}</Text>
        </View>

        <Divider />

        {/* ---- Feedback (hidden while the member still owes the release —
             rating opens up right after, on the then-completed favor) ---- */}
        {!memberPendingRelease && (
          <>
            <Text style={[styles.heading, { color: theme.text }]}>Feedback</Text>
            <View style={[styles.inline, { marginTop: tokens.spacing.base }]}>
              <Text style={[styles.heading, { color: theme.text, marginRight: 24 }]}>Rating</Text>
              <StarRating
                value={incomplete ? rating : favor.rating ?? 0}
                size={20}
                onChange={incomplete ? setRating : undefined}
              />
            </View>
          </>
        )}

        {memberPendingRelease ? (
          <>
            {/* ---- Finish & release (member role): the pal marked the work done;
                 releasing the payment completes the favor and settles it ---- */}
            <Text style={[styles.heading, { color: theme.text }]}>Finish &amp; release</Text>
            <Text style={[styles.bodySm, { color: theme.textSecondary, marginTop: 8 }]}>
              Your Favor Pal finished this favor. Release the payment to complete it — you can rate and tip right after.
            </Text>
            {releaseError ? (
              <View accessibilityLiveRegion="polite" style={[styles.inline, { marginTop: 8 }]}>
                <Ionicons name="alert-circle" size={18} color={theme.primary} style={{ marginRight: 6 }} />
                <Text style={[styles.caption, { color: theme.primary, flex: 1 }]}>{releaseError}</Text>
              </View>
            ) : null}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => { void releasePayment(); }}
              disabled={releasing}
              style={[styles.ctaBtn, { backgroundColor: theme.cta, opacity: releasing ? 0.5 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel="Release payment"
              accessibilityState={{ disabled: releasing, busy: releasing }}
            >
              <Text style={[styles.ctaBtnTxt, { color: theme.ctaText }]}>
                {releasing ? 'RELEASING…' : 'RELEASE PAYMENT'}
              </Text>
            </TouchableOpacity>
          </>
        ) : incomplete ? (
          <>
            {/* ---- Incomplete favor: tip + feedback + mark complete ---- */}
            <Text style={[styles.heading, { color: theme.text, marginTop: tokens.spacing.xl }]}>
              Great Pal? Consider giving a tip!
            </Text>
            <View style={[styles.inline, { marginTop: tokens.spacing.md, flexWrap: 'wrap' }]}>
              {[2, 4, 6].map((amt) => {
                const active = tipChoice === amt;
                return (
                  <TouchableOpacity
                    key={amt}
                    activeOpacity={0.8}
                    onPress={() => setTipChoice(active ? null : amt)}
                    style={[styles.tipChip, { backgroundColor: active ? theme.cta : theme.inputBg }]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`Tip $${amt}.00`}
                  >
                    <Text style={[styles.tipChipTxt, { color: active ? theme.ctaText : theme.text }]}>
                      ${amt}.00
                    </Text>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setTipChoice(tipChoice === 'other' ? null : 'other')}
                style={[styles.tipChip, { backgroundColor: tipChoice === 'other' ? theme.cta : theme.inputBg }]}
                accessibilityRole="button"
                accessibilityState={{ selected: tipChoice === 'other' }}
                accessibilityLabel="Tip another amount"
              >
                <Text style={[styles.tipChipTxt, { color: tipChoice === 'other' ? theme.ctaText : theme.text }]}>
                  Other
                </Text>
              </TouchableOpacity>
              {tipChoice === 'other' && (
                <View style={[styles.otherField, { backgroundColor: theme.inputBg }]}>
                  <Text style={[styles.tipChipTxt, { color: theme.text }]}>$</Text>
                  <TextInput
                    style={[styles.otherInput, { color: theme.text }]}
                    value={otherTip}
                    onChangeText={setOtherTip}
                    keyboardType="numeric"
                    placeholder="0.00"
                    placeholderTextColor={theme.textTertiary}
                    accessibilityLabel="Custom tip amount"
                  />
                </View>
              )}
            </View>

            <Text style={[styles.heading, { color: theme.text, marginTop: tokens.spacing.xl }]}>
              Feedback
            </Text>
            <View style={[styles.msgBox, { backgroundColor: theme.inputBg, marginTop: tokens.spacing.md }]}>
              <TextInput
                style={[styles.msgInput, { color: theme.text }]}
                value={feedback}
                onChangeText={setFeedback}
                multiline
                maxLength={700}
                placeholder="Please tell us about your experience"
                placeholderTextColor={theme.textTertiary}
              />
            </View>
            <Text style={[styles.caption, { color: theme.textSecondary, textAlign: 'right', marginTop: 8 }]}>
              700 characters max.
            </Text>
            {submitError ? (
              <View accessibilityLiveRegion="polite" style={[styles.inline, { marginTop: 8 }]}>
                <Ionicons name="alert-circle" size={18} color={theme.primary} style={{ marginRight: 6 }} />
                <Text style={[styles.caption, { color: theme.primary, flex: 1 }]}>{submitError}</Text>
              </View>
            ) : null}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => { void markComplete(); }}
              disabled={submitting}
              style={[styles.ctaBtn, { backgroundColor: theme.cta, opacity: submitting ? 0.5 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel="Mark favor complete"
              accessibilityState={{ disabled: submitting, busy: submitting }}
            >
              <Text style={[styles.ctaBtnTxt, { color: theme.ctaText }]}>
                {submitting ? 'SUBMITTING…' : 'MARK FAVOR COMPLETE'}
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            {/* ---- Completed favor: comment left with the rating ---- */}
            <Text style={[styles.heading, { color: theme.text, marginTop: tokens.spacing.lg }]}>
              Comment
            </Text>
            <Text style={[styles.bodySm, { color: theme.textSecondary, marginTop: 8 }]}>
              {favor.feedback ?? 'No comment was left for this favor.'}
            </Text>
          </>
        )}

        {/* ---- Support (both variants — #125:7216 and #880:18160): opens the
             real support inbox with this favor's id prefilled, same mailto
             pattern as scenarios.tsx — no fake in-app composer. ---- */}
        <Text style={[styles.heading, { color: theme.text, marginTop: tokens.spacing.xxl }]}>
          Need help or have a question with this favor?
        </Text>
        <Text style={[styles.bodySm, { color: theme.textSecondary, marginTop: 8 }]}>
          Email our support team — this favor's ID is attached automatically so we can look into it right away.
        </Text>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={contactSupport}
          style={[styles.ctaBtn, { backgroundColor: theme.cta }]}
          accessibilityRole="button"
          accessibilityLabel="Email support about this favor"
        >
          <Text style={[styles.ctaBtnTxt, { color: theme.ctaText }]}>EMAIL SUPPORT</Text>
        </TouchableOpacity>
      </ScrollView>

      <InfoModal
        visible={needRating}
        title="Add a Rating"
        message="Please select a star rating before marking this favor complete."
        buttonLabel="OKAY"
        onClose={() => setNeedRating(false)}
      />
      <InfoModal
        visible={completed}
        title="Favor Complete"
        message="Thanks! Your rating has been submitted and this favor is marked complete."
        buttonLabel="OKAY"
        onClose={() => {
          setCompleted(false);
          navigation.goBack();
        }}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  // ---- status filter tabs ----
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: tokens.spacing.xl, paddingTop: 4, paddingBottom: 10 },
  filterTab: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth },
  filterTabTxt: { fontSize: 13, fontFamily: 'Poppins_500Medium' },
  // ---- list ----
  monthHead: {
    paddingTop: tokens.spacing.xl,
    paddingBottom: tokens.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  monthTxt: {
    fontFamily: fonts.displayMedium,
    fontSize: 15,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: tokens.spacing.base,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowDate: {
    fontFamily: fonts.displayMedium,
    fontSize: 15,
    lineHeight: 22,
  },
  rowAmount: {
    fontFamily: fonts.displayMedium,
    fontSize: 15,
    lineHeight: 22,
  },
  payBadge: {
    width: 38,
    height: 24,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: PAY_BADGE_BORDER,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  payBadgeTxt: {
    fontFamily: P500,
    fontSize: 10,
    color: '#141414',
  },
  chip: {
    borderRadius: tokens.radius.pill,
    paddingHorizontal: 12,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipTxt: {
    fontFamily: P500,
    fontSize: 11,
    color: '#FFFFFF',
  },
  // ---- shared ----
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: tokens.spacing.lg,
  },
  // ---- detail ----
  thumb: {
    width: 56,
    height: 56,
    borderRadius: tokens.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbImg: {
    width: '100%',
    height: '100%',
    borderRadius: tokens.radius.sm,
  },
  titleLg: {
    fontFamily: fonts.displayMedium,
    fontSize: 17,
    lineHeight: 24,
  },
  titleMd: {
    fontFamily: fonts.displayMedium,
    fontSize: 16,
    lineHeight: 22,
  },
  heading: {
    fontFamily: fonts.displayMedium,
    fontSize: 15,
    lineHeight: 22,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  msgBox: {
    borderRadius: tokens.radius.sm,
    padding: 14,
    minHeight: 150,
  },
  msgInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: P400,
    textAlignVertical: 'top',
    minHeight: 120,
  },
  tipChip: {
    borderRadius: tokens.radius.pill,
    paddingHorizontal: 18,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  tipChipTxt: {
    fontFamily: P500,
    fontSize: 13,
  },
  otherField: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: tokens.radius.pill,
    paddingHorizontal: 14,
    height: 34,
    marginLeft: 12,
  },
  otherInput: {
    fontFamily: P500,
    fontSize: 13,
    minWidth: 56,
    paddingVertical: 0,
    marginLeft: 2,
  },
  // v.2 body/caption text (Poppins Regular, same sizes as the old Txt variants).
  caption: {
    fontFamily: P400,
    fontSize: 13,
    lineHeight: 18,
  },
  bodySm: {
    fontFamily: P400,
    fontSize: 15,
    lineHeight: 21,
  },
  // v.2 black CTA: 48px tall, radius 8, white Poppins Medium uppercase label
  // (same local pattern as payment.tsx / checkout.tsx).
  ctaBtn: {
    height: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: tokens.spacing.base,
  },
  ctaBtnTxt: {
    fontFamily: P500,
    fontSize: 15,
    letterSpacing: 0.5,
  },
});
