import React, { useState, useEffect, useCallback } from 'react';
import {
  View, ScrollView, StyleSheet, TouchableOpacity, Pressable, Modal, Image,
  useWindowDimensions, ActivityIndicator, Animated, LayoutAnimation, Platform, UIManager,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFonts, Poppins_400Regular, Poppins_400Regular_Italic } from '@expo-google-fonts/poppins';
import { Txt, Button, Avatar } from '../components';
import { MapScene, MAP_SCENE_SUPPORTED } from '../components/MapScene';
import { GEOCODE_FALLBACK } from '../lib/geocode';
import { useSheetDrag } from '../lib/useSheetDrag';
import { useStore } from '../store';
import { getPalReviewsApi, getPalsApi } from '../api/endpoints';
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

// The results sheet animates its snap (top) change with LayoutAnimation, which
// old-architecture Android gates behind this flag (a no-op everywhere else —
// Fabric enables it by default and react-native-web stubs it).
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

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

// Honest locality copy: the pals directory carries no live position (only
// city/state), so never fabricate a mileage. The old build showed "N miles
// away" derived from the LIST INDEX.
const palArea = (p: { city?: string; state?: string }) =>
  p.city ? `${p.city}${p.state ? `, ${p.state}` : ''}` : 'Nearby';

// The display fields the discovery screens read. GET /profile/pals returns a
// reduced pal shape, so default the stats (mirrors the store's own widening).
type DirPal = {
  id: string; firstName: string; lastName: string; avatar?: string; bio?: string;
  city?: string; state?: string; rating: number; totalFavors: number;
  yearsActive: number; reliability: number; positiveReviews: number;
};
const asDirPal = (p: any): DirPal => ({
  id: p.id ?? '',
  firstName: p.firstName ?? '',
  lastName: p.lastName ?? '',
  avatar: p.avatar,
  bio: p.bio,
  city: p.city,
  state: p.state,
  rating: p.rating ?? 0,
  totalFavors: p.totalFavors ?? 0,
  yearsActive: p.yearsActive ?? 0,
  reliability: p.reliability ?? 0,
  positiveReviews: p.positiveReviews ?? 0,
});

// Floating back control over the map — both discovery screens hide the stack
// header, so without it the only exits were the OS back gestures.
const MapBackButton: React.FC<{ onPress: () => void; top: number }> = ({ onPress, top }) => (
  <TouchableOpacity
    onPress={onPress}
    style={[styles.mapBack, { top }]}
    accessibilityRole="button"
    accessibilityLabel="Go back"
    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
  >
    <Ionicons name="arrow-back" size={22} color={INK} />
  </TouchableOpacity>
);

