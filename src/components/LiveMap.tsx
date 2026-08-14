import React from 'react';
import { StaticMap } from './index';

// A marker to drop on the map, in plain lat/lng.
export interface LiveMapMarker {
  lat: number;
  lng: number;
  label?: string;
}

export interface LiveMapProps {
  // Primary point the map centers on (the favor / pickup location).
  lat?: number;
  lng?: number;
  // Extra markers — e.g. the pal's live GPS on the tracking screen.
  markers?: LiveMapMarker[];
  height?: number;
  zoom?: number;
  label?: string;
  children?: React.ReactNode;
}

// LiveMap — interactive map for favor tracking / request pickup.
//
// This is the WEB (and default) implementation: react-native-maps has no web
// support, so on web we render the StaticMap (Google Static Maps image) fallback.
// The NATIVE implementation lives in LiveMap.native.tsx and renders a real,
// pannable react-native-maps MapView. Metro auto-selects the .native file on iOS/
// Android and this file everywhere else, so `Platform.OS === 'web'` never bundles
// the native module.
export const LiveMap: React.FC<LiveMapProps> = ({
  lat,
  lng,
  markers,
  height = 240,
  zoom,
  label,
  children,
}) => {
  // Map the first extra marker (the pal's live position) onto StaticMap's
  // pal-pin, which draws it in blue and auto-fits both pins.
  const extra = markers && markers.length > 0 ? markers[0] : undefined;
  return (
    <StaticMap
      lat={lat}
      lng={lng}
      palLat={extra?.lat}
      palLng={extra?.lng}
      height={height}
      zoom={zoom}
      label={label}
    >
      {children}
    </StaticMap>
  );
};

export default LiveMap;
