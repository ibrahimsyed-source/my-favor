import React, { useState, useEffect } from 'react';
import {
  View, ScrollView, StyleSheet, TouchableOpacity, useWindowDimensions, DimensionValue,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Txt, Button, Avatar } from '../components';
import { tokens } from '../theme';
import { useStore } from '../store';
import { getPalReviewsApi } from '../api/endpoints';
import { Review } from '../types';

// User App v.2 — the provider (Favor Pal) discovery screens are DARK: a dark
// navy map backdrop with dark bottom sheets, white text and red accents. The
// shared useTheme() palette is light (used by the auth screens), so these
// screens use their own local dark palette instead.
const DARK = {
  mapBg: '#20242C',          // dark "map paper"
  sheet: '#1B222C',          // dark navy bottom sheet
  raised: '#1C2331',         // raised field / pill
  text: '#FFFFFF',
  textSecondary: 'rgba(255,255,255,0.6)',
  textTertiary: 'rgba(255,255,255,0.4)',
  border: 'rgba(255,255,255,0.10)',
  handle: 'rgba(255,255,255,0.85)',
} as const;
const BRAND = '#ED1C24';                       // brand red accent
const STAR = '#FFBD00';                         // rating amber
const STREET = 'rgba(255,255,255,0.06)';        // faint side streets
const STREET_MAIN = 'rgba(212,160,90,0.30)';    // dim arterials

const PIN_RED = BRAND;
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

// Dark street-map backdrop (v.2): a near-black "map paper" with a faint street
// grid + dim arterials so the area reads as a map behind the dark sheet.
const DarkMap: React.FC<{ height: number; children?: React.ReactNode }> = ({ height, children }) => (
  <View style={{ height, backgroundColor: DARK.mapBg, overflow: 'hidden' }}>
    {[0.14, 0.34, 0.54, 0.74, 0.9].map((x) => (
      <View key={`v${x}`} style={{ position: 'absolute', top: 0, bottom: 0, left: `${x * 100}%`, width: 2, backgroundColor: STREET }} />
    ))}
    {[0.16, 0.34, 0.52, 0.7, 0.88].map((y) => (
      <View key={`h${y}`} style={{ position: 'absolute', left: 0, right: 0, top: `${y * 100}%`, height: 2, backgroundColor: STREET }} />
    ))}
    <View style={{ position: 'absolute', top: 0, bottom: 0, left: '26%', width: 5, backgroundColor: STREET_MAIN }} />
    <View style={{ position: 'absolute', left: 0, right: 0, top: '46%', height: 5, backgroundColor: STREET_MAIN }} />
    {children}
  </View>
);

// ---------------------------------------------------------------------------
// ProviderResults — dark map + bottom-sheet of nearby Favor Pals.
// ---------------------------------------------------------------------------
export const ProviderResults = ({ navigation }: any) => {
  const { pals } = useStore();
  // useWindowDimensions() re-renders on resize/rotation/split-view so the
  // full-bleed map tracks the viewport instead of freezing at first paint.
  const { height: SCREEN_H } = useWindowDimensions();

  return (
    <View style={{ flex: 1, backgroundColor: DARK.mapBg }}>
      <DarkMap height={SCREEN_H}>
        <MapPin top="16%" left="66%" />
        <MapPin top="27%" left="22%" />
        <MapPin top="42%" left="50%" />
      </DarkMap>

      <View style={[styles.sheet, { backgroundColor: DARK.sheet }]}>
        <View style={[styles.handle, { backgroundColor: DARK.handle }]} />
        <Txt variant="label" center color={DARK.text} style={styles.resultsTitle}>
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
              <Txt variant="label" center numberOfLines={1} color={DARK.text} style={styles.palName}>
                {pal.firstName} {pal.lastName}
              </Txt>
              <View style={styles.rateRow}>
                <Ionicons name="star" size={13} color={STAR} />
                <Txt variant="caption" color={DARK.text} style={{ marginLeft: 3 }}>
                  {pal.rating.toFixed(1)}
                </Txt>
              </View>
              <Txt variant="caption" center color={DARK.textSecondary}>
                {distanceLabel(i)}
              </Txt>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </View>
  );
};

