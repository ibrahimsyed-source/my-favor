import React from 'react';

// MapScene — WEB/default stub. Screens keep their Figma map art as the web
// backdrop (react-native-maps must never be imported in the web bundle), so
// this stub renders nothing and MAP_SCENE_SUPPORTED lets callers keep drawing
// the static art. Metro picks MapScene.native.tsx on iOS/Android, where the
// scene is a real, pannable MapView.
export const MAP_SCENE_SUPPORTED = false;

export interface MapSceneMarker {
  lat: number;
  lng: number;
  /**
   * pin     — plain red teardrop (favor / searching pins)
   * person  — red teardrop with the white person silhouette (nearby-pal pins)
   * price   — red rounded price tag with a pin tail (pal dashboard open favors)
   * avatar  — the user's avatar inside a red ring (your position)
   * car     — navy circle with a car icon (pal en-route position)
   * pal     — default blue map pin (live pal position on tracking)
   */
  kind?: 'pin' | 'person' | 'price' | 'avatar' | 'car' | 'pal';
  price?: number;
  avatarUri?: string;
  avatarName?: string;
  onPress?: () => void;
}

export interface MapSceneProps {
  /** Map centre. Omitted → the scene renders nothing (caller's art shows). */
  center?: { lat: number; lng: number };
  /** Google-style zoom level (each step halves the span). */
  zoom?: number;
  /** iOS: render Apple Maps in dark mode (provider/pal screens). */
  dark?: boolean;
  /** false → backdrop only: no pan/zoom and touches pass through. */
  interactive?: boolean;
  /** Soft radius circle around the centre, in meters. */
  radiusM?: number;
  /** Dimming overlay color (e.g. 'rgba(0,0,0,0.45)') for sheet backdrops. */
  scrim?: string;
  markers?: MapSceneMarker[];
  /** Fit these points in view on load (e.g. pal position + destination). */
  fit?: { lat: number; lng: number }[];
}

export const MapScene: React.FC<MapSceneProps> = () => null;

export default MapScene;
