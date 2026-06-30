import React from 'react';
import { View, Image, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { MapPlaceholder, Txt, Avatar } from '../components';
import { useTheme, tokens, darkTokens } from '../theme';
import { useStore } from '../store';
import { UserStatus } from '../types';

const logo = require('../../assets/img/logo.png');
const WIN_H = Dimensions.get('window').height;

const BRAND = '#ED1C24';
const MAP_BG = '#222B36';
const BAR_BG = '#141A24';

// Availability presentation, driven by user.status (never hardcoded "online").
const STATUS_UI: Record<UserStatus, { label: string; color: string }> = {
  online: { label: "YOU'RE ONLINE", color: '#2ECC71' },
  invisible: { label: "YOU'RE INVISIBLE", color: '#9BA1A6' },
  offline: { label: "YOU'RE OFFLINE", color: '#B6BBC4' },
};

// ---------------------------------------------------------------------------
// Dark map backdrop — stylized stand-in roads/park/water over the placeholder.
// ---------------------------------------------------------------------------
function DarkMap() {
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: MAP_BG }]}>
      {/* water — top-right wedge */}
      <View
        style={{
          position: 'absolute', top: -60, right: -50, width: 220, height: 260,
          backgroundColor: '#28333E', borderRadius: 40, transform: [{ rotate: '20deg' }],
        }}
      />
      {/* water — bottom-right */}
      <View
        style={{
          position: 'absolute', bottom: -40, right: -40, width: 180, height: 200,
          backgroundColor: '#28333E', borderRadius: 36, transform: [{ rotate: '-12deg' }],
        }}
      />
      {/* park block */}
      <View
        style={{
          position: 'absolute', top: '22%', right: 28, width: 92, height: 66,
          backgroundColor: '#2C3A2E', borderRadius: 10,
        }}
      />
      {/* vertical roads */}
      {[0.18, 0.46, 0.72].map((x) => (
        <View
          key={`v${x}`}
          style={{
            position: 'absolute', top: 0, bottom: 0, left: `${x * 100}%`, width: 3,
            backgroundColor: 'rgba(255,255,255,0.07)',
          }}
        />
      ))}
      {/* horizontal roads */}
      {[0.2, 0.42, 0.64, 0.84].map((y) => (
        <View
          key={`h${y}`}
          style={{
            position: 'absolute', left: 0, right: 0, top: `${y * 100}%`, height: 3,
            backgroundColor: 'rgba(255,255,255,0.07)',
          }}
        />
      ))}
      {/* amber highway diagonal */}
      <View
        style={{
          position: 'absolute', top: -40, left: '60%', width: 7, height: WIN_H * 1.4,
          backgroundColor: 'rgba(199,142,76,0.45)', transform: [{ rotate: '16deg' }],
        }}
      />
      {/* a couple of muted POI markers */}
      <Poi top="34%" left="30%" />
      <Poi top="58%" left="66%" />
      <Poi top="74%" left="22%" />
    </View>
  );
}

function Poi({ top, left }: { top: string; left: string }) {
  return (
    <View style={{ position: 'absolute', top: top as any, left: left as any }}>
      <Ionicons name="location" size={16} color="rgba(255,189,0,0.65)" />
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

  const role = s.user?.role ?? 'member';
  const isPal = role === 'pal';
  const status = s.user?.status ?? 'offline';
  const statusUi = STATUS_UI[status];
  const active = s.activeFavor;
  const incoming = s.incomingFavors[0];
  // Only a genuinely-online pal is offered fresh work; while mid-favor or
  // offline/invisible we never surface an incoming request.
  const showIncoming = !active && status === 'online' && !!incoming;
  const unread = s.notifications.filter((n) => !n.read).length;

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
          <DarkMap />
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

        {/* App title (role is set at signup — no in-app switching) */}
        <View style={styles.pill}>
          <Txt variant="label" color="#1A1A1A">{isPal ? 'Favor Pal' : 'My Favor'}</Txt>
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
      <View style={{ position: 'absolute', left: 16, right: 16, bottom: 16, gap: 12 }}>
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
                {active.description || (isPal ? 'Favor in progress' : 'Track your favor')}
              </Txt>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
          </TouchableOpacity>
        ) : null}

        {/* Browse the full board of open favors to do — available to everyone,
            since any account can both request and fulfill favors. */}
        {!active && s.incomingFavors.length > 0 ? (
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => navigation.navigate('BrowseFavors')}
            accessibilityRole="button"
            accessibilityLabel={`Browse all ${s.incomingFavors.length} open favors`}
            style={styles.palCard}
          >
            <View style={styles.palIcon}>
              <Ionicons name="list" size={20} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Txt variant="caption" color={theme.textSecondary}>Open favors near you</Txt>
              <Txt variant="label" numberOfLines={1}>
                Browse all {s.incomingFavors.length} {s.incomingFavors.length === 1 ? 'request' : 'requests'}
              </Txt>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
          </TouchableOpacity>
        ) : null}

        {isPal ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => navigation.navigate('Home')}
              accessibilityRole="button"
              accessibilityLabel="Home"
              style={styles.homeBtn}
            >
              <Ionicons name="home" size={22} color="#FFFFFF" />
            </TouchableOpacity>
            {showIncoming ? (
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => navigation.navigate('PalFavorDetail', { favorId: incoming.id })}
                accessibilityRole="button"
                accessibilityLabel={`New favor request: ${incoming.description}, $${incoming.price}`}
                style={styles.palCard}
              >
                <View style={styles.palIcon}>
                  <Ionicons name="cube" size={20} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Txt variant="caption" color={theme.textSecondary}>New favor request</Txt>
                  <Txt variant="label" numberOfLines={1}>{incoming.description}</Txt>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Txt variant="label" color={BRAND}>${incoming.price}</Txt>
                  <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
                </View>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => navigation.navigate('SetStatus')}
                accessibilityRole="button"
                accessibilityLabel={`Availability: ${status}`}
                accessibilityHint="Change your availability status"
                style={[styles.bar, { flex: 1, flexDirection: 'row', gap: 10 }]}
              >
                <View style={[styles.statusDot, { backgroundColor: statusUi.color }]} />
                <Txt variant="button" color="#FFFFFF">{statusUi.label}</Txt>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={[styles.bar, { flexDirection: 'row', alignItems: 'center', paddingLeft: 8, paddingRight: 18 }]}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => navigation.navigate('Home')}
              accessibilityRole="button"
              accessibilityLabel="Home"
              style={styles.homeBtn}
            >
              <Ionicons name="home" size={22} color="#FFFFFF" />
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
        )}
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