// ---------------------------------------------------------------------------
// ProviderDetail — dark map + pal profile bottom-sheet with reviews.
// ---------------------------------------------------------------------------
export const ProviderDetail = ({ navigation, route }: any) => {
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
    <View style={{ flex: 1, backgroundColor: DARK.sheet }}>
      {/* Dark / dimmed map top */}
      <View style={{ height: mapH }}>
        <DarkMap height={mapH}>
          <MapPin top="18%" left="74%" size={38} />
          <MapPin top="12%" left="20%" size={38} />
          <View style={[styles.userPin, { borderColor: PIN_RED }]}>
            <Avatar uri={pal.avatar} size={34} name={pal.firstName} />
          </View>
        </DarkMap>
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.35)' }]}
        />
      </View>

      {/* Bottom sheet */}
      <View style={[styles.detailSheet, { backgroundColor: DARK.sheet }]}>
        <View style={[styles.handle, { backgroundColor: DARK.handle }]} />
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: tokens.spacing.xl, paddingBottom: tokens.spacing.xxl }}
        >
          {/* Header */}
          <View style={{ flexDirection: 'row' }}>
            <Avatar uri={pal.avatar} size={72} name={pal.firstName} />
            <View style={{ flex: 1, marginLeft: tokens.spacing.base }}>
              <View style={styles.headerTop}>
                <Txt variant="label" color={DARK.text} style={{ fontSize: 18 }} numberOfLines={1}>
                  {pal.firstName} {pal.lastName}
                </Txt>
                <View style={styles.rateRow}>
                  <Ionicons name="star" size={18} color={STAR} />
                  <Txt variant="label" color={DARK.text} style={{ marginLeft: 4 }}>
                    {pal.rating.toFixed(1)}
                  </Txt>
                </View>
              </View>
              <Txt variant="bodySm" color={DARK.textSecondary} style={{ marginTop: 2 }}>
                1 mile away
              </Txt>
              <View style={{ marginTop: 10 }}>
                <View style={styles.statRow}>
                  <Ionicons name="thumbs-up-outline" size={16} color={DARK.textSecondary} />
                  <Txt variant="bodySm" color={DARK.textSecondary} style={{ marginLeft: 8 }}>
                    {pal.reliability}% Reliable
                  </Txt>
                </View>
                <View style={[styles.statRow, { marginTop: 6 }]}>
                  <Ionicons name="checkmark-circle-outline" size={16} color={DARK.textSecondary} />
                  <Txt variant="bodySm" color={DARK.textSecondary} style={{ marginLeft: 8 }}>
                    {pal.positiveReviews}% Positive Reviews
                  </Txt>
                </View>
              </View>
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: DARK.border }]} />

          {/* Bio — per-pal so every provider isn't identical */}
          <Txt variant="label" color={DARK.text} style={{ fontSize: 15 }}>How I can help?</Txt>
          <Txt variant="bodySm" color={DARK.textSecondary} style={{ marginTop: 10, lineHeight: 22 }}>
            {pal.bio}
          </Txt>

          {/* Reviews */}
          <View style={{ marginTop: tokens.spacing.lg }}>
            <Txt variant="label" color={DARK.text} style={{ fontSize: 15, marginBottom: tokens.spacing.md }}>
              Reviews{palRevs.length ? ` (${palRevs.length})` : ''}
            </Txt>
            {palRevs.length === 0 ? (
              <Txt variant="bodySm" color={DARK.textSecondary} style={{ fontStyle: 'italic' }}>
                No reviews yet — be the first to book {pal.firstName}.
              </Txt>
            ) : null}
            {palRevs.map((r) => (
              <View key={r.id} style={{ marginBottom: tokens.spacing.base }}>
                <Txt
                  variant="bodySm"
                  color={DARK.textSecondary}
                  style={{ fontStyle: 'italic', lineHeight: 22 }}
                >
                  {'“'}{r.comment}{'”'}
                </Txt>
                <Txt
                  variant="bodySm"
                  color={DARK.textTertiary}
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
              <Ionicons name="refresh" size={16} color={DARK.text} />
              <Txt variant="bodySm" color={DARK.text} style={{ marginLeft: 8 }}>
                You{"’"}ve booked {pal.firstName} before — Request again
              </Txt>
            </TouchableOpacity>
          )}

          <Button
            title="BOOK FAVOR PAL"
            variant="white"
            onPress={book}
            style={{ marginTop: tokens.spacing.lg }}
          />
        </ScrollView>
      </View>
    </View>
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
    shadowOpacity: 0.4,
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
    shadowOpacity: 0.4,
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
