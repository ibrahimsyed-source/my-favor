import React, { useState, useEffect } from 'react';
import {
  View, ScrollView, StyleSheet, TouchableOpacity, useWindowDimensions, DimensionValue,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Txt, Button, Avatar, MapPlaceholder } from '../components';
import { useTheme, tokens } from '../theme';
import { useStore } from '../store';
import { getPalReviewsApi } from '../api/endpoints';
import { Review } from '../types';

const PIN_RED = '#D40000';
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const fmtDate = (ms: number) => {
  const d = new Date(ms);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

// distance copy: closest pal is "1 mile away", the rest plural.
const distanceLabel = (i: number) => `${i + 1} mile${i === 0 ? '' : 's'} away`;

const MapPin: React.FC<{ top: DimensionValue; left: DimensionValue; size?: number }> = ({ top, left, size = 42 }) => (
  <View style={{ position: 'absolute', top, left }}>
    <Ionicons name="location" size={size} color={PIN_RED} />
  </View>
);

// ---------------------------------------------------------------------------
// ProviderResults — map + bottom-sheet of nearby Favor Pals.
// ---------------------------------------------------------------------------
export const ProviderResults = ({ navigation }: any) => {
  const { theme } = useTheme();
  const { pals } = useStore();
  // useWindowDimensions() re-renders on resize/rotation/split-view so the
  // full-bleed map tracks the viewport instead of freezing at first paint.
  const { height: SCREEN_H } = useWindowDimensions();

  return (
    <Screen padded={false}>
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        <MapPlaceholder height={SCREEN_H} label="">
          <MapPin top="16%" left="66%" />
          <MapPin top="27%" left="22%" />
          <MapPin top="42%" left="50%" />
        </MapPlaceholder>

        <View style={[styles.sheet, { backgroundColor: theme.surface }]}>
          <View style={[styles.handle, { backgroundColor: theme.border }]} />
          <Txt variant="label" center style={styles.resultsTitle}>
            Click on a Favor Pal near you to do your favor!
          </Txt>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.cardRow}
          >
            {pals.map((pal, i) => (
              <TouchableOpacity
                key={pal.id}
                activeOpacity={0.85}
                style={styles.palCard}
                accessibilityRole="button"
                accessibilityLabel={`${pal.firstName} ${pal.lastName}, ${pal.rating.toFixed(1)} stars, ${distanceLabel(i)}. View profile`}
                onPress={() => navigation.navigate('ProviderDetail', { palId: pal.id })}
              >
                <Avatar uri={pal.avatar} size={62} name={pal.firstName} />
                <Txt variant="label" center numberOfLines={1} style={styles.palName}>
                  {pal.firstName} {pal.lastName}
                </Txt>
                <View style={styles.rateRow}>
                  <Ionicons name="star" size={13} color={theme.star} />
                  <Txt variant="caption" color={theme.text} style={{ marginLeft: 3 }}>
                    {pal.rating.toFixed(1)}
                  </Txt>
                </View>
                <Txt variant="caption" center color={theme.textSecondary}>
                  {distanceLabel(i)}
                </Txt>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    </Screen>
  );
};

// ---------------------------------------------------------------------------
// ProviderDetail — blurred map + pal profile bottom-sheet with reviews.
// ---------------------------------------------------------------------------
export const ProviderDetail = ({ navigation, route }: any) => {
  const { theme } = useTheme();
  const { pals, assignPal, history } = useStore();
  const { height: SCREEN_H } = useWindowDimensions();
  const pal = pals.find((p) => p.id === route?.params?.palId) ?? pals[0];

  const mapH = SCREEN_H * 0.36;
  // Real reviews members have left for this pal (fetched from the backend).
  const [palRevs, setPalRevs] = useState<Review[]>([]);
  useEffect(() => {
    let alive = true;
    getPalReviewsApi(pal.id).then(({ reviews }) => { if (alive) setPalRevs(reviews); }).catch(() => undefined);
    return () => { alive = false; };
  }, [pal.id]);
  // Surface a rebook loop when the member has completed a favor with this pal before.
  const bookedBefore = history.some((h) => h.palId === pal.id && h.status === 'completed');

  // Bind the chosen pal to the active favor (core of the tracking flow), then track.
  const book = () => {
    assignPal(pal.id);
    navigation.navigate('FavorTracking');
  };

  return (
    <Screen padded={false}>
      <View style={{ flex: 1, backgroundColor: theme.surface }}>
        {/* Blurred / dimmed map top */}
        <View style={{ height: mapH }}>
          <MapPlaceholder height={mapH} label="">
            <MapPin top="18%" left="74%" size={38} />
            <MapPin top="12%" left="20%" size={38} />
            <View style={[styles.userPin, { borderColor: PIN_RED }]}>
              <Avatar uri={pal.avatar} size={34} name={pal.firstName} />
            </View>
          </MapPlaceholder>
          <View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.35)' }]}
          />
        </View>

        {/* Bottom sheet */}
        <View style={[styles.detailSheet, { backgroundColor: theme.surface }]}>
          <View style={[styles.handle, { backgroundColor: theme.text }]} />
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: tokens.spacing.xl, paddingBottom: tokens.spacing.xxl }}
          >
            {/* Header */}
            <View style={{ flexDirection: 'row' }}>
              <Avatar uri={pal.avatar} size={72} name={pal.firstName} />
              <View style={{ flex: 1, marginLeft: tokens.spacing.base }}>
                <View style={styles.headerTop}>
                  <Txt variant="label" style={{ fontSize: 18 }} numberOfLines={1}>
                    {pal.firstName} {pal.lastName}
                  </Txt>
                  <View style={styles.rateRow}>
                    <Ionicons name="star" size={18} color={theme.star} />
                    <Txt variant="label" style={{ marginLeft: 4 }}>
                      {pal.rating.toFixed(1)}
                    </Txt>
                  </View>
                </View>
                <Txt variant="bodySm" color={theme.textSecondary} style={{ marginTop: 2 }}>
                  1 mile away
                </Txt>
                <View style={{ marginTop: 10 }}>
                  <View style={styles.statRow}>
                    <Ionicons name="thumbs-up-outline" size={16} color={theme.textSecondary} />
                    <Txt variant="bodySm" color={theme.textSecondary} style={{ marginLeft: 8 }}>
                      {pal.reliability}% Reliable
                    </Txt>
                  </View>
                  <View style={[styles.statRow, { marginTop: 6 }]}>
                    <Ionicons name="checkmark-circle-outline" size={16} color={theme.textSecondary} />
                    <Txt variant="bodySm" color={theme.textSecondary} style={{ marginLeft: 8 }}>
                      {pal.positiveReviews}% Positive Reviews
                    </Txt>
                  </View>
                </View>
              </View>
            </View>

            <View style={[styles.divider, { backgroundColor: theme.divider }]} />

            {/* Bio — per-pal so every provider isn't identical */}
            <Txt variant="label" style={{ fontSize: 15 }}>How I can help?</Txt>
            <Txt variant="bodySm" color={theme.textSecondary} style={{ marginTop: 10, lineHeight: 22 }}>
              {pal.bio}
            </Txt>

            {/* Reviews */}
            <View style={{ marginTop: tokens.spacing.lg }}>
              <Txt variant="label" style={{ fontSize: 15, marginBottom: tokens.spacing.md }}>
                Reviews{palRevs.length ? ` (${palRevs.length})` : ''}
              </Txt>
              {palRevs.length === 0 ? (
                <Txt variant="bodySm" color={theme.textSecondary} style={{ fontStyle: 'italic' }}>
                  No reviews yet — be the first to book {pal.firstName}.
                </Txt>
              ) : null}
              {palRevs.map((r) => (
                <View key={r.id} style={{ marginBottom: tokens.spacing.base }}>
                  <Txt
                    variant="bodySm"
                    color={theme.textSecondary}
                    style={{ fontStyle: 'italic', lineHeight: 22 }}
                  >
                    {'“'}{r.comment}{'”'}
                  </Txt>
                  <Txt
                    variant="bodySm"
                    color={theme.textSecondary}
                    style={{ fontStyle: 'italic', marginTop: 4 }}
                  >
                    {'–'} {r.authorName}, {fmtDate(r.date)}
                  </Txt>
                </View>
              ))}
            </View>

            {/* Rebook affordance — only when this member has used this pal before */}
            {bookedBefore && (
              <TouchableOpacity
                style={styles.rebookRow}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Request ${pal.firstName} again`}
                onPress={book}
              >
                <Ionicons name="refresh" size={16} color={theme.text} />
                <Txt variant="bodySm" color={theme.text} style={{ marginLeft: 8 }}>
                  You{"’"}ve booked {pal.firstName} before — Request again
                </Txt>
              </TouchableOpacity>
            )}

            <Button
              title="BOOK FAVOR PAL"
              variant="primary"
              onPress={book}
              style={{ marginTop: tokens.spacing.sm }}
            />
          </ScrollView>
        </View>
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: tokens.radius.lg,
    borderTopRightRadius: tokens.radius.lg,
    paddingTop: tokens.spacing.base,
    paddingBottom: tokens.spacing.xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 12,
  },
  handle: {
    width: 80,
    height: 5,
    borderRadius: 2.5,
    alignSelf: 'center',
    opacity: 0.85,
  },
  resultsTitle: {
    fontSize: 16,
    lineHeight: 23,
    marginTop: tokens.spacing.base,
    marginBottom: tokens.spacing.lg,
    paddingHorizontal: tokens.spacing.xl,
  },
  cardRow: {
    paddingHorizontal: tokens.spacing.lg,
    paddingBottom: tokens.spacing.sm,
    gap: tokens.spacing.lg,
  },
  palCard: {
    width: 76,
    alignItems: 'center',
  },
  palName: {
    marginTop: 8,
    fontSize: 14,
  },
  rateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 2,
  },
  detailSheet: {
    flex: 1,
    marginTop: -tokens.radius.lg,
    borderTopLeftRadius: tokens.radius.lg,
    borderTopRightRadius: tokens.radius.lg,
    paddingTop: tokens.spacing.base,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 12,
  },
  userPin: {
    position: 'absolute',
    top: '42%',
    left: '44%',
    padding: 3,
    borderWidth: 3,
    borderRadius: 999,
    backgroundColor: PIN_RED,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: tokens.spacing.lg,
  },
  rebookRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: tokens.spacing.lg,
  },
});
