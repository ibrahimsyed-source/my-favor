import React, { useContext, useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NavigationContainerRefContext } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { PalMarkerBadge } from './PalMarker';
import { useStore } from '../store';
import { haversineMiles, fmtMiles } from '../lib/geo';

// ActiveFavorPill — Uber-style persistent trip bar. While a favor is live, a
// floating pill rides above the tab bar on the main (tab) screens with the
// pal's live distance from the favor location — fed by the store's 4s
// active-favor poll, which already runs app-wide. Tapping opens the live map
// (FavorTracking for the member, Navigation / PalFavorInProgress for the
// assigned pal, Searching while still unmatched). It replaces the old
// per-dashboard "Resume active favor" cards.
//
// Deliberately an ALLOWLIST of the three tab screens: every other route is a
// flow with its own bottom-anchored CTAs (message composer, ACCEPT, payment
// confirm) that a floating overlay would cover and hijack.

const LIVE = ['requested', 'matched', 'enroute', 'arrived', 'in_progress'];
const TAB_ROUTES = new Set(['Home', 'Account', 'Activity']);
// V2TabBar vertical extent above the safe-area inset (paddingTop 10 + icon 42 +
// label 16 + indicator 13), so the pill sits just above it.
const TAB_BAR_H = 81;

const INK = '#0D0A0A';
const WHITE = '#FFFFFF';
const GREEN = '#5ABE64';
const P500 = 'Poppins_500Medium';

export const ActiveFavorPill: React.FC = () => {
  const s = useStore();
  const insets = useSafeAreaInsets();
  const nav = useContext(NavigationContainerRefContext);

  // Current (deepest) route name, tracked via the container ref — this
  // component is not a screen, so the screen-level navigation hooks don't apply.
  const [routeName, setRouteName] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!nav) return;
    const read = () => setRouteName(nav.getCurrentRoute()?.name);
    const unsub = nav.addListener('state', read);
    // The navigator mounts in the same pass as this component — read the
    // initial route on the next tick instead of relying on a state event.
    const t = setTimeout(read, 300);
    return () => {
      unsub();
      clearTimeout(t);
    };
  }, [nav]);

  const user = s.user;
  const fav = s.activeFavor;
  const status = fav?.status;
  const iAmPal = !!user && !!fav && fav.palId === user.id;
  const pal = s.activePal;
  const palFirst = pal?.firstName ?? 'Your Favor Pal';

  // Live distance pal → favor location, from the streamed GPS.
  const palLoc = fav?.palLocation;
  const miles =
    fav?.location && palLoc
      ? haversineMiles(palLoc.lat, palLoc.lng, fav.location.lat, fav.location.lng)
      : null;

  const isLive = !!status && LIVE.includes(status);
  // The store keeps a member's completed favor around until they rate it — the
  // pill is their way back to the rating sheet once they've left tracking.
  const awaitingRating = status === 'completed' && !iAmPal;
  const visible =
    !!user && !!fav && (isLive || awaitingRating) && TAB_ROUTES.has(routeName ?? 'Home');

  // Entrance: slide up + fade. (Hiding unmounts — no exit animation needed.)
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (visible) {
      Animated.spring(anim, { toValue: 1, friction: 9, tension: 60, useNativeDriver: true }).start();
    } else {
      anim.setValue(0);
    }
  }, [visible, anim]);

  // Soft pulse on the "live" dot while GPS is streaming.
  const pulse = useRef(new Animated.Value(0)).current;
  const hasLive = miles != null && (status === 'matched' || status === 'enroute' || status === 'in_progress');
  useEffect(() => {
    if (!visible || !hasLive) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [visible, hasLive, pulse]);

  if (!visible || !fav || !status) return null;

  let title: string;
  let sub: string;
  if (iAmPal) {
    if (status === 'arrived' || status === 'in_progress') {
      title = 'Favor in progress';
      sub = 'Tap to view or mark as done';
    } else {
      title = 'Head to the favor location';
      sub = fav.location?.address || fav.description || 'Tap for directions';
    }
  } else if (awaitingRating) {
    title = `${palFirst} completed your favor`;
    sub = 'Tap to rate your Pal';
  } else if (status === 'requested') {
    const pendingOffers = (fav.offers ?? []).filter((o) => o.status === 'pending');
    if (pendingOffers.length > 0) {
      title = `${pendingOffers.length} price offer${pendingOffers.length === 1 ? '' : 's'} received`;
      sub = 'Tap to review and respond';
    } else {
      title = 'Finding your Favor Pal…';
      sub = 'We’re blasting your favor to nearby pals';
    }
  } else if (status === 'arrived') {
    title = `${palFirst} has arrived`;
    sub = 'Tap to view your favor';
  } else if (status === 'in_progress') {
    title = `${palFirst} is doing your favor`;
    sub = miles != null ? `${fmtMiles(miles)} from the favor location` : 'Tap to view';
  } else {
    // matched / enroute
    title = `${palFirst} is on the way`;
    sub = miles != null ? `${fmtMiles(miles)} away` : 'Locating your Pal…';
  }

  const openLive = () => {
    if (!nav || !nav.isReady()) return;
    let dest: string;
    if (iAmPal) {
      dest = status === 'arrived' || status === 'in_progress' ? 'PalFavorInProgress' : 'Navigation';
    } else if (status === 'requested') {
      // No pal yet — the Searching screen owns the waiting (and scheduled)
      // states; FavorTracking would render a placeholder pal.
      dest = 'Searching';
    } else {
      dest = 'FavorTracking';
    }
    (nav as any).navigate(dest);
  };

  const bottom = TAB_BAR_H + Math.max(insets.bottom, 8) + 10;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        st.wrap,
        {
          bottom,
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
        },
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={openLive}
        accessibilityRole="button"
        accessibilityLabel={`${title}. ${sub}. Open live favor`}
        style={st.pill}
      >
        <PalMarkerBadge size={34} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={st.title} numberOfLines={1}>{title}</Text>
            {hasLive ? (
              <Animated.View
                style={[st.liveDot, { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }) }]}
              />
            ) : null}
          </View>
          <Text style={st.sub} numberOfLines={1}>{sub}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.6)" />
      </TouchableOpacity>
    </Animated.View>
  );
};

const st = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: INK,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  title: { fontFamily: P500, fontSize: 14, color: WHITE, flexShrink: 1 },
  sub: { fontFamily: P500, fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 1 },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: GREEN,
    marginLeft: 8,
  },
});

export default ActiveFavorPill;
