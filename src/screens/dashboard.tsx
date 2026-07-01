import React from 'react';
import { View, Image, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { MapPlaceholder, Txt, Avatar, StaticMap } from '../components';
import { useTheme, tokens } from '../theme';
import { useStore } from '../store';

const logo = require('../../assets/img/logo.png');
const WIN_H = Dimensions.get('window').height;

// User App v.2 — the dashboard/map screens are dark (navy map + red accents).
const BRAND = '#ED1C24';
const MAP_BG = '#232D37';        // dark "map paper"
const BAR_BG = '#141A24';        // dark action bar
const STREET = 'rgba(255,255,255,0.08)';
const STREET_MAIN = 'rgba(212,160,90,0.45)';
const LABEL = 'rgba(255,255,255,0.38)';

// Default map center (no live GPS yet). With a Google Maps key the real (dark)
// StaticMap renders here instead.
const HOME_CENTER = { lat: 30.2672, lng: -97.7431 };
const PAL_POS = [
  { top: '16%', left: '18%' }, { top: '28%', left: '68%' },
  { top: '60%', left: '22%' }, { top: '70%', left: '66%' },
];

// ---------------------------------------------------------------------------
// Dark street-map backdrop (v.2): streets, labels, park, water, POIs, markers.
// ---------------------------------------------------------------------------
function DarkMap() {
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: MAP_BG }]}>
      {/* water — right edge */}
      <View style={{ position: 'absolute', top: -40, right: -80, width: 210, height: WIN_H * 1.2, backgroundColor: '#1A2530', borderRadius: 70, transform: [{ rotate: '12deg' }] }} />
      {/* park */}
      <View style={{ position: 'absolute', top: '25%', right: 42, width: 96, height: 72, backgroundColor: '#28382C', borderRadius: 10 }} />
      {/* side-street grid */}
      {[0.14, 0.32, 0.5, 0.68, 0.86].map((x) => (
        <View key={`v${x}`} style={{ position: 'absolute', top: 0, bottom: 0, left: `${x * 100}%`, width: 3, backgroundColor: STREET }} />
      ))}
      {[0.12, 0.28, 0.44, 0.6, 0.76, 0.92].map((y) => (
        <View key={`h${y}`} style={{ position: 'absolute', left: 0, right: 0, top: `${y * 100}%`, height: 3, backgroundColor: STREET }} />
      ))}
      {/* main arterials */}
      <View style={{ position: 'absolute', top: 0, bottom: 0, left: '24%', width: 7, backgroundColor: STREET_MAIN }} />
      <View style={{ position: 'absolute', left: 0, right: 0, top: '44%', height: 7, backgroundColor: STREET_MAIN }} />
      {/* diagonal highway */}
      <View style={{ position: 'absolute', top: -60, left: '58%', width: 8, height: WIN_H * 1.5, backgroundColor: STREET_MAIN, transform: [{ rotate: '18deg' }] }} />
      {/* street-name labels */}
      <Txt variant="caption" color={LABEL} style={{ position: 'absolute', top: '42.5%', left: '5%', fontSize: 9 }}>W 5th St</Txt>
      <Txt variant="caption" color={LABEL} style={{ position: 'absolute', top: '13%', left: '52%', fontSize: 9 }}>N Dixie Hwy</Txt>
      <Txt variant="caption" color={LABEL} style={{ position: 'absolute', top: '74.5%', left: '30%', fontSize: 9 }}>Datura St</Txt>
      {/* POIs with labels */}
      <Poi top="30%" left="29%" label="Rocco's Tacos" />
      <Poi top="58%" left="63%" label="The Ben" />
      <Poi top="72%" left="18%" label="E.R. Bradley's" />
      <Poi top="20%" left="60%" />
      {/* numbered markers */}
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
      {label ? <Txt variant="caption" color="rgba(255,255,255,0.55)" style={{ marginLeft: 3, fontSize: 9 }}>{label}</Txt> : null}
    </View>
  );
}