// Full-bleed map backdrop. Native: a REAL map of the favor location, dimmed
// like the v.2 frames (the design's gaussian blur has no RN equivalent — the
// scrim alone stands in for it, same trade as BeAFavorPalModal's backdrop).
// Web: the pre-composited blurred Figma export, exactly as the 414-wide frame.
const MapBackdrop: React.FC = () => {
  const { width } = useWindowDimensions();
  const { draftFavor, activeMemberFavor } = useStore();
  if (MAP_SCENE_SUPPORTED) {
    const loc = activeMemberFavor?.location ?? draftFavor?.location ?? GEOCODE_FALLBACK;
    return (
      <MapScene
        center={loc}
        zoom={15}
        interactive={false}
        scrim="rgba(0,0,0,0.5)"
        // Only the favor-location pin: pals have no live positions outside an
        // active favor, so decorative "nearby pal" pins would be fiction.
        markers={[{ lat: loc.lat, lng: loc.lng, kind: 'pin' }]}
      />
    );
  }
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
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} accessibilityViewIsModal>
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
  const { pals, setRole, user } = useStore();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [fontsLoaded] = useFonts({ Poppins_400Regular, Poppins_400Regular_Italic });
  const [showPalModal, setShowPalModal] = useState(false);
  // The store's `pals` is only loaded at login/role-switch, so the directory
  // refreshes on every focus — with honest loading/empty/error states instead
  // of a permanently blank row when the login-time fetch failed.
  const [list, setList] = useState<DirPal[]>(pals);
  const [dirState, setDirState] = useState<'loading' | 'ready' | 'error'>(pals.length ? 'ready' : 'loading');
  // Two snap positions: the content-sized half state and a taller one (top
  // 120). Drag the handle up/down to switch — the hook springs the sheet
  // itself home on release; the snap is the `top` change, animated as a
  // layout change (an Animated height can't start from the auto height).
  const [tall, setTall] = useState(false);
  // configureNext is a one-shot GLOBAL config: arm it only when the state will
  // actually change, or a no-op drag (up while already tall) leaves the pending
  // animation to latch onto the next unrelated layout pass (the 15s silent
  // directory refresh, a modal opening…).
  const snapTo = (next: boolean) => {
    setTall((cur) => {
      if (cur === next) return cur;
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      return next;
    });
  };
  const { y: sheetY, panHandlers: sheetPan } = useSheetDrag({
    onRelease: (direction) => {
      if (direction == null) return;
      snapTo(direction === 'up');
    },
  });

  const refresh = useCallback(async () => {
    // A previously-loaded list keeps showing while the refresh runs silently.
    setDirState((cur) => (cur === 'ready' ? cur : 'loading'));
    try {
      const { pals: fresh } = await getPalsApi();
      setList(fresh.map(asDirPal));
      setDirState('ready');
    } catch {
      setDirState((cur) => (cur === 'ready' ? cur : 'error'));
    }
  }, []);

  useEffect(() => {
    const unsub = navigation.addListener('focus', () => { void refresh(); });
    return unsub;
  }, [navigation, refresh]);

  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />;

  const s = width / FRAME_W; // design-px -> dp

  const switchToPal = () => {
    setShowPalModal(false);
    // Gate on vetting: unverified pals go to Driver Information first.
    if (!user?.palVerified) { navigation.navigate('Vetting'); return; }
    setRole('pal');
    navigation.navigate('Tabs');
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <MapBackdrop />

      {/* The blurred "Switch to be a favor pal" pill on the map opens the
          Be A Favor Pal modal (Favor Pal Modal v2). The pill graphic is baked
          into the web backdrop only — on the real native map there is nothing
          to tap, so the invisible hotspot is dropped there. */}
      {!MAP_SCENE_SUPPORTED && (
        <Pressable
          style={{ position: 'absolute', left: 147 * s, top: 63 * s, width: 244 * s, height: 40 * s }}
          onPress={() => setShowPalModal(true)}
          accessibilityRole="button"
          accessibilityLabel="Switch to be a favor pal"
        />
      )}

      <MapBackButton onPress={() => navigation.goBack()} top={insets.top + 12} />

      {/* Bottom sheet — follows a handle drag, then springs home while the
          snap (half <-> tall) lands via the animated `top` change. */}
      <Animated.View
        style={[
          styles.sheet,
          tall && styles.sheetTall,
          { paddingBottom: Math.max(insets.bottom, 34) + 23, transform: [{ translateY: sheetY }] },
        ]}
      >
        {/* Grab area = the handle bar and its immediate row (16 above / 12
            below the bar; the title's marginTop drops to 12 so the composed
            spacing still matches the original 16/24). Also a labeled TAP
            toggle — the tall snap must never be gesture-only (screen readers,
            switch access, keyboards). */}
        <View {...sheetPan} style={styles.handleGrab}>
          <TouchableOpacity
            onPress={() => snapTo(!tall)}
            accessibilityRole="button"
            accessibilityLabel={tall ? 'Shrink the pal list' : 'Expand the pal list'}
            accessibilityState={{ expanded: tall }}
            style={{ alignSelf: 'stretch', alignItems: 'center', paddingVertical: 4 }}
          >
            <View style={[styles.handle, { marginTop: 0 }]} />
          </TouchableOpacity>
        </View>
        <Txt style={{ ...styles.resultsTitle, marginTop: 12 }}>
          {'Click on a Favor Pal near you\nto do your favor!'}
        </Txt>
        <View style={styles.divider} />
        {dirState === 'loading' && list.length === 0 ? (
          <View style={styles.dirStateWrap}>
            <ActivityIndicator color={INK} />
          </View>
        ) : dirState === 'error' && list.length === 0 ? (
          <View style={styles.dirStateWrap}>
            <Txt style={styles.dirStateText}>
              We couldn’t load Favor Pals. Please check your connection and try again.
            </Txt>
            <Button
              title="TRY AGAIN"
              variant="primary"
              onPress={() => { void refresh(); }}
              style={{ marginTop: 16, alignSelf: 'center', paddingHorizontal: 40 }}
            />
          </View>
        ) : list.length === 0 ? (
          <View style={styles.dirStateWrap}>
            <Txt style={styles.dirStateText}>
              No Favor Pals are available right now. Check back soon!
            </Txt>
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.cardRow}
          >
            {list.map((pal) => (
              <TouchableOpacity
                key={pal.id}
                activeOpacity={0.85}
                style={styles.palCard}
                accessibilityRole="button"
                accessibilityLabel={`${pal.firstName} ${pal.lastName}, ${pal.rating > 0 ? `${pal.rating.toFixed(1)} stars` : 'New'}, ${palArea(pal)}. View details`}
                // Pass the freshly-fetched record too: a pal vetted after login
                // isn't in the store's list, and Detail must not 404 on them.
                onPress={() => navigation.navigate('ProviderDetail', { palId: pal.id, pal })}
              >
                <Avatar uri={pal.avatar} size={80} name={pal.firstName} />
                <Txt numberOfLines={1} style={styles.palName}>
                  {pal.firstName} {pal.lastName}
                </Txt>
                <View style={styles.rateRow}>
                  <Ionicons name="star" size={18} color={STAR} />
                  <Txt style={styles.rateText}>{pal.rating > 0 ? pal.rating.toFixed(1) : 'New'}</Txt>
                </View>
                <Txt style={styles.palDistance}>{palArea(pal)}</Txt>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </Animated.View>

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
  pal: { avatar?: string; firstName: string; lastName: string; rating: number; totalFavors: number; yearsActive: number; city?: string; state?: string };
  reviews: Review[];
  onBack: () => void;
  onBook: () => void;
  booking?: boolean;
}> = ({ pal, reviews, onBack, onBook, booking }) => {
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
        {/* Avatar / name / locality (no live pal position exists — never fake a mileage) */}
        <View style={{ alignItems: 'center', marginTop: 24 }}>
          <Avatar uri={pal.avatar} size={134} name={pal.firstName} />
          <Txt style={styles.profileName}>{pal.firstName} {pal.lastName}</Txt>
          <Txt style={styles.profileDistance}>{palArea(pal)}</Txt>
        </View>

        <View style={[styles.divider, { marginTop: 23 }]} />

        {/* Stats row: Total Favors | Rating | Years */}
        <View style={styles.statsRow}>
          <View style={styles.statCell}>
            <Txt style={styles.statValue}>{pal.totalFavors}</Txt>
            <Txt style={styles.statLabel}>Total Favors</Txt>
          </View>
          <View style={styles.statCell}>
            <Txt style={styles.statValue}>{pal.rating > 0 ? pal.rating.toFixed(1) : 'New'}</Txt>
            <View style={styles.statLabelRow}>
              <Ionicons name="star" size={18} color={STAR} />
              <Txt style={{ ...styles.statLabel, marginLeft: 4 }}>Rating</Txt>
            </View>
          </View>
          <View style={styles.statCell}>
            <Txt style={styles.statValue}>{pal.yearsActive > 0 ? pal.yearsActive : '—'}</Txt>
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
          loading={booking}
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
  const { pals, assignPal, activeMemberFavor, blockedUsers } = useStore();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [fontsLoaded] = useFonts({ Poppins_400Regular, Poppins_400Regular_Italic });
  // Strictly the routed pal — the old `?? pals[0]` silently showed (and could
  // BOOK) the wrong person when the id wasn't in the directory. The snapshot
  // ProviderResults passes covers pals fetched after login (same id, so it is
  // never a different person).
  const routedId = route?.params?.palId;
  const snapshot: DirPal | undefined =
    route?.params?.pal && route.params.pal.id === routedId ? route.params.pal : undefined;
  const pal = pals.find((p) => p.id === routedId) ?? snapshot;

  // Real reviews members have left for this pal (fetched from the backend).
  // Every hook lives ABOVE the early returns below — a render that crosses
  // them (pal dropping out of the directory, fonts flipping) must not change
  // the hook count and crash the whole app.
  const [palRevs, setPalRevs] = useState<Review[]>([]);
  const [showProfile, setShowProfile] = useState(false);
  const [bookError, setBookError] = useState('');
  const [booking, setBooking] = useState(false);
  const palId = pal?.id;
  useEffect(() => {
    if (!palId) return;
    let alive = true;
    getPalReviewsApi(palId).then(({ reviews }) => { if (alive) setPalRevs(reviews); }).catch(() => undefined);
    return () => { alive = false; };
  }, [palId]);

  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />;

  if (!pal) {
    return (
      <View style={{ flex: 1, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Txt style={styles.detailName}>This Favor Pal is unavailable</Txt>
        <Button title="GO BACK" variant="primary" onPress={() => navigation.goBack()} style={{ marginTop: 20, alignSelf: 'stretch' }} />
      </View>
    );
  }

  const s = width / FRAME_W;
  const quote = palRevs[0];

  // Bind the chosen pal to the active favor (core of the tracking flow), then
  // track. Server-confirmed: only navigate once the booking actually landed.
  // The failure copy is derived from what actually blocks the booking — never
  // "post a favor first" at a member who has one.
  const BOOKABLE = ['requested'];
  const ACTIVE_STATUSES = ['requested', 'matched', 'enroute', 'arrived', 'in_progress'];
  const book = async () => {
    if (booking) return; // in-flight guard — a second tap must not re-book
    const fail = (msg: string) => { setShowProfile(false); setBookError(msg); };
    if (blockedUsers.includes(pal.id)) {
      fail('You’ve blocked this pal. Unblock them from Settings if you’d like to book them.');
      return;
    }
    const f = activeMemberFavor;
    if (!f || !ACTIVE_STATUSES.includes(f.status)) {
      fail('You need an open favor request to book a pal — post a favor first, then book them from here.');
      return;
    }
    if (!BOOKABLE.includes(f.status)) {
      fail('Your current favor already has a pal. Finish or cancel it before booking someone else.');
      return;
    }
    setBooking(true);
    const ok = await assignPal(pal.id);
    setBooking(false);
    setShowProfile(false);
    if (ok) navigation.navigate('FavorTracking');
    else {
      setBookError(
        'The booking didn’t go through — your favor may have just been matched, or this pal may no longer be available. Please try again.',
      );
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <MapBackdrop />

      <MapBackButton onPress={() => navigation.goBack()} top={insets.top + 12} />

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
                  <Txt style={styles.detailRating}>{pal.rating > 0 ? pal.rating.toFixed(1) : 'New'}</Txt>
                </View>
              </View>
              <Txt style={styles.detailDistance}>{palArea(pal)}</Txt>
              {/* Reliability / positive-review stats only once they're real —
                  the server computes them from history; new pals show neither
                  rather than a fabricated "0%". */}
              {pal.reliability > 0 || pal.positiveReviews > 0 ? (
                <View style={{ marginTop: 8 }}>
                  {pal.reliability > 0 ? (
                    <View style={styles.statIconRow}>
                      <Ionicons name="thumbs-up" size={18} color={ICON_GRAY} />
                      <Txt style={styles.statIconText}>{pal.reliability}% Reliable</Txt>
                    </View>
                  ) : null}
                  {pal.positiveReviews > 0 ? (
                    <View style={[styles.statIconRow, { marginTop: 7 }]}>
                      <Ionicons name="star" size={18} color={ICON_GRAY} />
                      <Txt style={styles.statIconText}>{pal.positiveReviews}% Positive Reviews</Txt>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          </TouchableOpacity>

          <View style={[styles.divider, { marginTop: 16 }]} />

          {/* Bio */}
          <Txt style={styles.helpHeading}>How I can help?</Txt>
          <Txt style={styles.helpBody}>{pal.bio || 'This pal hasn’t written a bio yet.'}</Txt>

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
        accessibilityViewIsModal
      >
        <FavorPalProfile
          pal={pal}
          reviews={palRevs}
          onBack={() => setShowProfile(false)}
          onBook={book}
          booking={booking}
        />
      </Modal>

      {/* Booking failed — copy set by book() names the actual blocker. */}
      <Modal visible={!!bookError} transparent animationType="fade" onRequestClose={() => setBookError('')} accessibilityViewIsModal>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 24, width: '100%', maxWidth: 351 }}>
            <Txt style={{ fontSize: 17, textAlign: 'center' }}>Couldn't book this pal</Txt>
            <Txt style={{ fontSize: 14, textAlign: 'center', marginTop: 10, lineHeight: 20 }}>{bookError}</Txt>
            <TouchableOpacity
              onPress={() => setBookError('')}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={{ backgroundColor: '#0D0A0A', borderRadius: 8, height: 48, alignItems: 'center', justifyContent: 'center', marginTop: 18 }}
            >
              <Txt style={{ color: '#FFFFFF', fontSize: 15 }}>OK</Txt>
            </TouchableOpacity>
          </View>
        </View>
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
  // Results sheet only: the drag grab area around the handle bar, and the
  // taller of the two snap positions (the half state keeps the auto height).
  handleGrab: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 12,
  },
  sheetTall: {
    top: 120,
  },
  divider: {
    height: 1,
    backgroundColor: HAIRLINE,
    marginHorizontal: 23,
  },
  mapBack: {
    position: 'absolute',
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
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
  dirStateWrap: {
    paddingHorizontal: 32,
    paddingTop: 28,
    paddingBottom: 4,
    alignItems: 'center',
  },
  dirStateText: {
    fontFamily: P_REG,
    fontSize: 14,
    lineHeight: 21,
    color: GRAY,
    textAlign: 'center',
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
