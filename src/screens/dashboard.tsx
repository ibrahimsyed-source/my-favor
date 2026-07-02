import React from 'react';
import { View, Image, TouchableOpacity, StyleSheet, LayoutChangeEvent, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Txt, Avatar } from '../components';
import { tokens } from '../theme';
import { useStore } from '../store';

// ---------------------------------------------------------------------------
// Dashboard Main v2 (Figma 100:8450) — full-bleed dark map, white menu button
// top-left, white "Switch to request a favor" pill with an off-state toggle,
// and the user's avatar in a red ring at the centre of a translucent red
// radius circle. The black HOME / ACCOUNT / ACTIVITY bar below is the tab bar.
// ---------------------------------------------------------------------------

// v.2 palette (sampled from the frame render)
const RED = '#D40000'; // v.2 pin ring / active-tab red
const INK = '#0D0A0A'; // near-black text + icon ink

// Dark West-Palm-Beach map exported from the frame (chrome patched out; the
// translucent red radius circle stays baked in around the centre pin spot).
const MAP_IMG = require('../../assets/img/dashboard/map-dark.png');
const IMG_W = 621; // asset px (1.5x of the 414pt mock)
const IMG_H = 1212;
const PIN_X = 310; // baked pin centre in asset px
const PIN_Y = 671.5;
const PIN_D = 60; // baked pin outer diameter in asset px (40pt)
const PIN_RING = 5.5; // baked red ring thickness in asset px (~3.7pt)

export function Home({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const s = useStore();

  const active = s.activeFavor;

  // Frame 100:8450 shows light (white) status-bar content over the dark map;
  // App.tsx sets a global dark style, so override it only while focused.
  useFocusEffect(
    React.useCallback(() => {
      StatusBar.setBarStyle('light-content');
      return () => StatusBar.setBarStyle('dark-content');
    }, [])
  );

  const [box, setBox] = React.useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) =>
    setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });

  // Project the baked pin point through the Image's cover transform so the
  // live avatar sits exactly on the map's red-ring marker at any screen size.
  const scale = box.w > 0 ? Math.max(box.w / IMG_W, box.h / IMG_H) : 0;
  const pin = {
    x: (box.w - IMG_W * scale) / 2 + PIN_X * scale,
    y: (box.h - IMG_H * scale) / 2 + PIN_Y * scale,
    d: PIN_D * scale,
    ring: PIN_RING * scale,
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

  return (
    <View style={{ flex: 1, backgroundColor: INK }} onLayout={onLayout}>
      {/* MAP (full bleed, red radius circle baked in) */}
      <Image
        source={MAP_IMG}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
        accessible={false}
      />

      {/* Your avatar pinned in the red ring at the centre of the radius circle */}
      {box.w > 0 && (
        <View
          pointerEvents="none"
          accessibilityRole="image"
          accessibilityLabel="Your location on the map"
          style={{
            position: 'absolute',
            left: pin.x - pin.d / 2,
            top: pin.y - pin.d / 2,
            width: pin.d,
            height: pin.d,
            borderRadius: pin.d / 2,
            backgroundColor: RED,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Avatar uri={s.user?.avatar} size={pin.d - pin.ring * 2} name={s.user?.firstName ?? '?'} />
        </View>
      )}

      {/* TOP CONTROLS — menu button + "Switch to request a favor" pill */}
      <View
        style={{
          position: 'absolute',
          top: insets.top + 19,
          left: 24,
          right: 24,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => navigation.navigate('SideDrawer')}
          accessibilityRole="button"
          accessibilityLabel="Open menu"
          style={styles.menuBtn}
        >
          {/* three left-aligned bars of decreasing width */}
          <View style={[styles.menuBar, { width: 25 }]} />
          <View style={[styles.menuBar, { width: 21, marginTop: 4.5 }]} />
          <View style={[styles.menuBar, { width: 16, marginTop: 4.5 }]} />
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => navigation.navigate('SelectFavor')}
          accessibilityRole="button"
          accessibilityLabel="Switch to request a favor"
          style={styles.pill}
        >
          <Txt style={styles.pillText}>Switch to request a favor</Txt>
          <View style={styles.track}>
            <View style={styles.thumb} />
          </View>
        </TouchableOpacity>
      </View>

      {/* RESUME ACTIVE FAVOR (only while a favor is live) */}
      {active ? (
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={resumeActive}
          accessibilityRole="button"
          accessibilityLabel="Resume active favor"
          style={[styles.resumeCard, { bottom: (insets.bottom || 0) + 16 }]}
        >
          <View style={styles.resumeIcon}>
            <Ionicons name="navigate" size={20} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Txt variant="caption" color="rgba(255,255,255,0.6)">Resume active favor</Txt>
            <Txt variant="label" color="#FFFFFF" numberOfLines={1}>
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
  menuBtn: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    paddingLeft: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 4,
  },
  menuBar: {
    height: 2.5,
    borderRadius: 2,
    backgroundColor: INK,
  },
  pill: {
    height: 40,
    borderRadius: tokens.radius.pill,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    // Measured off the 1.5x frame render: text ink starts 36px (24pt) from the
    // pill's left edge; the toggle track ends 36px (24pt) before the right edge.
    paddingLeft: 24,
    paddingRight: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 4,
  },
  pillText: {
    fontFamily: 'Poppins_500Medium',
    fontSize: 13,
    lineHeight: 18,
    color: INK,
    marginRight: 9, // ink-to-track gap measured at 14px (9.3pt) in the frame render
  },
  track: {
    width: 38,
    height: 21,
    borderRadius: 10.5,
    backgroundColor: '#D7D7D7',
    justifyContent: 'center',
  },
  thumb: {
    width: 21,
    height: 21,
    borderRadius: 10.5,
    backgroundColor: '#FFFFFF',
    borderWidth: 0.5,
    borderColor: 'rgba(0,0,0,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 1,
    elevation: 1,
  },
  resumeCard: {
    position: 'absolute',
    left: 24,
    right: 24,
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
