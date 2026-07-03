import React, { useState, useEffect } from 'react';
import {
  View, ScrollView, StyleSheet, TouchableOpacity, Pressable, Modal, Image,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFonts, Poppins_400Regular, Poppins_400Regular_Italic } from '@expo-google-fonts/poppins';
import { Txt, Button, Avatar } from '../components';
import { useStore } from '../store';
import { getPalReviewsApi } from '../api/endpoints';
import { Review } from '../types';

// ---------------------------------------------------------------------------
// User App v.2 — Provider Results #125:8687 / Provider Detail #125:8762 /
// Favor Pal Profile #125:11283 / Favor Pal Modal v2 #130:9983.
// The discovery screens are LIGHT: a blurred + dimmed street map behind a
// white 16px-radius bottom sheet. All values below are lifted from the Figma
// node data (414x896 frames).
// ---------------------------------------------------------------------------

const INK = '#0D0A0A';        // primary text
const GRAY = '#484747';       // secondary text
const HAIRLINE = '#EEEEEE';   // dividers
const TOPBAR_LINE = '#D7D7D7';
const STAR = '#F0AD4E';       // amber rating star
const ICON_GRAY = '#6E6E6E';  // detail stat icons (thumbs-up / star)
const TRACK = '#D7D7D7';      // modal switch track (off)

// Poppins 500/600/700 are registered app-wide (App.tsx); 400 + italic are
// loaded locally, same pattern as messages.tsx.
const P_REG = 'Poppins_400Regular';
const P_MED = 'Poppins_500Medium';
const P_SEMI = 'Poppins_600SemiBold';
const P_ITALIC = 'Poppins_400Regular_Italic';

// Pre-composited backdrop (map screenshot + pins + radial oval + user pin,
// gaussian blur 6.8px + 50% black — the exact recipe of the v.2 frames),
// exported at 2x for the full 414x896 frame.
const MAP_BG = require('../../assets/img/providers/map-blurred.jpg');
const FRAME_W = 414;
const FRAME_H = 896;

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
// Provider Detail quote: "15 March 2021"
const fmtLong = (ms: number) => {
  const d = new Date(ms);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};
// Favor Pal Profile review dates: "24 Mar 2021"
const fmtShort = (ms: number) => {
  const d = new Date(ms);
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
};

// distance copy: closest pal is "1 mile away", the rest plural.
const distanceLabel = (i: number) => `${i + 1} mile${i === 0 ? '' : 's'} away`;

// Full-bleed blurred map backdrop (width-anchored, exactly as the 414-wide frame).
const MapBackdrop: React.FC = () => {
  const { width } = useWindowDimensions();
  return (
    <Image
      source={MAP_BG}
      style={{ position: 'absolute', top: 0, left: 0, width, height: (width * FRAME_H) / FRAME_W }}
      resizeMode="stretch"
    />
  );
};

// ---------------------------------------------------------------------------
// Favor Pal Modal v2 #130:9983 — "Be A Favor Pal" promo card over a dimmed
// backdrop. Opened from the (blurred) "Switch to be a favor pal" pill baked
// into the map header. (Design backdrop also has a 6.8px backdrop-blur; RN
// has no backdrop-filter, so the 50% black scrim alone stands in for it.)
// ---------------------------------------------------------------------------
const BeAFavorPalModal: React.FC<{
  visible: boolean;
  onClose: () => void;
  onSwitch: () => void;
}> = ({ visible, onClose, onSwitch }) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <Pressable style={styles.modalBackdrop} onPress={onClose} accessibilityLabel="Dismiss">
      <Pressable style={styles.modalCard} onPress={() => undefined}>
        <Txt style={styles.modalTitle}>Be A Favor Pal</Txt>
        <Txt style={styles.modalBody}>
          Earn some cash while doing favors for others!
        </Txt>
        <Txt style={styles.modalBodyBold}>
          Use the switch button on the dashboard to become a Favor Pal
        </Txt>
        <TouchableOpacity
          style={styles.switchPill}
          activeOpacity={0.85}
          onPress={onSwitch}
          accessibilityRole="switch"
          accessibilityLabel="Switch to be a Favor Pal"
        >
          <Txt style={styles.switchPillText}>Switch to be a Favor Pal</Txt>
          <View style={styles.switchTrack}>
            <View style={styles.switchKnob} />
          </View>
        </TouchableOpacity>
      </Pressable>
    </Pressable>
  </Modal>
);

