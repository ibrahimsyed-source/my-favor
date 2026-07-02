import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, ScrollView, TouchableOpacity, StyleSheet, Image, FlatList, RefreshControl, TextInput, Text,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, tokens, fonts } from '../theme';
import { Txt, Avatar, StarRating, InfoModal, TopBar, Button } from '../components';
import { useStore } from '../store';
import { getFavorsApi, rateFavorApi } from '../api/endpoints';
import { FAVOR_TIERS, Favor } from '../types';

// ---------------------------------------------------------------------------
// User App v.2 — "Payment History" module (light theme).
// Frames: Payment History #125:8089 ("Transactions" grouped list),
// Payment History - no record #125:7884, Payment History - Detailed View of
// Favor completed #125:7216, Payment History - Detailed View incomplete
// #880:18160. White canvas, Poppins headings, status chips, hairline dividers.
// ---------------------------------------------------------------------------

// v.2 chip colors (from the Figma frames; green/amber/red match theme tokens).
const CHIP_INCOMPLETE = '#58595B'; // dark slate "Incomplete" chip
const PAY_BADGE_BORDER = '#D9D9D9';

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
// MARK FAVOR COMPLETE (frame #880:18160).
const isIncomplete = (f?: Favor) => !!f && f.status === 'completed' && f.rating == null;

