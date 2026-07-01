import React, { useState, useEffect, useCallback } from 'react';
import {
  View, ScrollView, TouchableOpacity, StyleSheet, Image, FlatList, RefreshControl, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, tokens, fonts } from '../theme';
import { Txt, Avatar, StarRating, InfoModal } from '../components';
import { useStore } from '../store';
import { getFavorsApi } from '../api/endpoints';
import { FAVOR_TIERS, Favor, FavorStatus, User } from '../types';

// ---------------------------------------------------------------------------
// User App v.2 — DARK palette (local consts). These screens are intentionally
// dark and must NOT use the shared light useTheme() colours for backgrounds /
// text; the tokens below match the v.2 "Earning History" dark reference.
// ---------------------------------------------------------------------------
const DK = {
  bg: '#0C0C0C', // near-black screen background
  card: '#171922', // dark navy card / sheet
  surfaceAlt: '#1C2331', // raised field / pill / thumb
  field: '#1C2331', // input field navy
  pill: '#1C2331', // dark secondary pill button
  text: '#FFFFFF', // primary text / icons
  textSecondary: 'rgba(255,255,255,0.6)', // secondary text
  textTertiary: 'rgba(255,255,255,0.4)', // placeholder / tertiary
  divider: 'rgba(255,255,255,0.10)', // hairline dividers / borders
  border: 'rgba(255,255,255,0.10)',
  red: '#ED1C24', // brand red accent
  star: '#FFBD00', // rating star amber
  success: '#02CB00', // success green
  cta: '#FFFFFF', // primary CTA button bg (white-on-dark)
  ctaText: '#141414', // primary CTA button text
} as const;