// ---------------------------------------------------------------------------
// ProviderResults — blurred map + white bottom sheet with the nearby pals row.
// ---------------------------------------------------------------------------
export const ProviderResults = ({ navigation }: any) => {
  const { pals, setRole } = useStore();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [fontsLoaded] = useFonts({ Poppins_400Regular, Poppins_400Regular_Italic });
  const [showPalModal, setShowPalModal] = useState(false);

  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />;

  const s = width / FRAME_W; // design-px -> dp

  const switchToPal = () => {
    setShowPalModal(false);
    setRole('pal');
    navigation.navigate('Tabs');
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <MapBackdrop />

      {/* The blurred "Switch to be a favor pal" pill on the map opens the
          Be A Favor Pal modal (Favor Pal Modal v2). */}
      <Pressable
        style={{ position: 'absolute', left: 147 * s, top: 63 * s, width: 244 * s, height: 40 * s }}
        onPress={() => setShowPalModal(true)}
        accessibilityRole="button"
        accessibilityLabel="Switch to be a favor pal"
      />

      {/* Bottom sheet */}
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 34) + 23 }]}>
        <View style={styles.handle} />
        <Txt style={styles.resultsTitle}>
          {'Click on a Favor Pal near you\nto do your favor!'}
        </Txt>
        <View style={styles.divider} />
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
              accessibilityLabel={`${pal.firstName} ${pal.lastName}, ${pal.rating.toFixed(1)} stars, ${distanceLabel(i)}. View details`}
              onPress={() => navigation.navigate('ProviderDetail', { palId: pal.id })}
            >
              <Avatar uri={pal.avatar} size={80} name={pal.firstName} />
              <Txt numberOfLines={1} style={styles.palName}>
                {pal.firstName} {pal.lastName}
              </Txt>
              <View style={styles.rateRow}>
                <Ionicons name="star" size={18} color={STAR} />
                <Txt style={styles.rateText}>{pal.rating.toFixed(1)}</Txt>
              </View>
              <Txt style={styles.palDistance}>{distanceLabel(i)}</Txt>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <BeAFavorPalModal
        visible={showPalModal}
        onClose={() => setShowPalModal(false)}
        onSwitch={switchToPal}
      />
    </View>
  );
};

