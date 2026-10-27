import React from 'react';
import { Image, StyleSheet, View } from 'react-native';

// PalMarkerBadge — the My Favor logo riding the Favor Pal's live map position
// (the brand's answer to Uber's car marker). Rendered inside a react-native-maps
// <Marker anchor={{x:0.5,y:0.5}}> by LiveMap.native / MapScene.native. Plain
// View + Image so this file is safe to import from web code too.
const LOGO = require('../../assets/img/logo.png');

export const PalMarkerBadge: React.FC<{ size?: number }> = ({ size = 44 }) => (
  <View style={[st.frame, { width: size, height: size, borderRadius: size * 0.3 }]}>
    <Image
      source={LOGO}
      style={{ width: size - 8, height: size - 8, borderRadius: (size - 8) * 0.28 }}
      accessibilityIgnoresInvertColors
    />
  </View>
);

const st = StyleSheet.create({
  frame: {
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    // Android map markers rasterize without shadow/elevation — the hairline
    // keeps the badge separated from the tiles on both platforms.
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(13,10,10,0.18)',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
});

export default PalMarkerBadge;
