import React, { useState } from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, tokens } from '../theme';
import {
  Screen, Txt, Button, Field, Avatar, StarRating, TopBar,
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

// Color-coded status badge meta.
function statusMeta(status: FavorStatus, theme: any): { label: string; fg: string; bg: string } {
  switch (status) {
    case 'completed':
      return { label: 'Completed', fg: '#0A8F08', bg: '#E4F8E4' };
    case 'cancelled':
      return { label: 'Cancelled', fg: theme.danger, bg: '#FCE3E4' };
    case 'in_progress':
      return { label: 'In Progress', fg: '#B07A00', bg: '#FFF3D6' };
    case 'matched':
      return { label: 'Matched', fg: '#B07A00', bg: '#FFF3D6' };
    case 'enroute':
      return { label: 'En Route', fg: '#B07A00', bg: '#FFF3D6' };
    case 'arrived':
      return { label: 'Arrived', fg: '#B07A00', bg: '#FFF3D6' };
    case 'requested':
      return { label: 'Requested', fg: theme.link, bg: '#E3F1FC' };
    case 'no_pal':
      return { label: 'No Pal', fg: theme.danger, bg: '#FCE3E4' };
    default:
      return { label: cap(status), fg: theme.textSecondary, bg: theme.surfaceAlt };
  }
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
          const pal = s.pals.find((p) => p.id === h.palId);
          const name = pal ? `${pal.firstName} ${pal.lastName}` : 'Favor Pal';
          const tierLabel = FAVOR_TIERS[h.tier as keyof typeof FAVOR_TIERS]?.label ?? 'Custom Favor';
          const badge = statusMeta(h.status, theme);
          return (
            <TouchableOpacity
              key={h.id}
              activeOpacity={0.7}
              onPress={() => navigation.navigate('FavorHistoryDetail', { favorId: h.id })}
              style={styles.listRow}
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
                  <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                    <Txt variant="caption" color={badge.fg} style={{ fontSize: 12 }}>
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

  const favorId: string | undefined = route?.params?.favorId;
  const favor: Favor = s.history.find((f) => f.id === favorId) ?? s.history[0];
  const pal = s.pals.find((p) => p.id === favor?.palId) ?? s.pals[0];
  const card = s.cards[0];
  const when = favor?.scheduledFor ?? favor?.createdAt ?? Date.now();
  const tierLabel = FAVOR_TIERS[favor?.tier as keyof typeof FAVOR_TIERS]?.label ?? 'Custom Favor';
  const palName = pal ? `${pal.firstName} ${pal.lastName}` : 'Favor Pal';
  const feeTotal = (favor?.serviceFee ?? 0) + (favor?.transactionFee ?? 0);

  const Divider = () => <View style={[styles.divider, { backgroundColor: theme.divider }]} />;

  return (
    <Screen padded={false}>
      <TopBar title="Payment History Detail" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: tokens.spacing.lg, paddingBottom: 40 }}>
        {/* ---- Header: type + schedule ---- */}
        <View style={styles.inline}>
          <View style={[styles.thumb, { backgroundColor: theme.surfaceAlt }]}>
            <Ionicons name="paw" size={22} color={theme.textTertiary} />
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
              <View style={styles.inline}>
                <Ionicons name="star" size={15} color={theme.star} />
                <Txt variant="bodySm" style={{ marginLeft: 4 }}>
                  {pal?.rating?.toFixed(1)}
                </Txt>
              </View>
            </View>
            <Txt variant="caption" color={theme.textSecondary} style={{ marginTop: 2 }}>
              3 Miles away
            </Txt>
            <View style={[styles.inline, { marginTop: 6 }]}>
              <Ionicons name="thumbs-up-outline" size={14} color={theme.textSecondary} />
              <Txt variant="caption" color={theme.textSecondary} style={{ marginLeft: 6 }}>
                {pal?.reliability}% Reliable
              </Txt>
            </View>
            <View style={[styles.inline, { marginTop: 4 }]}>
              <Ionicons name="star-outline" size={14} color={theme.textSecondary} />
              <Txt variant="caption" color={theme.textSecondary} style={{ marginLeft: 6 }}>
                {pal?.positiveReviews}% Positive Reviews
              </Txt>
            </View>
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
          <Txt variant="bodySm">1234abcde56fg</Txt>
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
        <Button title="SEND" variant="primary" onPress={() => setMessage('')} />
      </ScrollView>
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
    borderBottomColor: '#E5E5E5',
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