// ---------------------------------------------------------------------------
// Favor Pal Profile #125:11283 — full-screen profile with stats + reviews.
// Reached by tapping the pal header inside Provider Detail. (The BOOK NOW
// button is carried over from the profile design so the booking flow can
// continue to FavorTracking.)
// ---------------------------------------------------------------------------
const FavorPalProfile: React.FC<{
  pal: { avatar?: string; firstName: string; lastName: string; rating: number; totalFavors: number; yearsActive: number };
  reviews: Review[];
  onBack: () => void;
  onBook: () => void;
}> = ({ pal, reviews, onBack, onBook }) => {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF', paddingTop: insets.top }}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={onBack}
          style={styles.topBarBack}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="chevron-back" size={24} color={INK} />
        </TouchableOpacity>
        <Txt style={styles.topBarTitle}>Favor Pal Profile</Txt>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 24) + 16 }}
      >
        {/* Avatar / name / distance */}
        <View style={{ alignItems: 'center', marginTop: 24 }}>
          <Avatar uri={pal.avatar} size={134} name={pal.firstName} />
          <Txt style={styles.profileName}>{pal.firstName} {pal.lastName}</Txt>
          <Txt style={styles.profileDistance}>1 mile away</Txt>
        </View>

        <View style={[styles.divider, { marginTop: 23 }]} />

        {/* Stats row: Total Favors | Rating | Years */}
        <View style={styles.statsRow}>
          <View style={styles.statCell}>
            <Txt style={styles.statValue}>{pal.totalFavors}</Txt>
            <Txt style={styles.statLabel}>Total Favors</Txt>
          </View>
          <View style={styles.statCell}>
            <Txt style={styles.statValue}>{pal.rating.toFixed(1)}</Txt>
            <View style={styles.statLabelRow}>
              <Ionicons name="star" size={18} color={STAR} />
              <Txt style={{ ...styles.statLabel, marginLeft: 4 }}>Rating</Txt>
            </View>
          </View>
          <View style={styles.statCell}>
            <Txt style={styles.statValue}>{pal.yearsActive}</Txt>
            <Txt style={styles.statLabel}>Years</Txt>
          </View>
        </View>

        <View style={[styles.divider, { marginTop: 8 }]} />

        <Txt style={styles.reviewsHeading}>Reviews</Txt>

        {reviews.map((r) => (
          <View key={r.id} style={styles.reviewBlock}>
            <View style={styles.reviewTopRow}>
              <Txt style={styles.reviewAuthor}>{r.authorName}</Txt>
              <View style={{ flexDirection: 'row' }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Ionicons
                    key={n}
                    name={n <= r.rating ? 'star' : 'star-outline'}
                    size={20}
                    color={STAR}
                    style={{ marginLeft: n === 1 ? 0 : 4 }}
                  />
                ))}
              </View>
            </View>
            <Txt style={styles.reviewBody}>{r.comment}</Txt>
            <Txt style={styles.reviewDate}>{fmtShort(r.date)}</Txt>
          </View>
        ))}
        {reviews.length === 0 && (
          <Txt style={{ ...styles.reviewBody, marginHorizontal: 24, marginTop: 16 }}>
            No reviews yet.
          </Txt>
        )}

        <Button
          title="BOOK NOW"
          variant="primary"
          onPress={onBook}
          style={{ marginHorizontal: 24, marginTop: 24 }}
        />
      </ScrollView>
    </View>
  );
};

