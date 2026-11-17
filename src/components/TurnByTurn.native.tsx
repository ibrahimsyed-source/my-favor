import React from 'react';
import { StyleSheet, View } from 'react-native';
import Mapbox, { MarkerView } from '@rnmapbox/maps';
import { Navigation, RNNavigationView } from '@rnmapbox/navigation';
import { Avatar } from './index';
import type { TurnByTurnProps } from './TurnByTurn';

// TurnByTurn — NATIVE implementation: full-screen in-app turn-by-turn on the
// Mapbox Navigation SDK (RNNavigationView — maneuver banner, voice guidance,
// speed limit, trip progress, reroutes), so the pal never has to leave the app
// for Apple/Google Maps. Staying in the app also keeps the JS GPS broadcast to
// the member running the whole drive.
//
// Both SDKs are billed to the same public token, baked in at build time.
// Without a token the native module would error on the first route request, so
// TURN_BY_TURN_SUPPORTED gates every caller back onto the deep-link ladder.
const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN || '';
if (MAPBOX_TOKEN) {
  Mapbox.setAccessToken(MAPBOX_TOKEN);
  Navigation.setAccessToken(MAPBOX_TOKEN);
}

export const TURN_BY_TURN_SUPPORTED = !!MAPBOX_TOKEN;

export const TurnByTurn: React.FC<TurnByTurnProps> = ({
  origin, destination, destinationName, onArrive, onCancel, onError,
}) => (
  <RNNavigationView
    style={{ flex: 1 }}
    waypoints={[
      [origin.lng, origin.lat],
      { coordinate: [destination.lng, destination.lat], name: destination.address || 'Favor location' },
    ]}
    distanceUnit="imperial"
    appearance="auto"
    onArrive={({ isFinalDestination }) => {
      if (isFinalDestination) onArrive?.();
    }}
    onCancel={onCancel}
    onError={({ code, message }) => onError?.(message || code)}
  >
    {destinationName ? (
      // The member's initials bubble over the destination — same v.2
      // avatar-ring marker MapScene draws on the pal's booked/en-route maps.
      // allowOverlap so the SDK's own destination pin can't collapse it away.
      <MarkerView
        coordinate={[destination.lng, destination.lat]}
        anchor={{ x: 0.5, y: 0.5 }}
        allowOverlap
      >
        <View style={st.avatarRing}>
          <Avatar uri={undefined} size={33} name={destinationName} />
        </View>
      </MarkerView>
    ) : undefined}
  </RNNavigationView>
);

const st = StyleSheet.create({
  avatarRing: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#D40000',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default TurnByTurn;
