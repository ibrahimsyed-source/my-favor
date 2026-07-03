import React from 'react';
import {
  View, Text, Image, ScrollView, TouchableOpacity, StyleSheet, StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useFonts, Poppins_400Regular } from '@expo-google-fonts/poppins';
import { Txt, Avatar } from '../components';
import { useStore } from '../store';
import { FAVOR_TIERS } from '../types';
import { TIERS } from './request';

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

export function Home({ navigation }: any) {
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
    s.setRole('pal');
    navigation.navigate('BrowseFavors');
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
                <Text style={styles.tilePrice}>${FAVOR_TIERS[key].price.toFixed(2)}</Text>
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
  menuBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#221E1E',
    justifyContent: 'center',
    paddingLeft: 9,
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