// Status chip meta for the v.2 list rows: Completed (green), In Progress
// (amber), Cancelled (red), Incomplete (dark slate + red flag).
function chipMeta(favor: Favor, theme: any): { label: string; bg: string; flag?: boolean } {
  switch (favor.status) {
    case 'completed':
      return isIncomplete(favor)
        ? { label: 'Incomplete', bg: CHIP_INCOMPLETE, flag: true }
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
    default:
      return { label: 'Incomplete', bg: CHIP_INCOMPLETE, flag: true };
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
  onPress,
}: {
  favor: Favor;
  theme: any;
  onPress: (favorId: string) => void;
}) {
  const chip = chipMeta(favor, theme);
  const date = rowDate(when(favor));
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => onPress(favor.id)}
      style={[styles.listRow, { borderBottomColor: theme.divider }]}
      accessibilityRole="button"
      accessibilityLabel={`${date}, ${money(favor.total)}, ${chip.label}. View payment details`}
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
        <Text style={[styles.rowAmount, { color: theme.text }]}>{money(favor.total)}</Text>
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

  // Refresh whenever the screen regains focus so a favor completed/cancelled
  // from another screen appears without a full app reload.
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => { void refresh(); });
    return unsub;
  }, [navigation, refresh]);

  // Newest first, grouped under "March 2021"-style month headers.
  const rows = useMemo<ListItem[]>(() => {
    const sorted = [...items].sort((a, b) => when(b) - when(a));
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
  const renderItem = useCallback(
    ({ item }: { item: ListItem }) =>
      item.kind === 'month' ? (
        <View style={[styles.monthHead, { borderBottomColor: theme.divider }]}>
          <Text style={[styles.monthTxt, { color: theme.text }]}>{item.label}</Text>
        </View>
      ) : (
        <HistoryRow favor={item.favor} theme={theme} onPress={openDetail} />
      ),
    [theme, openDetail],
  );

  const empty = items.length === 0;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      {/* v.2: the populated list is titled "Transactions" (#125:8089); the
          no-record state is titled "Payment History" (#125:7884). */}
      <TopBar title={empty ? 'Payment History' : 'Transactions'} onBack={() => navigation.goBack()} />
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
          <Text style={[styles.emptyTxt, { color: theme.text }]}>
            No record of payment history.
          </Text>
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

  const favorId: string | undefined = route?.params?.favorId;
  const favor: Favor | undefined =
    s.history.find((f) => f.id === favorId) ??
    (s.activeFavor?.id === favorId ? s.activeFavor : undefined) ??
    s.history[0];
  const pal = s.palById(favor?.palId);
  const card = s.cards[0];
  const ts = when(favor) || Date.now();
  const tierLabel = FAVOR_TIERS[favor?.tier as keyof typeof FAVOR_TIERS]?.label ?? 'Custom Favor';
  const palName = pal ? `${pal.firstName} ${pal.lastName}` : 'Favor Pal';
  const feeTotal = (favor?.serviceFee ?? 0) + (favor?.transactionFee ?? 0);
  const incomplete = isIncomplete(favor);
  const tierArt = favor ? TIER_ART[favor.tier] : undefined;

  // ---- completed variant: support message (existing thread + send logic) ----
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);
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

  // ---- incomplete variant: rating + tip + feedback + mark complete ----
  const [rating, setRating] = useState(favor?.rating ?? 0);
  const [tipChoice, setTipChoice] = useState<number | 'other' | null>(null);
  const [otherTip, setOtherTip] = useState('');
  const [feedback, setFeedback] = useState('');
  const [needRating, setNeedRating] = useState(false);
  const [completed, setCompleted] = useState(false);

  const markComplete = () => {
    if (!favor) return;
    if (rating < 1) {
      setNeedRating(true);
      return;
    }
    const tipVal = tipChoice === 'other' ? Math.max(0, parseFloat(otherTip) || 0) : tipChoice ?? 0;
    if (s.activeFavor?.id === favor.id) {
      // The store action owns the active favor (clears it + syncs history).
      s.rateFavor(rating, feedback.trim(), tipVal || undefined);
    } else {
      void rateFavorApi(favor.id, {
        rating,
        feedback: feedback.trim(),
        ...(tipVal ? { tip: tipVal } : {}),
      }).catch(() => undefined);
    }
    setCompleted(true);
  };

  const Divider = () => <View style={[styles.divider, { backgroundColor: theme.divider }]} />;

  if (!favor) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
        <TopBar title="Payment History Detail" onBack={() => navigation.goBack()} />
        <Text style={[styles.emptyTxt, { color: theme.text }]}>No record of payment history.</Text>
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
            <Txt variant="caption" color={theme.textSecondary} style={{ marginTop: 2 }}>
              {longDay(ts)}
            </Txt>
            <Txt variant="caption" color={theme.textSecondary}>
              {timeOnly(ts)}
            </Txt>
          </View>
        </View>

        <Divider />

        {/* ---- Description ---- */}
        <View style={styles.sectionHead}>
          <Ionicons name="document-text" size={20} color={theme.text} />
          <Text style={[styles.heading, { color: theme.text, marginLeft: 12 }]}>Description</Text>
        </View>
        <Txt variant="bodySm" color={theme.textSecondary} style={{ marginTop: 8, paddingLeft: 32 }}>
          {favor.description}
        </Txt>

        <Divider />

        {/* ---- Address ---- */}
        <View style={styles.sectionHead}>
          <Ionicons name="location" size={20} color={theme.text} />
          <Text style={[styles.heading, { color: theme.text, marginLeft: 12 }]}>Address</Text>
        </View>
        <Txt variant="bodySm" color={theme.textSecondary} style={{ marginTop: 8, paddingLeft: 32 }}>
          {favor.location?.address}
        </Txt>

        <Divider />

        {/* ---- Favor Pal ---- */}
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
                <Txt variant="caption" color={theme.textSecondary} style={{ marginTop: 2 }}>
                  3 Miles away
                </Txt>
                <View style={[styles.inline, { marginTop: 10 }]}>
                  <Ionicons name="thumbs-up" size={14} color={theme.textSecondary} />
                  <Txt variant="caption" color={theme.textSecondary} style={{ marginLeft: 8 }}>
                    {pal.reliability}% Reliable
                  </Txt>
                </View>
                <View style={[styles.inline, { marginTop: 6 }]}>
                  <Ionicons name="star" size={14} color={theme.textSecondary} />
                  <Txt variant="caption" color={theme.textSecondary} style={{ marginLeft: 8 }}>
                    {pal.positiveReviews}% Positive Reviews
                  </Txt>
                </View>
              </>
            ) : (
              <Txt variant="caption" color={theme.textSecondary} style={{ marginTop: 2 }}>
                Pal details unavailable for this favor.
              </Txt>
            )}
          </View>
        </View>

        <Divider />

        {/* ---- Payment ---- */}
        <Text style={[styles.heading, { color: theme.text, marginBottom: tokens.spacing.base }]}>
          Payment
        </Text>
        <View style={styles.rowBetween}>
          <View style={styles.inline}>
            <Ionicons name="card" size={20} color={theme.text} />
            <Text style={[styles.titleMd, { color: theme.text, marginLeft: 12 }]}>
              {card ? `${cap(card.brand)} • ${card.last4}` : 'Card on file'}
            </Text>
          </View>
          <Text style={[styles.titleMd, { color: theme.text }]}>{money(favor.total)}</Text>
        </View>
        <Txt variant="bodySm" color={theme.textSecondary} style={{ marginTop: 6, paddingLeft: 32 }}>
          Favor {money(favor.price)} + fees {money(feeTotal)}
          {favor.tip ? ` + tip ${money(favor.tip)}` : ''}
        </Txt>
        <View style={[styles.inline, { marginTop: 14, paddingLeft: 32 }]}>
          <Txt variant="caption" color={theme.textSecondary} style={{ width: 110 }}>
            Date &amp; Time
          </Txt>
          <Txt variant="caption" color={theme.text}>{stampDate(ts)}</Txt>
        </View>
        <View style={[styles.inline, { marginTop: 8, paddingLeft: 32 }]}>
          <Txt variant="caption" color={theme.textSecondary} style={{ width: 110 }}>
            Transaction ID
          </Txt>
          <Txt variant="caption" color={theme.text}>{txnId(favor.id)}</Txt>
        </View>

        <Divider />

        {/* ---- Feedback ---- */}
        <Text style={[styles.heading, { color: theme.text }]}>Feedback</Text>
        <View style={[styles.inline, { marginTop: tokens.spacing.base }]}>
          <Text style={[styles.heading, { color: theme.text, marginRight: 24 }]}>Rating</Text>
          <StarRating
            value={incomplete ? rating : favor.rating ?? 0}
            size={20}
            onChange={incomplete ? setRating : undefined}
          />
        </View>

        {incomplete ? (
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
                style={{ paddingVertical: 8, marginLeft: 6 }}
                accessibilityRole="button"
                accessibilityState={{ selected: tipChoice === 'other' }}
                accessibilityLabel="Tip another amount"
              >
                <Text style={[styles.tipChipTxt, { color: theme.text }]}>Other</Text>
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
            <Txt variant="caption" color={theme.textSecondary} style={{ textAlign: 'right', marginTop: 8 }}>
              700 characters max.
            </Txt>
            <Button
              title="MARK FAVOR COMPLETE"
              variant="primary"
              onPress={markComplete}
              style={{ marginTop: tokens.spacing.base }}
            />
          </>
        ) : (
          <>
            {/* ---- Completed favor: comment + support message ---- */}
            <Text style={[styles.heading, { color: theme.text, marginTop: tokens.spacing.lg }]}>
              Comment
            </Text>
            <Txt variant="bodySm" color={theme.textSecondary} style={{ marginTop: 8 }}>
              {favor.feedback ?? 'No comment was left for this favor.'}
            </Txt>

            <Text style={[styles.heading, { color: theme.text, marginTop: tokens.spacing.xxl }]}>
              Need help or have a question with this favor?
            </Text>
            <Text style={[styles.heading, { color: theme.text }]}>Send us a message.</Text>
            <View style={[styles.msgBox, { backgroundColor: theme.inputBg, marginTop: tokens.spacing.base }]}>
              <TextInput
                style={[styles.msgInput, { color: theme.text }]}
                value={message}
                onChangeText={setMessage}
                multiline
                maxLength={700}
                placeholder={
                  'Provide as much detail as possible about your favor!  Let your provider know about what they will be doing, what they will need to bring, special requirements, etc.'
                }
                placeholderTextColor={theme.textTertiary}
              />
            </View>
            <Txt variant="caption" color={theme.textSecondary} style={{ textAlign: 'right', marginTop: 8 }}>
              700 characters max.
            </Txt>
            <Button
              title="SEND"
              variant="primary"
              onPress={sendMessage}
              style={{ marginTop: tokens.spacing.base }}
            />
          </>
        )}
      </ScrollView>

      <InfoModal
        visible={sent}
        title="Message Sent"
        message="Thanks for reaching out. We'll get back to you about this favor shortly."
        buttonLabel="OKAY"
        onClose={() => setSent(false)}
      />
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
    fontFamily: fonts.bodySemiBold,
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
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    color: '#FFFFFF',
  },
  emptyTxt: {
    fontFamily: fonts.displayMedium,
    fontSize: 15,
    textAlign: 'center',
    marginTop: 48,
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
    fontFamily: fonts.bodyRegular,
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
    fontFamily: fonts.bodySemiBold,
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
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    minWidth: 56,
    paddingVertical: 0,
    marginLeft: 2,
  },
});
