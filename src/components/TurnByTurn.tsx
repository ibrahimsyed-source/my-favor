import React from 'react';

// TurnByTurn — WEB/default stub. In-app Mapbox turn-by-turn navigation is
// native-only (@rnmapbox/navigation must never be imported in the web bundle),
// so the pal screens read TURN_BY_TURN_SUPPORTED and fall back to the maps-app
// deep-link ladder (openTurnByTurn) when it's false. Metro picks
// TurnByTurn.native.tsx on iOS/Android.
export const TURN_BY_TURN_SUPPORTED = false;

export interface TurnByTurnProps {
  /** Where the pal is right now — the route's first waypoint. */
  origin: { lat: number; lng: number };
  /** The favor location — the route's destination. */
  destination: { lat: number; lng: number; address?: string };
  /** The pal reached the favor location (final destination only). */
  onArrive?: () => void;
  /** The pal tapped the navigation UI's own end-trip button. */
  onCancel?: () => void;
  /** Route request or guidance start failed — caller falls back to a maps app. */
  onError?: (message: string) => void;
}

export const TurnByTurn: React.FC<TurnByTurnProps> = () => null;

export default TurnByTurn;
