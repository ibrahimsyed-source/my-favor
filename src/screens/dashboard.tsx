import React from 'react';
import {
  View, Text, Image, ScrollView, TouchableOpacity, StyleSheet, StatusBar,
  Modal, Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useFonts, Poppins_400Regular } from '@expo-google-fonts/poppins';
import { Txt, Avatar } from '../components';
import { useStore } from '../store';
import { FAVOR_TIERS } from '../types';
import { TIERS } from './request';
import { OpenFavorsList } from './pal';

// ---------------------------------------------------------------------------
// Home — "Dashboard Main v2" (Figma 1660:15783, User App v.2 › Dashboard row).
// 437x1232 frame: dark header (hamburger + "Switch to be a favor pal" pill,
// "How big is the favor?" + lead), white body with the four tier tiles,
// black NEGOTIATE YOUR FAVOR button, "Location of your favor" search field
// with the black NOW pill, Address block, then the light map with red
// favor-pal pins and the user's avatar pin inside a soft radius circle.
// The black HOME / ACCOUNT / ACTIVITY bar is the tab bar (navigation/index).
// ---------------------------------------------------------------------------

const INK = '#0D0A0A';       // near-black surfaces + text
const RED = '#D40000';       // v.2 red (pins, active tab)
const SUB_DARK = '#B9B4B4';  // lead paragraph on the dark header
const SUB = '#8F8F8F';       // secondary text on white
const FIELD_BG = '#F3F3F3';  // search field fill
const WHITE = '#FFFFFF';

const P400 = 'Poppins_400Regular';
const P500 = 'Poppins_500Medium';
const P600 = 'Poppins_600SemiBold';

const MAP_IMG = require('../../assets/img/request/map-light.png');
const PIN_AVATAR = require('../../assets/img/request/pin-avatar.png');

type TierKey = keyof typeof FAVOR_TIERS;
const TIER_KEYS: TierKey[] = ['tiny', 'small', 'big', 'huge'];

// Red favor-pal map pins (person silhouette in a red teardrop), placed like the
// frame's six pins — positions are fractions of the map area.
const PAL_PINS = [
  { x: 0.13, y: 0.08 }, { x: 0.72, y: 0.10 },
  { x: 0.13, y: 0.62 }, { x: 0.75, y: 0.55 },
  { x: 0.60, y: 0.78 }, { x: 0.87, y: 0.30 },
];

const PalPin: React.FC<{ x: number; y: number }> = ({ x, y }) => (
  <View pointerEvents="none" style={{ position: 'absolute', left: `${x * 100}%`, top: `${y * 100}%` }}>
    <Ionicons name="location" size={46} color={RED} />
    <Ionicons name="person" size={16} color={WHITE} style={{ position: 'absolute', top: 8, left: 15 }} />
  </View>
);

// ---------------------------------------------------------------------------
// Pal-mode Home — provider "Dashboard - Main v2" (dark): full-bleed dark map,
// white menu bars, "Switch to request a favor" pill, red price pins for open
// favors, the pal's avatar in a red ring at the centre of the radius circle,
// and the "Favor Blast" navy bottom sheet for the newest incoming request.
// ---------------------------------------------------------------------------
const NAVY = '#252A38';       // provider sheet/modal surface
const NAVY_SUB = '#B9B4B4';

const DARK_MAP = require('../../assets/img/dashboard/map-dark.png');
// Baked-in radius circle centre of the dark map export (asset px, 1.5x).
const DM = { w: 621, h: 1212, px: 310, py: 671.5 };

// Red rounded price tag with a pin tail (provider dashboard pins).
const PricePin: React.FC<{ price: number; x: number; y: number; onPress?: () => void }> = ({ price, x, y, onPress }) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={0.85}
    accessibilityRole="button"
    accessibilityLabel={`Open favor, $${price}`}
    style={{ position: 'absolute', left: `${x * 100}%`, top: `${y * 100}%`, alignItems: 'center' }}
  >
    <View style={palStyles.priceTag}>
      <Text style={palStyles.priceText}>${Math.round(price)}</Text>
    </View>
    <View style={palStyles.pinTail} />
  </TouchableOpacity>
);

