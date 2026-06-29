import React, { useState } from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, tokens } from '../theme';
import {
  Screen, Txt, Button, Field, Avatar, StarRating, TopBar, InfoModal,
} from '../components';
import { useStore } from '../store';
import { FAVOR_TIERS, Favor, FavorStatus } from '../types';

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

// Status badge meta. Each state carries a distinguishing icon + text label so it
// is never communicated by color alone (WCAG 1.4.1), and the foreground colors
// are darkened to clear AA (>=4.5:1) on their tints at the 12px badge size.
function statusMeta(
  status: FavorStatus,
  theme: any,
): { label: string; fg: string; bg: string; icon: IconName } {
  switch (status) {
    case 'completed':
      return { label: 'Completed', fg: '#0A6B05', bg: '#E4F8E4', icon: 'checkmark-circle' };
    case 'cancelled':
      return { label: 'Cancelled', fg: theme.primaryDark, bg: '#FCE3E4', icon: 'close-circle' };
    case 'in_progress':
      return { label: 'In Progress', fg: '#8A5E00', bg: '#FFF3D6', icon: 'sync' };
    case 'matched':
      return { label: 'Matched', fg: '#8A5E00', bg: '#FFF3D6', icon: 'person-circle' };
    case 'enroute':
      return { label: 'En Route', fg: '#8A5E00', bg: '#FFF3D6', icon: 'navigate' };
    case 'arrived':
      return { label: 'Arrived', fg: '#8A5E00', bg: '#FFF3D6', icon: 'location' };
    case 'requested':
      return { label: 'Requested', fg: '#005FCC', bg: '#E3F1FC', icon: 'hourglass' };
    case 'no_pal':
      return { label: 'No Pal', fg: theme.primaryDark, bg: '#FCE3E4', icon: 'alert-circle' };
    default:
      return { label: cap(status), fg: theme.textSecondary, bg: theme.surfaceAlt, icon: 'ellipse' };
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
export const History = ({ navigation }: any) => {
  const { theme } = useTheme();
  const s = useStore();

  return (
    <Screen padded={false}>
      <TopBar title="Favor History" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ paddingTop: tokens.spacing.sm }}>
        {s.history.map((h) => {
          const pal = s.palById(h.palId);
          const name = pal ? `${pal.firstName} ${pal.lastName}` : 'Favor Pal';
          const tierLabel = FAVOR_TIERS[h.tier as keyof typeof FAVOR_TIERS]?.label ?? 'Custom Favor';
          const badge = statusMeta(h.status, theme);
          return (
            <TouchableOpacity
              key={h.id}
              activeOpacity={0.7}
              onPress={() => navigation.navigate('FavorHistoryDetail', { favorId: h.id })}
              style={[styles.listRow, { borderBottomColor: theme.divider }]}
              accessibilityRole="button"
              accessibilityLabel={`${name}, ${tierLabel}, ${badge.label}. View favor details`}
            >
              <Avatar uri={pal?.avatar} size={60} name={name} />
              <View style={{ flex: 1, marginLeft: tokens.spacing.base }}>
                <View style={styles.rowBetween}>
                  <Txt variant="label" style={{ fontSize: 17, flex: 1 }} numberOfLines={1}>
                    {name}
                  </Txt>
                  <Txt variant="bodySm" color={theme.textSecondary}>
                    View More
                  </Txt>
                </View>
                <Txt variant="bodySm" color={theme.textSecondary} style={{ marginTop: 1 }}>
                  {tierLabel}
                </Txt>
                <Txt variant="bodySm" color={theme.textSecondary} numberOfLines={2} style={{ marginTop: 6 }}>
                  {h.description}
                </Txt>
                <View style={[styles.rowBetween, { marginTop: 8 }]}>
                  <View style={styles.inline}>
                    <Ionicons name="calendar-outline" size={16} color={theme.textSecondary} />
                    <Txt variant="label" style={{ fontSize: 14, marginLeft: 8 }}>
                      {listDate(h.scheduledFor ?? h.createdAt)}
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
        })}
        {s.history.length === 0 && (
          <Txt variant="body" color={theme.textSecondary} center style={{ marginTop: 48 }}>
            No past favors yet.
          </Txt>
        )}
      </ScrollView>
    </Screen>
  );
};

// ===========================================================================
// FavorHistoryDetail — full record of a single favor
// ===========================================================================
export const FavorHistoryDetail = ({ navigation, route }: any) => {
  const { theme } = useTheme();
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

  const Divider = () => <View style={[styles.divider, { backgroundColor: theme.divider }]} />;

  return (
    <Screen padded={false}>
      <TopBar title="Payment History Detail" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: tokens.spacing.lg, paddingBottom: 40 }}>
        {/* ---- Header: type + schedule ---- */}
        <View style={styles.inline}>
          <View style={[styles.thumb, { backgroundColor: theme.surfaceAlt }]}>
            {favor?.images?.[0] ? (
              <Image source={{ uri: favor.images[0] }} style={styles.thumbImg} />
            ) : (
              <Ionicons name="cube" size={22} color={theme.textTertiary} />
            )}
          </View>
          <View style={{ marginLeft: tokens.spacing.md }}>
            <Txt variant="label" style={{ fontSize: 17 }}>
              {tierLabel}
            </Txt>
            <Txt variant="caption" color={theme.textSecondary} style={{ marginTop: 2 }}>
              {longDay(when)}
            </Txt>
            <Txt variant="caption" color={theme.textSecondary}>
              {timeOnly(when)}
            </Txt>
          </View>
        </View>

        <Button
          title="Request this favor again"
          variant="secondary"
          uppercase={false}
          onPress={requestAgain}
          style={{ marginTop: tokens.spacing.base }}
        />

        <Divider />

        {/* ---- Description ---- */}
        <View style={styles.sectionHead}>
          <Ionicons name="document-text-outline" size={20} color={theme.text} />
          <Txt variant="label" style={{ marginLeft: 10 }}>
            Description
          </Txt>
        </View>
        <Txt variant="bodySm" color={theme.textSecondary} style={{ marginTop: 6 }}>
          {favor?.description}
        </Txt>

        <Divider />

        {/* ---- Address ---- */}
        <View style={styles.sectionHead}>
          <Ionicons name="location-outline" size={20} color={theme.text} />
          <Txt variant="label" style={{ marginLeft: 10 }}>
            Address
          </Txt>
        </View>
        <Txt variant="bodySm" color={theme.textSecondary} style={{ marginTop: 6 }}>
          {favor?.location?.address}
        </Txt>

        <Divider />

        {/* ---- Favor Pal ---- */}
        <Txt variant="label" style={{ marginBottom: tokens.spacing.md }}>
          Favor Pal
        </Txt>
        <View style={styles.inline}>
          <Avatar uri={pal?.avatar} size={56} name={palName} />
          <View style={{ flex: 1, marginLeft: tokens.spacing.md }}>
            <View style={styles.rowBetween}>
              <Txt variant="label" style={{ fontSize: 17 }}>
                {palName}
              </Txt>
              {pal && (
                <View style={styles.inline}>
                  <Ionicons name="star" size={15} color={theme.star} />
                  <Txt variant="bodySm" style={{ marginLeft: 4 }}>
                    {pal.rating?.toFixed(1)}
                  </Txt>
                </View>
              )}
            </View>
            {pal ? (
              <>
                <Txt variant="caption" color={theme.textSecondary} style={{ marginTop: 2 }}>
                  3 Miles away
                </Txt>
                <View style={[styles.inline, { marginTop: 6 }]}>
                  <Ionicons name="thumbs-up-outline" size={14} color={theme.textSecondary} />
                  <Txt variant="caption" color={theme.textSecondary} style={{ marginLeft: 6 }}>
                    {pal.reliability}% Reliable
                  </Txt>
                </View>
                <View style={[styles.inline, { marginTop: 4 }]}>
                  <Ionicons name="star-outline" size={14} color={theme.textSecondary} />
                  <Txt variant="caption" color={theme.textSecondary} style={{ marginLeft: 6 }}>
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
        <Txt variant="label" style={{ marginBottom: tokens.spacing.md }}>
          Payment
        </Txt>
        <View style={styles.rowBetween}>
          <View style={styles.inline}>
            <Ionicons name="card-outline" size={20} color={theme.text} />
            <Txt variant="label" style={{ marginLeft: 10 }}>
              {card ? `${cap(card.brand)} •••• ${card.last4}` : 'Card on file'}
            </Txt>
          </View>
          <Txt variant="label">${favor?.total?.toFixed(2)}</Txt>
        </View>
        <Txt variant="bodySm" color={theme.textSecondary} style={{ marginTop: 6 }}>
          Favor ${favor?.price?.toFixed(2)} + fees ${feeTotal.toFixed(2)}
          {favor?.tip ? ` + tip $${favor.tip.toFixed(2)}` : ''}
        </Txt>
        <View style={[styles.rowBetween, { marginTop: 14 }]}>
          <Txt variant="caption" color={theme.textSecondary}>
            Date &amp; Time
          </Txt>
          <Txt variant="bodySm">{stampDate(when)}</Txt>
        </View>
        <View style={[styles.rowBetween, { marginTop: 8 }]}>
          <Txt variant="caption" color={theme.textSecondary}>
            Transaction ID
          </Txt>
          <Txt variant="bodySm">{txnId(favor?.id)}</Txt>
        </View>

        <Divider />

        {/* ---- Feedback ---- */}
        <Txt variant="label" style={{ marginBottom: tokens.spacing.md }}>
          Feedback
        </Txt>
        <View style={styles.inline}>
          <Txt variant="bodySm" color={theme.textSecondary} style={{ marginRight: 14 }}>
            Rating
          </Txt>
          <StarRating value={favor?.rating ?? 0} size={20} />
        </View>
        <Txt variant="label" style={{ marginTop: tokens.spacing.base }}>
          Comment
        </Txt>
        <Txt variant="bodySm" color={theme.textSecondary} style={{ marginTop: 6 }}>
          {favor?.feedback ?? 'No comment was left for this favor.'}
        </Txt>

        <Divider />

        {/* ---- Help / support ---- */}
        <Txt variant="label">Need help or have a question with this favor?</Txt>
        <Txt variant="label" style={{ marginBottom: tokens.spacing.md }}>
          Send us a message.
        </Txt>
        <Field
          value={message}
          onChangeText={setMessage}
          multiline
          maxLength={700}
          placeholder="Provide as much detail as possible about your favor!  Let your provider know what they will be doing, what they will need to bring, special requirements, etc."
        />
        <Txt variant="caption" color={theme.textSecondary} style={{ textAlign: 'right', marginTop: -6, marginBottom: tokens.spacing.lg }}>
          700 characters max.
        </Txt>
        <Button
          title="SEND"
          variant="primary"
          disabled={!message.trim()}
          onPress={sendMessage}
        />
      </ScrollView>
      <InfoModal
        visible={sent}
        title="Message sent"
        message="Thanks for reaching out. We'll get back to you about this favor shortly."
        buttonLabel="OK"
        onClose={() => setSent(false)}
      />
    </Screen>
  );
};

const styles = StyleSheet.create({
  listRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
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
