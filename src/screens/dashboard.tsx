import React from 'react';
import { View, Image, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { MapPlaceholder, Txt, Avatar, StaticMap } from '../components';
import { useTheme, tokens, darkTokens } from '../theme';
import { useStore } from '../store';

const logo = require('../../assets/img/logo.png');
const WIN_H = Dimensions.get('window').height;

const BRAND = '#ED1C24';
const MAP_BG = '#E7ECF1';        // light "map paper" — matches the light theme + Figma
const BAR_BG = '#141A24';
const STREET = '#FFFFFF';        // side streets
const STREET_MAIN = '#F4E8C6';   // warm arterial roads
const LABEL = '#8A929C';

// Default map center (no live GPS yet; seed favors are around Austin, TX). When a
// Google Maps key is configured the real StaticMap renders here instead.
const HOME_CENTER = { lat: 30.2672, lng: -97.7431 };

// ---------------------------------------------------------------------------
// Light street-map backdrop — a realistic stand-in matching the Figma dashboard
// (streets, labels, park, water, POIs, numbered favor markers).
// ---------------------------------------------------------------------------
function LightMap() {
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: MAP_BG }]}>
      {/* water — right edge */}
      <View style={{ position: 'absolute', top: -40, right: -80, width: 210, height: WIN_H * 1.2, backgroundColor: '#C3DAEC', borderRadius: 70, transform: [{ rotate: '12deg' }] }} />
      {/* park block */}
      <View style={{ position: 'absolute', top: '25%', right: 42, width: 96, height: 72, backgroundColor: '#CBE4BE', borderRadius: 10 }} />
      {/* side-street grid */}
      {[0.14, 0.32, 0.5, 0.68, 0.86].map((x) => (
        <View key={`v${x}`} style={{ position: 'absolute', top: 0, bottom: 0, left: `${x * 100}%`, width: 4, backgroundColor: STREET }} />
      ))}
      {[0.12, 0.28, 0.44, 0.6, 0.76, 0.92].map((y) => (
        <View key={`h${y}`} style={{ position: 'absolute', left: 0, right: 0, top: `${y * 100}%`, height: 4, backgroundColor: STREET }} />
      ))}
      {/* main arterials (wider, warm) */}
      <View style={{ position: 'absolute', top: 0, bottom: 0, left: '24%', width: 8, backgroundColor: STREET_MAIN }} />
      <View style={{ position: 'absolute', left: 0, right: 0, top: '44%', height: 8, backgroundColor: STREET_MAIN }} />
      {/* diagonal highway */}
      <View style={{ position: 'absolute', top: -60, left: '58%', width: 9, height: WIN_H * 1.5, backgroundColor: STREET_MAIN, transform: [{ rotate: '18deg' }] }} />
      {/* street-name labels */}
      <Txt variant="caption" color={LABEL} style={{ position: 'absolute', top: '42.5%', left: '5%', fontSize: 9 }}>W 5th St</Txt>
      <Txt variant="caption" color={LABEL} style={{ position: 'absolute', top: '13%', left: '52%', fontSize: 9 }}>N Dixie Hwy</Txt>
      <Txt variant="caption" color={LABEL} style={{ position: 'absolute', top: '74.5%', left: '30%', fontSize: 9 }}>Datura St</Txt>
      {/* POIs with labels */}
      <Poi top="30%" left="29%" label="Rocco's Tacos" />
      <Poi top="58%" left="63%" label="The Ben" />
      <Poi top="72%" left="18%" label="E.R. Bradley's" />
      <Poi top="20%" left="60%" />
      {/* numbered favor / pal markers */}
      <NumPin top="18%" left="12%" n={5} />
      <NumPin top="52%" left="16%" n={4} />
      <NumPin top="38%" left="82%" n={2} />
      <NumPin top="82%" left="72%" n={1} />
    </View>
  );
}

function Poi({ top, left, label }: { top: string; left: string; label?: string }) {
  return (
    <View style={{ position: 'absolute', top: top as any, left: left as any, flexDirection: 'row', alignItems: 'center' }}>
      <Ionicons name="location" size={16} color="#F0A020" />
      {label ? <Txt variant="caption" color="#79818B" style={{ marginLeft: 3, fontSize: 9 }}>{label}</Txt> : null}
    </View>
  );
}