const PIN_SPOTS = [
  { x: 0.16, y: 0.16 }, { x: 0.62, y: 0.12 }, { x: 0.12, y: 0.42 },
  { x: 0.72, y: 0.38 }, { x: 0.3, y: 0.62 }, { x: 0.66, y: 0.66 },
];

// ---------------------------------------------------------------------------
// Favor Member Modal v2 (provider #181:10516) — the navy dark twin of the user
// side's "Be A Favor Pal" promo (providers.tsx › BeAFavorPalModal). It gates
// PalHome's "Switch to request a favor" pill: tapping the pill opens this card
// first, and confirming its embedded pill flips the role to member so the dark
// provider map hands off to the light request-a-favor dashboard.
// ---------------------------------------------------------------------------
const FavorMemberModal: React.FC<{
  visible: boolean;
  onClose: () => void;
  onSwitch: () => void;
}> = ({ visible, onClose, onSwitch }) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <Pressable style={palStyles.memberBackdrop} onPress={onClose} accessibilityLabel="Dismiss">
      <Pressable style={palStyles.memberCard} onPress={() => undefined}>
        <Text style={palStyles.memberTitle}>Request A Favor</Text>
        <Text style={palStyles.memberBody}>
          Request favors from other Favor Pals! Notifications may include alerts,
          sounds, and icon badges. These can be configured in Settings.
        </Text>
        <TouchableOpacity
          style={palStyles.memberPill}
          activeOpacity={0.85}
          onPress={onSwitch}
          accessibilityRole="switch"
          accessibilityState={{ checked: false }}
          accessibilityLabel="Switch to request a favor"
        >
          <Text style={palStyles.memberPillText}>Switch to request a favor</Text>
          <View style={palStyles.memberTrack}>
            <View style={palStyles.memberKnob} />
          </View>
        </TouchableOpacity>
      </Pressable>
    </Pressable>
  </Modal>
);

