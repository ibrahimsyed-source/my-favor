// Shared vertical drag for the v.2 bottom sheets — core Animated + PanResponder
// only (no dependencies; works on react-native-web). The hook owns the FEEL of
// the gesture: follow the finger (clamped, with rubber-band resistance), decide
// on release whether the drag was a decisive up/down, then ALWAYS spring the
// sheet back to 0 — content/snap changes are the host's job in onRelease; the
// sheet itself always returns home. Spread panHandlers ONLY on the grab area
// (the handle bar and its immediate row), never on a whole sheet, so inner
// ScrollViews/FlatLists are never fought over.

import { useRef } from 'react';
import {
  Animated, PanResponder, PanResponderInstance, GestureResponderHandlers,
} from 'react-native';

// A press that moves less than this is a TAP — it must fall through to the
// child touchables (tap-to-toggle etc. keep working underneath the drag).
const TAP_SLOP = 6;
// A fling faster than this (px/ms) is decisive even when the distance is short.
const FLING_VELOCITY = 0.5;
// Follow the finger 1:1 up to 60% of the clamp, then resist the overflow.
const SOFT_ZONE = 0.6;
const OVERFLOW_RESISTANCE = 0.35;

export function useSheetDrag(opts: {
  // Called when the finger lifts after a decisive drag; null = too small, spring home.
  onRelease: (direction: 'up' | 'down' | null) => void;
  // Visual clamp while following the finger (positive numbers, px). Defaults 80/120.
  maxUp?: number;
  maxDown?: number;
  // Decisive-drag threshold in px (default 48) OR velocity > 0.5 px/ms in that direction.
  threshold?: number;
  enabled?: boolean;
}): { y: Animated.Value; panHandlers: GestureResponderHandlers } {
  // The latest options live in a ref so the PanResponder (created exactly once)
  // never goes stale — and the hook stays StrictMode-safe: refs only, no state,
  // so a double-invoked render allocates nothing it keeps.
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const yRef = useRef(new Animated.Value(0));
  const responderRef = useRef<PanResponderInstance | null>(null);

  if (responderRef.current == null) {
    const springHome = () => {
      Animated.spring(yRef.current, { toValue: 0, useNativeDriver: true, friction: 9 }).start();
    };
    responderRef.current = PanResponder.create({
      // Never claim on touch-down: a press with |dy| < 6 must reach the child
      // touchables. Only a real, mostly-vertical move takes the responder —
      // and even then only while the host says the drag is enabled (handlers
      // are still returned when it isn't, so hosts can spread unconditionally).
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_evt, g) =>
        optsRef.current.enabled !== false &&
        Math.abs(g.dy) > TAP_SLOP &&
        Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_evt, g) => {
        const { maxUp = 80, maxDown = 120 } = optsRef.current;
        const limit = g.dy < 0 ? maxUp : maxDown;
        const soft = limit * SOFT_ZONE;
        const mag = Math.abs(g.dy);
        const followed =
          mag <= soft ? mag : Math.min(limit, soft + (mag - soft) * OVERFLOW_RESISTANCE);
        yRef.current.setValue(g.dy < 0 ? -followed : followed);
      },
      onPanResponderRelease: (_evt, g) => {
        const { onRelease, threshold = 48 } = optsRef.current;
        // A decisive fling wins over where the finger happened to end up
        // (drag down, change your mind, flick up → 'up').
        const byVelocity =
          g.vy <= -FLING_VELOCITY ? 'up' : g.vy >= FLING_VELOCITY ? 'down' : null;
        const byDistance =
          g.dy <= -threshold ? 'up' : g.dy >= threshold ? 'down' : null;
        onRelease(byVelocity ?? byDistance);
        springHome();
      },
      // Something above us took the touch (a modal, the navigator) — treat it
      // like a too-small drag and just go home.
      onPanResponderTerminate: () => springHome(),
      onPanResponderTerminationRequest: () => true,
    });
  }

  return { y: yRef.current, panHandlers: responderRef.current.panHandlers };
}