// ---------------------------------------------------------------------------
// ProviderDetail — blurred map top (320/896 of the frame) + white sheet with
// the pal header, stats, bio and the latest review quote.
// ---------------------------------------------------------------------------
export const ProviderDetail = ({ navigation, route }: any) => {
  const { pals, assignPal } = useStore();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [fontsLoaded] = useFonts({ Poppins_400Regular, Poppins_400Regular_Italic });
  const pal = pals.find((p) => p.id === route?.params?.palId) ?? pals[0];

  // Real reviews members have left for this pal (fetched from the backend).
  const [palRevs, setPalRevs] = useState<Review[]>([]);
  const [showProfile, setShowProfile] = useState(false);
  useEffect(() => {
    let alive = true;
    getPalReviewsApi(pal.id).then(({ reviews }) => { if (alive) setPalRevs(reviews); }).catch(() => undefined);
    return () => { alive = false; };
  }, [pal.id]);

  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />;

  const s = width / FRAME_W;
  const quote = palRevs[0];

  // Bind the chosen pal to the active favor (core of the tracking flow), then track.
  const book = () => {
    setShowProfile(false);
    assignPal(pal.id);
    navigation.navigate('FavorTracking');
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <MapBackdrop />

      {/* Bottom sheet — top edge at 320/896 of the frame */}
      <View style={[styles.detailSheet, { top: 320 * s }]}>
        <View style={[styles.handle, { marginTop: 23 }]} />
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 34) + 16 }}
        >
          {/* Header: avatar + name/distance/stats + rating. Tapping it opens
              the full Favor Pal Profile. */}
          <TouchableOpacity
            activeOpacity={0.8}
            style={styles.detailHeader}
            onPress={() => setShowProfile(true)}
            accessibilityRole="button"
            accessibilityLabel={`View ${pal.firstName} ${pal.lastName}'s profile`}
          >
            <Avatar uri={pal.avatar} size={75} name={pal.firstName} />
            <View style={{ flex: 1, marginLeft: 24 }}>
              <View style={styles.detailNameRow}>
                <Txt style={styles.detailName} numberOfLines={1}>
                  {pal.firstName} {pal.lastName}
                </Txt>
                <View style={styles.rateRow}>
                  <Ionicons name="star" size={20} color={STAR} />
                  <Txt style={styles.detailRating}>{pal.rating.toFixed(1)}</Txt>
                </View>
              </View>
              <Txt style={styles.detailDistance}>1 mile away</Txt>
              <View style={{ marginTop: 8 }}>
                <View style={styles.statIconRow}>
                  <Ionicons name="thumbs-up" size={18} color={ICON_GRAY} />
                  <Txt style={styles.statIconText}>{pal.reliability}% Reliable</Txt>
                </View>
                <View style={[styles.statIconRow, { marginTop: 7 }]}>
                  <Ionicons name="star" size={18} color={ICON_GRAY} />
                  <Txt style={styles.statIconText}>{pal.positiveReviews}% Positive Reviews</Txt>
                </View>
              </View>
            </View>
          </TouchableOpacity>

          <View style={[styles.divider, { marginTop: 16 }]} />

          {/* Bio */}
          <Txt style={styles.helpHeading}>How I can help?</Txt>
          <Txt style={styles.helpBody}>{pal.bio}</Txt>

          {/* Latest review quote */}
          {quote && (
            <Txt style={styles.quote}>
              {'“'}{quote.comment}{'”'}{'\n'}
              {'–'} {quote.authorName}, {fmtLong(quote.date)}
            </Txt>
          )}
        </ScrollView>
      </View>

      {/* Full profile (Favor Pal Profile #125:11283) */}
      <Modal
        visible={showProfile}
        animationType="slide"
        onRequestClose={() => setShowProfile(false)}
      >
        <FavorPalProfile
          pal={pal}
          reviews={palRevs}
          onBack={() => setShowProfile(false)}
          onBook={book}
        />
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  // ---- shared sheet chrome -------------------------------------------------
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 16,
  },
  detailSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 16,
  },
  handle: {
    width: 80,
    height: 5,
    borderRadius: 2,
    backgroundColor: INK,
    alignSelf: 'center',
    marginTop: 16,
  },
  divider: {
    height: 1,
    backgroundColor: HAIRLINE,
    marginHorizontal: 23,
  },

  // ---- Provider Results ----------------------------------------------------
  resultsTitle: {
    fontFamily: P_MED,
    fontSize: 16,
    lineHeight: 24,
    color: INK,
    textAlign: 'center',
    marginTop: 24,
    marginBottom: 24,
  },
  cardRow: {
    paddingHorizontal: 32,
    paddingTop: 24,
    gap: 24,
  },
  palCard: {
    width: 80,
    alignItems: 'center',
  },
  palName: {
    fontFamily: P_MED,
    fontSize: 16,
    lineHeight: 24,
    color: INK,
    textAlign: 'center',
    marginTop: 11,
  },
  rateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rateText: {
    fontFamily: P_MED,
    fontSize: 14,
    lineHeight: 21,
    color: INK,
    marginLeft: 4,
  },
  palDistance: {
    fontFamily: P_REG,
    fontSize: 12,
    lineHeight: 18,
    color: GRAY,
    textAlign: 'center',
    marginTop: 4,
  },

  // ---- Provider Detail -----------------------------------------------------
  detailHeader: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    marginTop: 25,
  },
  detailNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  detailName: {
    fontFamily: P_MED,
    fontSize: 18,
    lineHeight: 27,
    color: INK,
    flexShrink: 1,
    marginRight: 8,
  },
  detailRating: {
    fontFamily: P_MED,
    fontSize: 18,
    lineHeight: 27,
    color: INK,
    marginLeft: 8,
  },
  detailDistance: {
    fontFamily: P_REG,
    fontSize: 12,
    lineHeight: 18,
    color: GRAY,
    marginTop: 8,
  },
  statIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statIconText: {
    fontFamily: P_REG,
    fontSize: 12,
    lineHeight: 18,
    color: GRAY,
    marginLeft: 8,
  },
  helpHeading: {
    fontFamily: P_MED,
    fontSize: 14,
    lineHeight: 21,
    color: INK,
    marginTop: 18,
    marginHorizontal: 24,
  },
  helpBody: {
    fontFamily: P_REG,
    fontSize: 14,
    lineHeight: 22,
    color: GRAY,
    marginTop: 8,
    marginHorizontal: 24,
  },
  quote: {
    fontFamily: P_ITALIC,
    fontStyle: 'italic',
    fontSize: 14,
    lineHeight: 22,
    color: GRAY,
    marginTop: 24,
    marginHorizontal: 24,
  },

  // ---- Favor Pal Profile ---------------------------------------------------
  topBar: {
    height: 64,
    justifyContent: 'center',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: TOPBAR_LINE,
  },
  topBarBack: {
    position: 'absolute',
    left: 16,
    top: 20,
    width: 24,
    height: 24,
  },
  topBarTitle: {
    fontFamily: P_MED,
    fontSize: 18,
    lineHeight: 27,
    color: INK,
  },
  profileName: {
    fontFamily: P_SEMI,
    fontSize: 18,
    lineHeight: 27,
    color: INK,
    textAlign: 'center',
    marginTop: 24,
  },
  profileDistance: {
    fontFamily: P_REG,
    fontSize: 18,
    lineHeight: 27,
    color: INK,
    textAlign: 'center',
    marginTop: 8,
  },
  statsRow: {
    flexDirection: 'row',
    marginTop: 8,
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontFamily: P_SEMI,
    fontSize: 32,
    lineHeight: 48,
    color: INK,
    textAlign: 'center',
  },
  statLabel: {
    fontFamily: P_REG,
    fontSize: 14,
    lineHeight: 21,
    color: GRAY,
    textAlign: 'center',
  },
  statLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewsHeading: {
    fontFamily: P_MED,
    fontSize: 14,
    lineHeight: 21,
    color: INK,
    marginTop: 24,
    marginHorizontal: 24,
  },
  reviewBlock: {
    marginTop: 16,
    marginBottom: 8, // review blocks sit 24px apart (16 + 8)
    marginHorizontal: 24,
  },
  reviewTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  reviewAuthor: {
    fontFamily: P_MED,
    fontSize: 14,
    lineHeight: 21,
    color: INK,
  },
  reviewBody: {
    fontFamily: P_REG,
    fontSize: 14,
    lineHeight: 22,
    color: GRAY,
    marginTop: 8,
  },
  reviewDate: {
    fontFamily: P_REG,
    fontSize: 12,
    lineHeight: 18,
    color: INK,
    marginTop: 8,
  },

  // ---- Be A Favor Pal modal ------------------------------------------------
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingTop: 24,
    paddingBottom: 24,
    paddingHorizontal: 32,
    alignItems: 'center',
  },
  modalTitle: {
    fontFamily: P_MED,
    fontSize: 24,
    lineHeight: 36,
    color: INK,
    textAlign: 'center',
  },
  modalBody: {
    fontFamily: P_REG,
    fontSize: 16,
    lineHeight: 24,
    color: INK,
    textAlign: 'center',
    marginTop: 24,
    maxWidth: 287,
  },
  modalBodyBold: {
    fontFamily: P_MED,
    fontSize: 16,
    lineHeight: 24,
    color: INK,
    textAlign: 'center',
    marginTop: 24,
    maxWidth: 287,
  },
  switchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 244,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    paddingLeft: 24,
    marginTop: 26,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  switchPillText: {
    fontFamily: P_REG,
    fontSize: 12,
    lineHeight: 18,
    color: INK,
  },
  switchTrack: {
    position: 'absolute', // x182 in the 244-wide pill, per the Figma node
    left: 182,
    width: 38,
    height: 22,
    borderRadius: 11,
    backgroundColor: TRACK,
    justifyContent: 'flex-start',
    paddingHorizontal: 2,
  },
  switchKnob: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
});