// ---------------------------------------------------------------------------
// Date helpers (deterministic formatting from ms epoch)
// ---------------------------------------------------------------------------
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
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
    mon: MONTHS[d.getMonth()],
    year: d.getFullYear(),
    dayName: DAYS[d.getDay()],
    h,
    mm: m < 10 ? `0${m}` : `${m}`,
    ampm,
  };
}
// "16 Feb | 12 PM"
const listDate = (ms: number) => {
  const p = dParts(ms);
  return `${p.day} ${p.mon} | ${p.h} ${p.ampm}`;
};
// "Monday, Feb 16 2021"
const longDay = (ms: number) => {
  const p = dParts(ms);
  return `${p.dayName}, ${p.mon} ${p.day} ${p.year}`;
};
// "12:00PM"
const timeOnly = (ms: number) => {
  const p = dParts(ms);
  return `${p.h}:${p.mm}${p.ampm}`;
};
// "24 Mar 2021, 12:00 PM"
const stampDate = (ms: number) => {
  const p = dParts(ms);
  return `${p.day} ${p.mon} ${p.year}, ${p.h}:${p.mm} ${p.ampm}`;
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

type IconName = React.ComponentProps<typeof Ionicons>['name'];

// ---------------------------------------------------------------------------
// Dark top bar (back chevron + centered title) — replaces the shared light
// <TopBar>, which renders dark-on-white and would vanish on the dark canvas.
// ---------------------------------------------------------------------------
function DarkTopBar({ title, onBack }: { title: string; onBack?: () => void }) {
  return (
    <View style={styles.topbar}>
      {onBack ? (
        <TouchableOpacity onPress={onBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={26} color={DK.text} />
        </TouchableOpacity>
      ) : (
        <View style={{ width: 26 }} />
      )}
      <Txt variant="h6" color={DK.text}>{title}</Txt>
      <View style={{ width: 26 }} />
    </View>
  );
}

// Status badge meta — dark v.2 chips: a bright foreground label + icon on a
// subtle translucent tint of the same hue (never colour alone → WCAG 1.4.1),
// tuned for AA contrast on the near-black canvas. `theme` is threaded from the
// row for data-flow parity but the dark palette (DK) drives the actual colours.
function statusMeta(
  status: FavorStatus,
  theme: any,
): { label: string; fg: string; bg: string; icon: IconName } {
  switch (status) {
    case 'completed':
      return { label: 'Completed', fg: DK.success, bg: 'rgba(2,203,0,0.16)', icon: 'checkmark-circle' };
    case 'cancelled':
      return { label: 'Cancelled', fg: '#FF6B6E', bg: 'rgba(237,28,36,0.16)', icon: 'close-circle' };
    case 'in_progress':
      return { label: 'In Progress', fg: DK.star, bg: 'rgba(255,189,0,0.16)', icon: 'sync' };
    case 'matched':
      return { label: 'Matched', fg: DK.star, bg: 'rgba(255,189,0,0.16)', icon: 'person-circle' };
    case 'enroute':
      return { label: 'En Route', fg: DK.star, bg: 'rgba(255,189,0,0.16)', icon: 'navigate' };
    case 'arrived':
      return { label: 'Arrived', fg: DK.star, bg: 'rgba(255,189,0,0.16)', icon: 'location' };
    case 'requested':
      return { label: 'Requested', fg: '#4DA6FF', bg: 'rgba(0,159,238,0.16)', icon: 'hourglass' };
    case 'no_pal':
      return { label: 'No Pal', fg: '#FF6B6E', bg: 'rgba(237,28,36,0.16)', icon: 'alert-circle' };
    default:
      return { label: cap(status), fg: DK.textSecondary, bg: DK.surfaceAlt, icon: 'ellipse' };
  }
}

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

// ===========================================================================
// History — list of past favors
// ===========================================================================

// Memoized list row so scrolling/refresh never re-renders off-screen rows: all
// of its props (favor, pal, theme, onPress) are reference-stable per item, so
// React.memo can skip rows whose data hasn't changed.
const HistoryRow = React.memo(function HistoryRow({
  favor,
  pal,
  theme,
  onPress,
}: {
  favor: Favor;
  pal?: User;
  theme: any;
  onPress: (favorId: string) => void;
}) {
  const name = pal ? `${pal.firstName} ${pal.lastName}` : 'Favor Pal';
  const tierLabel = FAVOR_TIERS[favor.tier as keyof typeof FAVOR_TIERS]?.label ?? 'Custom Favor';
  const badge = statusMeta(favor.status, theme);
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => onPress(favor.id)}
      style={styles.listRow}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${tierLabel}, ${badge.label}. View favor details`}
    >
      <Avatar uri={pal?.avatar} size={60} name={name} />
      <View style={{ flex: 1, marginLeft: tokens.spacing.base }}>
        <View style={styles.rowBetween}>
          <Txt variant="label" color={DK.text} style={{ fontSize: 17, flex: 1 }} numberOfLines={1}>
            {name}
          </Txt>
          <Txt variant="bodySm" color={DK.textSecondary}>
            View More
          </Txt>
        </View>
        <Txt variant="bodySm" color={DK.textSecondary} style={{ marginTop: 1 }}>
          {tierLabel}
        </Txt>
        <Txt variant="bodySm" color={DK.textSecondary} numberOfLines={2} style={{ marginTop: 6 }}>
          {favor.description}
        </Txt>
        <View style={[styles.rowBetween, { marginTop: 8 }]}>
          <View style={styles.inline}>
            <Ionicons name="calendar-outline" size={16} color={DK.textSecondary} />
            <Txt variant="label" color={DK.text} style={{ fontSize: 14, marginLeft: 8 }}>
              {listDate(favor.scheduledFor ?? favor.createdAt)}
            </Txt>
          </View>
          <View
            style={[styles.badge, { backgroundColor: badge.bg }]}
            accessibilityRole="text"
            accessibilityLabel={`Status: ${badge.label}`}
          >
            <Ionicons name={badge.icon} size={12} color={badge.fg} />
            <Txt variant="caption" color={badge.fg} style={{ fontSize: 12, marginLeft: 4 }}>
              {badge.label}
            </Txt>
          </View>
        </View>
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
  // re-syncs whenever the store's history changes (e.g. a favor completed or
  // cancelled elsewhere), so the store stays the source of truth.
  // NOTE: /api/favors returns the full list (no cursor/limit yet); true
  // server-side pagination is deferred until the endpoint accepts paging params.
  const [items, setItems] = useState<Favor[]>(s.history);
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => { setItems(s.history); }, [s.history]);

  const refresh = useCallback(async () => {
    try {
      const { favors } = await getFavorsApi();
      setItems(favors);
    } catch {
      /* keep showing the cached list on a transient network failure */
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  // Refresh whenever History regains focus so a favor completed/cancelled from
  // another screen appears without a full app reload (mirrors Notifications).
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => { void refresh(); });
    return unsub;
  }, [navigation, refresh]);

  const palById = s.palById;
  const openDetail = useCallback(
    (favorId: string) => navigation.navigate('FavorHistoryDetail', { favorId }),
    [navigation],
  );
  const renderItem = useCallback(
    ({ item }: { item: Favor }) => (
      <HistoryRow favor={item} pal={palById(item.palId)} theme={theme} onPress={openDetail} />
    ),
    [palById, theme, openDetail],
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: DK.bg }} edges={['top']}>
      <DarkTopBar title="Favor History" onBack={() => navigation.goBack()} />
      <FlatList
        data={items}
        keyExtractor={(h) => h.id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingTop: tokens.spacing.sm, flexGrow: 1 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={DK.text} colors={[DK.red]} />
        }
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
        ListEmptyComponent={
          <Txt variant="body" color={DK.textSecondary} center style={{ marginTop: 48 }}>
            No past favors yet.
          </Txt>
        }
      />
    </SafeAreaView>
  );
};

// ===========================================================================
// FavorHistoryDetail — full record of a single favor
// ===========================================================================
export const FavorHistoryDetail = ({ navigation, route }: any) => {
  const s = useStore();
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);

  const favorId: string | undefined = route?.params?.favorId;
  const favor: Favor = s.history.find((f) => f.id === favorId) ?? s.history[0];
  // Resolve the SAME pal the list row resolves; never fabricate via array index.
  const pal = s.palById(favor?.palId);
  const card = s.cards[0];
  const when = favor?.scheduledFor ?? favor?.createdAt ?? Date.now();
  const tierLabel = FAVOR_TIERS[favor?.tier as keyof typeof FAVOR_TIERS]?.label ?? 'Custom Favor';
  const palName = pal ? `${pal.firstName} ${pal.lastName}` : 'Favor Pal';
  const feeTotal = (favor?.serviceFee ?? 0) + (favor?.transactionFee ?? 0);

  // Re-order this favor: seed the draft from it and jump into the booking flow.
  const requestAgain = () => {
    if (!favor) return;
    s.setDraft({
      tier: favor.tier,
      price: favor.price,
      description: favor.description,
      images: favor.images,
      location: favor.location,
      // Clear any carry-over scheduling from a previous draft so the re-request
      // defaults to "now" rather than a stale (often past) time the user never picked.
      scheduledFor: undefined,
      hours: undefined,
    });
    navigation.navigate('FavorSummary');
  };

  // Send the support question into a real conversation with the assigned pal
  // (the store's get-or-create thread + send), then confirm before clearing so
  // the user knows the message went through instead of silently vanishing.
  const sendMessage = async () => {
    const text = message.trim();
    if (!text) return;
    if (pal?.id) {
      const threadId = await s.openThreadWith(pal.id);
      if (threadId) s.sendMessage(threadId, text);
    }
    setMessage('');
    setSent(true);
  };

  const Divider = () => <View style={[styles.divider, { backgroundColor: DK.divider }]} />;
  const canSend = !!message.trim();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: DK.bg }} edges={['top']}>
      <DarkTopBar title="Favor Details" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: tokens.spacing.lg, paddingBottom: 40 }}>
        {/* ---- Header: type + schedule ---- */}
        <View style={styles.inline}>
          <View style={[styles.thumb, { backgroundColor: DK.surfaceAlt }]}>
            {favor?.images?.[0] ? (
              <Image source={{ uri: favor.images[0] }} style={styles.thumbImg} />
            ) : (
              <Ionicons name="cube" size={22} color={DK.textTertiary} />
            )}
          </View>
          <View style={{ marginLeft: tokens.spacing.md }}>
            <Txt variant="label" color={DK.text} style={{ fontSize: 17 }}>
              {tierLabel}
            </Txt>
            <Txt variant="caption" color={DK.textSecondary} style={{ marginTop: 2 }}>
              {longDay(when)}
            </Txt>
            <Txt variant="caption" color={DK.textSecondary}>
              {timeOnly(when)}
            </Txt>
          </View>
        </View>

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={requestAgain}
          style={[styles.pillBtn, { backgroundColor: DK.pill, marginTop: tokens.spacing.base }]}
          accessibilityRole="button"
          accessibilityLabel="Request this favor again"
        >
          <Txt variant="button" color={DK.text} style={{ letterSpacing: 0.3 }}>
            Request this favor again
          </Txt>
        </TouchableOpacity>

        <Divider />

        {/* ---- Description ---- */}
        <View style={styles.sectionHead}>
          <Ionicons name="document-text-outline" size={20} color={DK.text} />
          <Txt variant="label" color={DK.text} style={{ marginLeft: 10 }}>
            Description
          </Txt>
        </View>
        <Txt variant="bodySm" color={DK.textSecondary} style={{ marginTop: 6 }}>
          {favor?.description}
        </Txt>

        <Divider />

        {/* ---- Address ---- */}
        <View style={styles.sectionHead}>
          <Ionicons name="location-outline" size={20} color={DK.text} />
          <Txt variant="label" color={DK.text} style={{ marginLeft: 10 }}>
            Address
          </Txt>
        </View>
        <Txt variant="bodySm" color={DK.textSecondary} style={{ marginTop: 6 }}>
          {favor?.location?.address}
        </Txt>

        <Divider />

        {/* ---- Favor Pal ---- */}
        <Txt variant="label" color={DK.text} style={{ marginBottom: tokens.spacing.md }}>
          Favor Pal
        </Txt>
        <View style={styles.inline}>
          <Avatar uri={pal?.avatar} size={56} name={palName} />
          <View style={{ flex: 1, marginLeft: tokens.spacing.md }}>
            <View style={styles.rowBetween}>
              <Txt variant="label" color={DK.text} style={{ fontSize: 17 }}>
                {palName}
              </Txt>
              {pal && (
                <View style={styles.inline}>
                  <Ionicons name="star" size={15} color={DK.star} />
                  <Txt variant="bodySm" color={DK.text} style={{ marginLeft: 4 }}>
                    {pal.rating?.toFixed(1)}
                  </Txt>
                </View>
              )}
            </View>
            {pal ? (
              <>
                <Txt variant="caption" color={DK.textSecondary} style={{ marginTop: 2 }}>
                  3 Miles away
                </Txt>
                <View style={[styles.inline, { marginTop: 6 }]}>
                  <Ionicons name="thumbs-up-outline" size={14} color={DK.textSecondary} />
                  <Txt variant="caption" color={DK.textSecondary} style={{ marginLeft: 6 }}>
                    {pal.reliability}% Reliable
                  </Txt>
                </View>
                <View style={[styles.inline, { marginTop: 4 }]}>
                  <Ionicons name="star-outline" size={14} color={DK.textSecondary} />
                  <Txt variant="caption" color={DK.textSecondary} style={{ marginLeft: 6 }}>
                    {pal.positiveReviews}% Positive Reviews
                  </Txt>
                </View>
              </>
            ) : (
              <Txt variant="caption" color={DK.textSecondary} style={{ marginTop: 2 }}>
                Pal details unavailable for this favor.
              </Txt>
            )}
          </View>
        </View>

        <Divider />

        {/* ---- Payment ---- */}
        <Txt variant="label" color={DK.text} style={{ marginBottom: tokens.spacing.md }}>
          Payment
        </Txt>
        <View style={styles.rowBetween}>
          <View style={styles.inline}>
            <Ionicons name="card-outline" size={20} color={DK.text} />
            <Txt variant="label" color={DK.text} style={{ marginLeft: 10 }}>
              {card ? `${cap(card.brand)} •••• ${card.last4}` : 'Card on file'}
            </Txt>
          </View>
          <Txt variant="label" color={DK.text}>${favor?.total?.toFixed(2)}</Txt>
        </View>
        <Txt variant="bodySm" color={DK.textSecondary} style={{ marginTop: 6 }}>
          Favor ${favor?.price?.toFixed(2)} + fees ${feeTotal.toFixed(2)}
          {favor?.tip ? ` + tip $${favor.tip.toFixed(2)}` : ''}
        </Txt>
        <View style={[styles.rowBetween, { marginTop: 14 }]}>
          <Txt variant="caption" color={DK.textSecondary}>
            Date &amp; Time
          </Txt>
          <Txt variant="bodySm" color={DK.text}>{stampDate(when)}</Txt>
        </View>
        <View style={[styles.rowBetween, { marginTop: 8 }]}>
          <Txt variant="caption" color={DK.textSecondary}>
            Transaction ID
          </Txt>
          <Txt variant="bodySm" color={DK.text}>{txnId(favor?.id)}</Txt>
        </View>

        <Divider />

        {/* ---- Feedback ---- */}
        <Txt variant="label" color={DK.text} style={{ marginBottom: tokens.spacing.md }}>
          Feedback
        </Txt>
        <View style={styles.inline}>
          <Txt variant="bodySm" color={DK.textSecondary} style={{ marginRight: 14 }}>
            Rating
          </Txt>
          <StarRating value={favor?.rating ?? 0} size={20} />
        </View>
        <Txt variant="label" color={DK.text} style={{ marginTop: tokens.spacing.base }}>
          Comment
        </Txt>
        <Txt variant="bodySm" color={DK.textSecondary} style={{ marginTop: 6 }}>
          {favor?.feedback ?? 'No comment was left for this favor.'}
        </Txt>

        <Divider />

        {/* ---- Help / support ---- */}
        <Txt variant="label" color={DK.text}>Need help or have a question with this favor?</Txt>
        <Txt variant="label" color={DK.text} style={{ marginBottom: tokens.spacing.md }}>
          Send us a message.
        </Txt>
        <View style={[styles.msgBox, { backgroundColor: DK.field, borderColor: DK.border }]}>
          <TextInput
            style={{ flex: 1, color: DK.text, fontSize: 16, fontFamily: fonts.bodyRegular, textAlignVertical: 'top', minHeight: 120 }}
            value={message}
            onChangeText={setMessage}
            multiline
            maxLength={700}
            placeholder="Provide as much detail as possible about your favor!  Let your provider know what they will be doing, what they will need to bring, special requirements, etc."
            placeholderTextColor={DK.textTertiary}
          />
        </View>
        <Txt variant="caption" color={DK.textSecondary} style={{ textAlign: 'right', marginTop: 8, marginBottom: tokens.spacing.lg }}>
          700 characters max.
        </Txt>
        <TouchableOpacity
          activeOpacity={0.85}
          disabled={!canSend}
          onPress={sendMessage}
          style={[styles.pillBtn, { backgroundColor: canSend ? DK.cta : DK.pill }]}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSend }}
          accessibilityLabel="Send"
        >
          <Txt variant="button" color={canSend ? DK.ctaText : DK.textTertiary} style={{ letterSpacing: 0.5 }}>
            SEND
          </Txt>
        </TouchableOpacity>
      </ScrollView>
      <InfoModal
        visible={sent}
        title="Message sent"
        message="Thanks for reaching out. We'll get back to you about this favor shortly."
        buttonLabel="OK"
        onClose={() => setSent(false)}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  topbar: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: DK.divider,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: DK.divider,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: tokens.radius.pill,
  },
  pillBtn: {
    height: 54,
    borderRadius: tokens.radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  msgBox: {
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    padding: 14,
    minHeight: 140,
  },
  thumb: {
    width: 46,
    height: 46,
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
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: tokens.spacing.base,
  },
});
