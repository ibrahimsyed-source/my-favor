import React from 'react';
import Mapbox from '@rnmapbox/maps';
import { Navigation, RNNavigationView } from '@rnmapbox/navigation';
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

export const TurnByTurn: React.FC<TurnByTurnProps> = ({ origin, destination, onArrive, onCancel, onError }) => (
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
  />
);

export default TurnByTurn;