function NumPin({ top, left, n }: { top: string; left: string; n: number }) {
  return (
    <View
      style={{
        position: 'absolute', top: top as any, left: left as any,
        width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFFFFF',
        borderWidth: 1.5, borderColor: BRAND, alignItems: 'center', justifyContent: 'center',
        ...tokens.shadow.card,
      }}
    >
      <Txt variant="caption" color={BRAND} style={{ fontSize: 11, fontFamily: tokens.typography.label.fontFamily }}>{n}</Txt>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Member / Pal avatar pin inside a translucent red radius circle (map center).
// ---------------------------------------------------------------------------
function RadiusPin({ avatar, name }: { avatar?: string; name?: string }) {
  return (
    <View
      style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}
      accessibilityRole="image"
      accessibilityLabel="Your location on the map"
    >
      <View
        style={{
          width: 220, height: 220, borderRadius: 110,
          backgroundColor: 'rgba(237,28,36,0.16)', borderWidth: 1,
          borderColor: 'rgba(237,28,36,0.35)', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <View style={{ alignItems: 'center' }}>
          <View
            style={{
              // On the near-black map a #000 shadow renders nothing, so a subtle
              // light ring (not the shadow alone) is what lifts the pin off the map.
              width: 56, height: 56, borderRadius: 28, backgroundColor: BRAND,
              alignItems: 'center', justifyContent: 'center', ...tokens.shadow.card,
              borderWidth: 2, borderColor: 'rgba(255,255,255,0.22)',
            }}
          >
            <Avatar uri={avatar} size={48} name={name ?? '?'} />
          </View>
          <View
            style={{
              width: 0, height: 0, marginTop: -1,
              borderLeftWidth: 7, borderRightWidth: 7, borderTopWidth: 9,
              borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: BRAND,
            }}
          />
        </View>
      </View>
    </View>
  );
}

// ===========================================================================
// Home — full-bleed map dashboard (role-aware).
// ===========================================================================
export function Home({ navigation }: any) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const s = useStore();

  // One universal Home for every account: everyone can request a favor (here)
  // and fulfill favors (the Browse tab). No role-specific view.
  const active = s.activeFavor;
  const unread = s.notifications.filter((n) => !n.read).length;
  const mapsKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY;

  const resumeActive = () => {
    if (!active) return;
    // Route by the user's role ON THIS favor (a member can also accept and
    // fulfill someone else's favor), not by their global account role.
    const iAmPal = active.palId === s.user?.id;
    if (iAmPal) {
      const dest =
        active.status === 'arrived' || active.status === 'in_progress'
          ? 'PalFavorInProgress'
          : 'Navigation';
      navigation.navigate(dest);
    } else {
      navigation.navigate('FavorTracking');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: MAP_BG }}>
      {/* MAP (full bleed, under the status bar) */}
      <View style={StyleSheet.absoluteFill}>
        <MapPlaceholder height={WIN_H} label="">
          {mapsKey ? (
            <StaticMap lat={HOME_CENTER.lat} lng={HOME_CENTER.lng} height={WIN_H} zoom={14} />
          ) : (
            <LightMap />
          )}
          <RadiusPin avatar={s.user?.avatar} name={s.user?.firstName} />
        </MapPlaceholder>
      </View>

      {/* TOP CONTROLS */}
      <View
        style={{
          position: 'absolute', top: insets.top + 10, left: 0, right: 0,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16,
        }}
      >
        {/* hamburger -> SideDrawer */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => navigation.navigate('SideDrawer')}
          accessibilityRole="button"
          accessibilityLabel="Open menu"
          style={[styles.iconBtn, { left: 16 }]}
        >
          <Ionicons name="menu" size={24} color="#1A1A1A" />
        </TouchableOpacity>

        {/* App title — identical for everyone */}
        <View style={styles.pill}>
          <Txt variant="label" color="#1A1A1A">My Favor</Txt>
        </View>

        {/* notifications bell -> Notifications */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => navigation.navigate('Notifications')}
          accessibilityRole="button"
          accessibilityLabel={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
          style={[styles.iconBtn, { right: 16 }]}
        >
          <Ionicons name="notifications-outline" size={22} color="#1A1A1A" />
          {unread > 0 && <View style={styles.bellDot} />}
        </TouchableOpacity>
      </View>

      {/* BOTTOM BAR */}
      <View style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom || 16, gap: 12 }}>
        {/* Resume-active-favor card: returns the user into their live favor. */}
        {active ? (
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={resumeActive}
            accessibilityRole="button"
            accessibilityLabel="Resume active favor"
            style={styles.palCard}
          >
            <View style={styles.palIcon}>
              <Ionicons name="navigate" size={20} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Txt variant="caption" color={theme.textSecondary}>Resume active favor</Txt>
              <Txt variant="label" numberOfLines={1}>
                {active.description || (active.palId === s.user?.id ? 'Favor in progress' : 'Track your favor')}
              </Txt>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
          </TouchableOpacity>
        ) : null}

        {/* Identical for every account: Home + Request a Favor. Fulfilling favors
            lives in the Browse tab; availability is set from the side menu. */}
        <View style={[styles.bar, { flexDirection: 'row', alignItems: 'center', paddingLeft: 8, paddingRight: 18 }]}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => navigation.navigate('Browse')}
            accessibilityRole="button"
            accessibilityLabel="Browse favors to do"
            style={styles.homeBtn}
          >
            <Ionicons name="search" size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => navigation.navigate('SelectFavor')}
            accessibilityRole="button"
            accessibilityLabel="Request a favor"
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}
          >
            <Image source={logo} style={{ width: 22, height: 22, borderRadius: 5 }} resizeMode="contain" />
            <Txt variant="button" color="#FFFFFF" style={{ letterSpacing: 0.5 }}>REQUEST A FAVOR</Txt>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  iconBtn: {
    position: 'absolute',
    width: 46, height: 46, borderRadius: 14, backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.18, shadowRadius: 6, elevation: 4,
  },
  bellDot: {
    position: 'absolute', top: 10, right: 11, width: 9, height: 9, borderRadius: 5,
    backgroundColor: BRAND, borderWidth: 1.5, borderColor: '#FFFFFF',
  },
  pill: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FFFFFF', borderRadius: tokens.radius.pill,
    paddingHorizontal: 22, height: 42,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.18, shadowRadius: 6, elevation: 4,
  },
  bar: {
    height: 64, borderRadius: 18, backgroundColor: BAR_BG,
    alignItems: 'center', justifyContent: 'center',
    // #000 shadow is invisible on the dark map; a hairline top-light edge is
    // what actually reads as elevation here.
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 6,
  },
  statusDot: {
    width: 10, height: 10, borderRadius: 5,
  },
  homeBtn: {
    width: 48, height: 48, borderRadius: 14, backgroundColor: BRAND,
    alignItems: 'center', justifyContent: 'center',
  },
  palCard: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#FFFFFF', borderRadius: 18, paddingHorizontal: 12, height: 64,
    borderWidth: 1, borderColor: darkTokens.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 10, elevation: 6,
  },
  palIcon: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: BRAND,
    alignItems: 'center', justifyContent: 'center',
  },
});