function PalHome({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const s = useStore();

  const incoming = s.incomingFavors;
  // A favor the pal has already accepted. Navigation / PalFavorInProgress are
  // root-stack screens with no tab bar, so once a pal leaves them (Home tab,
  // drawer, Android back) there is otherwise no route back to the live job.
  const active = s.activeFavor;
  const resumeActive = () => {
    if (!active) return;
    const dest = active.status === 'arrived' || active.status === 'in_progress' ? 'PalFavorInProgress' : 'Navigation';
    navigation.navigate(dest);
  };
  // Default to the LIST view (closest favors first) so a pal sees every open
  // request the moment they open the app — not a single blast card at the
  // bottom. The Map view stays one tap away via the segmented toggle.
  const [viewMode, setViewMode] = React.useState<'list' | 'map'>('list');
  const [showMemberModal, setShowMemberModal] = React.useState(false);

  // Confirm from the Favor Member Modal — flip role in place; the role-aware
  // Home re-renders as the member request-a-favor dashboard.
  const switchToMember = () => {
    setShowMemberModal(false);
    s.setRole('member');
  };

  useFocusEffect(
    React.useCallback(() => {
      StatusBar.setBarStyle('light-content');
      void s.refreshIncoming();
      return () => StatusBar.setBarStyle('dark-content');
    }, []) // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Map-view geometry: fit the baked radius-circle centre of the dark map export
  // to the measured map box so the pal's avatar ring lands on it.
  const [box, setBox] = React.useState({ w: 0, h: 0 });
  const scale = box.w > 0 ? Math.max(box.w / DM.w, box.h / DM.h) : 0;
  const pin = {
    x: (box.w - DM.w * scale) / 2 + DM.px * scale,
    y: (box.h - DM.h * scale) / 2 + DM.py * scale,
  };

  return (
    <View style={{ flex: 1, backgroundColor: INK, paddingTop: insets.top + 12 }}>
      {/* top controls — white menu bars + "Switch to request a favor" pill */}
      <View style={[styles.headerRow, { paddingHorizontal: 23 }]}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => navigation.navigate('SideDrawer')}
          accessibilityRole="button"
          accessibilityLabel="Open menu"
          style={styles.menuBtn}
        >
          <View style={[styles.menuBar, { width: 22 }]} />
          <View style={[styles.menuBar, { width: 18, marginTop: 4 }]} />
          <View style={[styles.menuBar, { width: 14, marginTop: 4 }]} />
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => setShowMemberModal(true)}
          accessibilityRole="switch"
          accessibilityState={{ checked: false }}
          accessibilityLabel="Switch to request a favor"
          style={styles.pill}
        >
          <Text style={styles.pillText}>Switch to request a favor</Text>
          <View style={styles.track}>
            <View style={styles.thumb} />
          </View>
        </TouchableOpacity>
      </View>

      {/* Map / List segmented toggle + open count */}
      <View style={palStyles.segmentRow}>
        <View style={palStyles.segment}>
          {(['list', 'map'] as const).map((m) => {
            const selected = viewMode === m;
            return (
              <TouchableOpacity
                key={m}
                activeOpacity={0.85}
                onPress={() => setViewMode(m)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={m === 'list' ? 'List view' : 'Map view'}
                style={[palStyles.segmentBtn, selected && palStyles.segmentBtnActive]}
              >
                <Ionicons name={m === 'list' ? 'list' : 'map-outline'} size={16} color={selected ? INK : WHITE} />
                <Text style={[palStyles.segmentText, selected && palStyles.segmentTextActive]}>
                  {m === 'list' ? 'List' : 'Map'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={palStyles.openCount}>
          {incoming.length} open {incoming.length === 1 ? 'favor' : 'favors'}
        </Text>
      </View>

      {viewMode === 'list' ? (
        // Default: full sortable/filterable list, nearest first.
        <OpenFavorsList
          navigation={navigation}
          defaultSort="close"
          onItemPress={(favorId) => navigation.navigate('PalFavorDetail', { favorId })}
        />
      ) : (
        <View
          style={{ flex: 1 }}
          onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
        >
          <Image source={DARK_MAP} style={StyleSheet.absoluteFill} resizeMode="cover" accessible={false} />

          {/* the pal's avatar inside the baked red ring */}
          {box.w > 0 && (
            <View pointerEvents="none" style={[palStyles.avatarRing, { left: pin.x - 20, top: pin.y - 20 }]}>
              <Avatar uri={s.user?.avatar} size={33} name={s.user?.firstName ?? '?'} />
            </View>
          )}

          {/* open favors as red price pins — tap to view + accept */}
          {incoming.slice(0, PIN_SPOTS.length).map((f, i) => (
            <PricePin
              key={f.id}
              price={f.price}
              x={PIN_SPOTS[i].x}
              y={PIN_SPOTS[i].y}
              onPress={() => navigation.navigate('PalFavorDetail', { favorId: f.id })}
            />
          ))}

          {incoming.length === 0 && (
            <View pointerEvents="none" style={palStyles.mapEmpty}>
              <Text style={palStyles.mapEmptyText}>No open favors nearby right now.</Text>
            </View>
          )}
        </View>
      )}

      {/* Resume the pal's in-progress favor — the only route back to the live
          Navigation / Mark-as-done screens once they've left them. */}
      {active ? (
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={resumeActive}
          accessibilityRole="button"
          accessibilityLabel="Resume active favor"
          style={[palStyles.resumeCard, { bottom: insets.bottom + 16 }]}
        >
          <View style={palStyles.resumeIcon}>
            <Ionicons name="navigate" size={20} color={WHITE} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={palStyles.resumeCaption}>Resume active favor</Text>
            <Text style={palStyles.resumeTitle} numberOfLines={1}>
              {active.description || 'Favor in progress'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.6)" />
        </TouchableOpacity>
      ) : null}

      {/* Favor Member Modal v2 — gates the "Switch to request a favor" pill */}
      <FavorMemberModal
        visible={showMemberModal}
        onClose={() => setShowMemberModal(false)}
        onSwitch={switchToMember}
      />
    </View>
  );
}

const palStyles = StyleSheet.create({
  priceTag: {
    minWidth: 38,
    height: 26,
    borderRadius: 6,
    backgroundColor: RED,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  priceText: { fontFamily: P500, fontSize: 12, color: WHITE },
  pinTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: RED,
  },
  avatarRing: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: RED,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Map / List segmented toggle (pal Home).
  segmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 23,
    marginTop: 14,
    marginBottom: 2,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 10,
    padding: 3,
  },
  segmentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  segmentBtnActive: { backgroundColor: WHITE },
  segmentText: { fontFamily: P500, fontSize: 13, color: WHITE },
  segmentTextActive: { color: INK },
  openCount: { fontFamily: P400, fontSize: 13, color: NAVY_SUB },
  resumeCard: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: NAVY,
    borderRadius: 16,
    paddingHorizontal: 12,
    height: 64,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  resumeIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: RED,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resumeCaption: { fontFamily: P400, fontSize: 12, lineHeight: 16, color: 'rgba(255,255,255,0.6)' },
  resumeTitle: { fontFamily: P500, fontSize: 14, lineHeight: 20, color: WHITE },
  mapEmpty: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  mapEmptyText: {
    fontFamily: P500,
    fontSize: 14,
    color: WHITE,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    overflow: 'hidden',
  },

  // Favor Member Modal v2 (#181:10516) — navy promo card mirroring the user
  // side's Be A Favor Pal modal, with a white "Switch to request a favor" pill.
  memberBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  memberCard: {
    backgroundColor: NAVY,
    borderRadius: 16,
    paddingTop: 26,
    paddingBottom: 28,
    paddingHorizontal: 28,
    alignItems: 'center',
  },
  memberTitle: { fontFamily: P500, fontSize: 24, lineHeight: 36, color: WHITE, textAlign: 'center' },
  memberBody: {
    fontFamily: P400,
    fontSize: 15,
    lineHeight: 22,
    color: NAVY_SUB,
    textAlign: 'center',
    marginTop: 18,
    maxWidth: 287,
  },
  memberPill: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 244,
    height: 40,
    borderRadius: 20,
    backgroundColor: WHITE,
    paddingLeft: 20,
    marginTop: 26,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  memberPillText: { fontFamily: P400, fontSize: 12, lineHeight: 18, color: INK },
  memberTrack: {
    position: 'absolute',
    left: 182,
    width: 38,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#D7D7D7',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  memberKnob: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: WHITE,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
});

// Home is role-aware: members get the request-a-favor dashboard (1660:15783),
// pals get the dark provider map (provider Dashboard - Main v2). The switch
// pills flip s.setRole, which re-renders the other home in place.
export function Home(props: any) {
  const s = useStore();
  return s.user?.role === 'pal' ? <PalHome {...props} /> : <MemberHome {...props} />;
}

function MemberHome({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const s = useStore();
  const [fontsLoaded] = useFonts({ Poppins_400Regular });

  const active = s.activeFavor;
  const address = s.draftFavor?.location?.address ?? s.user?.homeAddress ?? '2099 Woodvine Rd, Lorman…';

  // Dark header → light status-bar content while this screen is focused.
  useFocusEffect(
    React.useCallback(() => {
      StatusBar.setBarStyle('light-content');
      return () => StatusBar.setBarStyle('dark-content');
    }, [])
  );

  const pickTier = (tier: TierKey) => {
    s.setDraft({ tier, price: FAVOR_TIERS[tier].price });
    navigation.navigate('FavorDescription');
  };

  const switchToPal = () => {
    // A pal must pass vetting before they can work. If not yet verified, send
    // them through Driver Information instead of into pal mode.
    if (!s.user?.palVerified) { navigation.navigate('Vetting'); return; }
    // Flips Home into the provider dashboard in place (design toggle metaphor).
    s.setRole('pal');
  };

  const resumeActive = () => {
    if (!active) return;
    const iAmPal = active.palId === s.user?.id;
    if (iAmPal) {
      const dest = active.status === 'arrived' || active.status === 'in_progress' ? 'PalFavorInProgress' : 'Navigation';
      navigation.navigate(dest);
    } else {
      navigation.navigate('FavorTracking');
    }
  };

  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: INK }} />;

  return (
    <View style={{ flex: 1, backgroundColor: WHITE }}>
      <ScrollView bounces={false} showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }}>
        {/* ---- DARK HEADER ---------------------------------------------- */}
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <View style={styles.headerRow}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => navigation.navigate('SideDrawer')}
              accessibilityRole="button"
              accessibilityLabel="Open menu"
              style={styles.menuBtn}
            >
              <View style={[styles.menuBar, { width: 22 }]} />
              <View style={[styles.menuBar, { width: 18, marginTop: 4 }]} />
              <View style={[styles.menuBar, { width: 14, marginTop: 4 }]} />
            </TouchableOpacity>

            {/* "Switch to be a favor pal" — white pill, off toggle */}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={switchToPal}
              accessibilityRole="switch"
              accessibilityState={{ checked: false }}
              accessibilityLabel="Switch to be a favor pal"
              style={styles.pill}
            >
              <Text style={styles.pillText}>Switch to be a favor pal</Text>
              <View style={styles.track}>
                <View style={styles.thumb} />
              </View>
            </TouchableOpacity>
          </View>

          <Text style={styles.h1}>How big is the favor?</Text>
          <Text style={styles.lead}>
            Choose the cost of favor based on the amount of effort required.
          </Text>
        </View>

        {/* ---- TIER TILES ------------------------------------------------ */}
        <View style={styles.tileRow}>
          {TIER_KEYS.map((key) => {
            const t = TIERS[key];
            return (
              <TouchableOpacity
                key={key}
                activeOpacity={0.85}
                onPress={() => pickTier(key)}
                accessibilityRole="button"
                accessibilityLabel={`${FAVOR_TIERS[key].label}, $${FAVOR_TIERS[key].price.toFixed(2)}`}
                style={styles.tile}
              >
                <View style={styles.tileImgBox}>
                  <Image
                    source={t.img}
                    style={{ position: 'absolute', left: t.dx, top: t.dy, width: t.w, height: t.h, opacity: 0.9 }}
                    resizeMode="stretch"
                  />
                </View>
                <Text style={styles.tileName}>{FAVOR_TIERS[key].label.replace(' Favor', '')}</Text>
                <Text style={styles.tilePrice}>${FAVOR_TIERS[key].price}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ---- NEGOTIATE ------------------------------------------------- */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => navigation.navigate('Negotiate')}
          accessibilityRole="button"
          style={styles.negotiateBtn}
        >
          <Text style={styles.negotiateText}>NEGOTIATE YOUR FAVOR</Text>
        </TouchableOpacity>

        {/* ---- LOCATION -------------------------------------------------- */}
        <Text style={styles.locationLabel}>Location of your favor</Text>

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => navigation.navigate('ConfirmAddress')}
          accessibilityRole="button"
          accessibilityLabel="Where to?"
          style={styles.searchField}
        >
          <Ionicons name="search" size={18} color={SUB} />
          <Text style={styles.searchPlaceholder}>Where to?</Text>
          <View style={styles.nowPill}>
            <Ionicons name="time-outline" size={13} color={WHITE} />
            <Text style={styles.nowText}>NOW</Text>
            <Ionicons name="chevron-down" size={14} color={WHITE} />
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => navigation.navigate('ConfirmAddress')}
          accessibilityRole="button"
          accessibilityLabel={`Address: ${address}`}
          style={styles.addressRow}
        >
          <Ionicons name="location-sharp" size={22} color={INK} style={{ marginTop: 2 }} />
          <View style={{ marginLeft: 12, flex: 1 }}>
            <Text style={styles.addressLabel}>Address</Text>
            <Text style={styles.addressText} numberOfLines={1}>{address}</Text>
          </View>
        </TouchableOpacity>

        {/* ---- MAP ------------------------------------------------------- */}
        <View style={styles.mapBox}>
          <Image source={MAP_IMG} style={StyleSheet.absoluteFill} resizeMode="cover" accessible={false} />
          {/* soft radius circle around the user */}
          <View pointerEvents="none" style={styles.radius} />
          {PAL_PINS.map((p, i) => <PalPin key={i} x={p.x} y={p.y} />)}
          {/* the user's avatar pin at the circle centre */}
          <View pointerEvents="none" style={styles.avatarPin} accessibilityLabel="Your location on the map">
            {s.user?.avatar ? (
              <Avatar uri={s.user.avatar} size={26} name={s.user?.firstName ?? '?'} />
            ) : (
              <Image source={PIN_AVATAR} style={{ width: 30, height: 30, borderRadius: 15 }} />
            )}
          </View>
        </View>
      </ScrollView>

      {/* RESUME ACTIVE FAVOR (app addition — only while a favor is live) */}
      {active ? (
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={resumeActive}
          accessibilityRole="button"
          accessibilityLabel="Resume active favor"
          style={styles.resumeCard}
        >
          <View style={styles.resumeIcon}>
            <Ionicons name="navigate" size={20} color={WHITE} />
          </View>
          <View style={{ flex: 1 }}>
            <Txt variant="caption" color="rgba(255,255,255,0.6)">Resume active favor</Txt>
            <Txt variant="label" color={WHITE} numberOfLines={1}>
              {active.description || (active.palId === s.user?.id ? 'Favor in progress' : 'Track your favor')}
            </Txt>
          </View>
          <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.5)" />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Dark header block
  header: {
    backgroundColor: INK,
    paddingHorizontal: 23,
    paddingBottom: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  // Frame 1660:15783: plain white bars on the dark header — no tile behind.
  menuBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  menuBar: { height: 2.5, borderRadius: 2, backgroundColor: WHITE },
  pill: {
    height: 36,
    borderRadius: 18,
    backgroundColor: WHITE,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 6,
  },
  pillText: { fontFamily: P500, fontSize: 12, lineHeight: 16, color: INK, marginRight: 8 },
  track: {
    width: 34,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#D7D7D7',
    justifyContent: 'center',
  },
  thumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: WHITE,
    borderWidth: 0.5,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  h1: { fontFamily: P600, fontSize: 24, lineHeight: 34, color: WHITE, marginTop: 26 },
  lead: { fontFamily: P400, fontSize: 13, lineHeight: 19, color: SUB_DARK, marginTop: 6, paddingRight: 30 },

  // Tier tiles
  tileRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 23,
    marginTop: 22,
  },
  tile: {
    width: 82,
    borderRadius: 8,
    backgroundColor: WHITE,
    alignItems: 'center',
    paddingTop: 6,
    paddingBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  tileImgBox: { width: 64, height: 64, borderRadius: 5, overflow: 'hidden', backgroundColor: WHITE },
  tileName: { fontFamily: P500, fontSize: 15, lineHeight: 22, color: INK, marginTop: 4 },
  tilePrice: { fontFamily: P400, fontSize: 11, lineHeight: 16, color: SUB },

  // Negotiate button (btn/solid/2/black)
  negotiateBtn: {
    height: 48,
    borderRadius: 8,
    backgroundColor: INK,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 23,
    marginTop: 22,
  },
  negotiateText: { fontFamily: P500, fontSize: 15, color: WHITE, letterSpacing: 0.3 },

  // Location section
  locationLabel: { fontFamily: P500, fontSize: 16, lineHeight: 24, color: INK, marginTop: 24, marginHorizontal: 23 },
  searchField: {
    height: 44,
    borderRadius: 8,
    backgroundColor: FIELD_BG,
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 23,
    marginTop: 12,
    paddingLeft: 14,
    paddingRight: 6,
  },
  searchPlaceholder: { fontFamily: P400, fontSize: 14, color: SUB, marginLeft: 10, flex: 1 },
  nowPill: {
    height: 32,
    borderRadius: 16,
    backgroundColor: INK,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    gap: 4,
  },
  nowText: { fontFamily: P500, fontSize: 12, color: WHITE },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginHorizontal: 23,
    marginTop: 18,
    marginBottom: 16,
  },
  addressLabel: { fontFamily: P400, fontSize: 14, lineHeight: 21, color: SUB },
  addressText: { fontFamily: P600, fontSize: 17, lineHeight: 25, color: INK, marginTop: 2 },

  // Map
  mapBox: { flexGrow: 1, minHeight: 300, backgroundColor: '#D8D8D8', overflow: 'hidden' },
  radius: {
    position: 'absolute',
    left: '18%',
    top: '12%',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(70,70,70,0.28)',
  },
  avatarPin: {
    position: 'absolute',
    left: '42%',
    top: '38%',
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: RED,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Resume-active floating card (kept from the previous build)
  resumeCard: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: INK,
    borderRadius: 16,
    paddingHorizontal: 12,
    height: 64,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  resumeIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: RED,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
