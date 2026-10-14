import React from 'react';

// MapPicker — WEB/default stub. The interactive drag-the-map location picker is
// native-only (react-native-maps must never be imported in the web bundle);
// ConfirmAddress renders the Figma static MapBackdrop on web instead, so this
// stub renders nothing. Metro picks MapPicker.native.tsx on iOS/Android.
export interface MapPickerProps {
  /** Where the map starts / is moved to programmatically (suggestion picked). */
  center: { lat: number; lng: number };
  /** Fired after the user stops panning, with the new map-center coordinate. */
  onCenterChange?: (c: { lat: number; lng: number }) => void;
  /** Avatar shown in the fixed center pin (falls back to the bundled one). */
  pinAvatar?: string;
}

export const MapPicker: React.FC<MapPickerProps> = () => null;

export default MapPicker;