function NumPin({ top, left, n }: { top: string; left: string; n: number }) {
  return (
    <View
      style={{
        position: 'absolute', top: top as any, left: left as any,
        width: 22, height: 22, borderRadius: 11, backgroundColor: '#2E3A44',
        borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.85)', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <Txt variant="caption" color="#FFFFFF" style={{ fontSize: 11, fontFamily: tokens.typography.label.fontFamily }}>{n}</Txt>
    </View>
  );
}

// Red avatar map marker (a nearby Favor Pal).
function PalMarker({ uri, top, left }: { uri?: string; top: string; left: string }) {
  return (
    <View style={{ position: 'absolute', top: top as any, left: left as any, alignItems: 'center' }}>
      <View
        style={{
          width: 36, height: 36, borderRadius: 18, backgroundColor: BRAND,
          borderWidth: 2, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
          ...tokens.shadow.card,
        }}
      >
        <Avatar uri={uri} size={30} />
      </View>
      <View style={{ width: 0, height: 0, marginTop: -1, borderLeftWidth: 5, borderRightWidth: 5, borderTopWidth: 7, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: BRAND }} />
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
// Home — dark map dashboard (User App v.2). One universal view: request a favor
// here, fulfill favors via the Browse tab.
// ===========================================================================
export function Home({ navigation }: any) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const s = useStore();

  const active = s.activeFavor;
  const unread = s.notifications.filter((n) => !n.read).length;
  const mapsKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY;
  const pals = s.pals;

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

  return (
    <View style={{ flex: 1, backgroundColor: MAP_BG }}>
      {/* MAP (full bleed) */}
      <View style={StyleSheet.absoluteFill}>
        <MapPlaceholder height={WIN_H} label="">
          {mapsKey ? (
            <StaticMap lat={HOME_CENTER.lat} lng={HOME_CENTER.lng} height={WIN_H} zoom={14} />
          ) : (
            <DarkMap />
          )}
          {pals.slice(0, 4).map((p, i) => (
            <PalMarker key={p.id} uri={p.avatar} top={PAL_POS[i].top} left={PAL_POS[i].left} />
          ))}
          <RadiusPin avatar={s.user?.avatar} name={s.user?.firstName} />
        </MapPlaceholder>
      </View>

      {/* TOP CONTROLS */}
      <View style={{ position: 'absolute', top: insets.top + 10, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 }}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => navigation.navigate('SideDrawer')}
          accessibilityRole="button"
          accessibilityLabel="Open menu"
          style={[styles.iconBtn, { left: 16 }]}
        >
          <Ionicons name="menu" size={24} color="#1A1A1A" />
        </TouchableOpacity>

        <View style={styles.pill}>
          <Txt variant="label" color="#1A1A1A">My Favor</Txt>
        </View>

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
        {active ? (
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={resumeActive}
            accessibilityRole="button"
            accessibilityLabel="Resume active favor"
            style={styles.resumeCard}
          >
            <View style={styles.resumeIcon}><Ionicons name="navigate" size={20} color="#FFFFFF" /></View>
            <View style={{ flex: 1 }}>
              <Txt variant="caption" color="rgba(255,255,255,0.6)">Resume active favor</Txt>
              <Txt variant="label" color="#FFFFFF" numberOfLines={1}>
                {active.description || (active.palId === s.user?.id ? 'Favor in progress' : 'Track your favor')}
              </Txt>
            </View>
            <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.5)" />
          </TouchableOpacity>
        ) : null}

        <View style={styles.bar}>
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
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 4,
  },
  bellDot: {
    position: 'absolute', top: 10, right: 11, width: 9, height: 9, borderRadius: 5,
    backgroundColor: BRAND, borderWidth: 1.5, borderColor: '#FFFFFF',
  },
  pill: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FFFFFF', borderRadius: tokens.radius.pill,
    paddingHorizontal: 22, height: 42,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 4,
  },
  resumeCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#1B222C', borderRadius: 18, paddingHorizontal: 12, height: 64,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 6,
  },
  resumeIcon: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: BRAND,
    alignItems: 'center', justifyContent: 'center',
  },
  bar: {
    height: 64, borderRadius: 18, backgroundColor: BAR_BG,
    flexDirection: 'row', alignItems: 'center', paddingLeft: 8, paddingRight: 18,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 6,
  },
  homeBtn: {
    width: 48, height: 48, borderRadius: 14, backgroundColor: BRAND,
    alignItems: 'center', justifyContent: 'center',
  },
});
