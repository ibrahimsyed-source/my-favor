import React from 'react';
import { View, Image, TouchableOpacity, StyleSheet, Dimensions, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { MapPlaceholder, Txt, Avatar, Button, StaticMap } from '../components';
import { useTheme, tokens } from '../theme';
import { useStore } from '../store';
import { FAVOR_TIERS } from '../types';

const WIN_H = Dimensions.get('window').height;

// Tier illustrations (shared with the request flow).
const TIER_IMAGES: Record<'tiny' | 'small' | 'big' | 'huge', any> = {
  tiny: require('../../assets/img/request/tier-tiny.png'),
  small: require('../../assets/img/request/tier-small.png'),
  big: require('../../assets/img/request/tier-big.png'),
  huge: require('../../assets/img/request/tier-huge.png'),
};

const BRAND = '#ED1C24';
const MAP_BG = '#E7ECF1';        // light "map paper" — matches the light theme + Figma
const STREET = '#FFFFFF';        // side streets
const STREET_MAIN = '#F4E8C6';   // warm arterial roads
const LABEL = '#8A929C';

// Default map center (no live GPS yet; seed favors are around Austin, TX). When a
// Google Maps key is configured the real StaticMap renders here instead.
const HOME_CENTER = { lat: 30.2672, lng: -97.7431 };
// Scattered positions for the nearby-pal markers on the home map.
const PAL_POS = [
  { top: '16%', left: '18%' }, { top: '28%', left: '68%' },
  { top: '60%', left: '22%' }, { top: '70%', left: '66%' },
];

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

// Compact favor-size tile (row of four on the Home request card).
function TierTile({ tier, onPress }: { tier: 'tiny' | 'small' | 'big' | 'huge'; onPress: () => void }) {
  const { theme } = useTheme();
  const t = FAVOR_TIERS[tier];
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={[styles.tierTile, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <Image source={TIER_IMAGES[tier]} style={{ width: 42, height: 42 }} resizeMode="contain" />
      <Txt variant="caption" style={{ marginTop: 6, fontFamily: tokens.typography.label.fontFamily }} numberOfLines={1}>
        {t.label.replace(' Favor', '')}
      </Txt>
      <Txt variant="caption" color={theme.textSecondary}>${t.price}</Txt>
    </TouchableOpacity>
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

// ===========================================================================
// Home — request-a-favor dashboard: favor-size picker + location + live map.
// Matches the Figma mockup; one universal view for every account.
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

  const pals = s.pals;
  const homeAddress = s.user?.homeAddress || '2099 Woodvine Rd, Lorman';
  const tierKeys: Array<'tiny' | 'small' | 'big' | 'huge'> = ['tiny', 'small', 'big', 'huge'];
  const pickTier = (tier: 'tiny' | 'small' | 'big' | 'huge') => {
    s.setDraft({ tier, price: FAVOR_TIERS[tier].price });
    navigation.navigate('FavorDescription');
  };
  const negotiate = () => {
    s.setDraft({ tier: 'negotiate' });
    navigation.navigate('Negotiate');
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.background, paddingTop: insets.top }}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.navigate('SideDrawer')} style={styles.headerBtn} accessibilityRole="button" accessibilityLabel="Open menu">
          <Ionicons name="menu" size={24} color={theme.text} />
        </TouchableOpacity>
        <Txt variant="h6">My Favor</Txt>
        <TouchableOpacity onPress={() => navigation.navigate('Notifications')} style={styles.headerBtn} accessibilityRole="button" accessibilityLabel={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}>
          <Ionicons name="notifications-outline" size={22} color={theme.text} />
          {unread > 0 && <View style={styles.bellDot} />}
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
        {/* Resume the live favor, if any */}
        {active ? (
          <TouchableOpacity
            onPress={resumeActive}
            activeOpacity={0.9}
            style={[styles.resumeCard, { backgroundColor: theme.card, borderColor: theme.border }]}
            accessibilityRole="button"
            accessibilityLabel="Resume active favor"
          >
            <View style={styles.resumeIcon}><Ionicons name="navigate" size={18} color="#fff" /></View>
            <View style={{ flex: 1 }}>
              <Txt variant="caption" color={theme.textSecondary}>Resume active favor</Txt>
              <Txt variant="label" numberOfLines={1}>
                {active.description || (active.palId === s.user?.id ? 'Favor in progress' : 'Track your favor')}
              </Txt>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
          </TouchableOpacity>
        ) : null}

        {/* Favor-size picker */}
        <View style={{ paddingHorizontal: 20, paddingTop: 4 }}>
          <Txt variant="h3">How big is the favor?</Txt>
          <Txt variant="body" color={theme.textSecondary} style={{ marginTop: 6 }}>
            Choose the cost of favor based on the amount of effort required.
          </Txt>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
            {tierKeys.map((k) => <TierTile key={k} tier={k} onPress={() => pickTier(k)} />)}
          </View>
          <Button title="Negotiate your favor" variant="primary" uppercase={false} onPress={negotiate} style={{ marginTop: 16 }} />
        </View>

        {/* Location */}
        <View style={{ paddingHorizontal: 20, marginTop: 22 }}>
          <Txt variant="label">Location of your favor</Txt>
          <TouchableOpacity
            onPress={() => navigation.navigate('EditProfile')}
            activeOpacity={0.8}
            style={[styles.locationRow, { backgroundColor: theme.surfaceAlt }]}
          >
            <Ionicons name="location" size={20} color={theme.primary} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Txt variant="bodySm" numberOfLines={1}>{homeAddress}</Txt>
              <Txt variant="caption" color={theme.textSecondary}>Your default area · tap to change</Txt>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
          </TouchableOpacity>
        </View>

        {/* Live map with nearby Favor Pals */}
        <View style={{ height: 320, marginTop: 18, marginHorizontal: 20, borderRadius: 18, overflow: 'hidden' }}>
          <MapPlaceholder height={320} label="">
            {mapsKey ? (
              <StaticMap lat={HOME_CENTER.lat} lng={HOME_CENTER.lng} height={320} zoom={14} />
            ) : (
              <LightMap />
            )}
            {pals.slice(0, 4).map((p, i) => (
              <PalMarker key={p.id} uri={p.avatar} top={PAL_POS[i].top} left={PAL_POS[i].left} />
            ))}
            <RadiusPin avatar={s.user?.avatar} name={s.user?.firstName} />
          </MapPlaceholder>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingTop: 4, paddingBottom: 10,
  },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  resumeCard: {
    flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, marginBottom: 12,
    padding: 12, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, ...tokens.shadow.card,
  },
  resumeIcon: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: BRAND,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  tierTile: {
    flex: 1, alignItems: 'center', paddingVertical: 12, paddingHorizontal: 2,
    borderRadius: 14, borderWidth: StyleSheet.hairlineWidth,
  },
  locationRow: {
    flexDirection: 'row', alignItems: 'center', marginTop: 8, padding: 14, borderRadius: 14,
  },
  bellDot: {
    position: 'absolute', top: 6, right: 6, width: 9, height: 9, borderRadius: 5,
    backgroundColor: BRAND, borderWidth: 1.5, borderColor: '#FFFFFF',
  },
});
