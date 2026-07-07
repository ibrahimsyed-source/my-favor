import React from 'react';
import { View, ActivityIndicator, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, tokens, AppTheme } from '../theme';
import { Screen, Txt, Button } from './index';

// ---------------------------------------------------------------------------
// Shared, themed state-component kit.
//
// One consistent, Figma-faithful language for Loading / Empty / Error+Retry
// (list primitives) and full-screen scenario states (404, maintenance, force-
// update, "no longer exists"…). Every piece renders correctly on BOTH themes:
//   • MEMBER (light):   #FFFFFF page, ink #0D0A0A text, BLACK primary CTA.
//   • PAL    (dark):    #0D0A0A page, white text, WHITE primary CTA.
// Pass `dark` to switch. The app ships a single light theme, so the dark
// variant intentionally overrides colors with the fixed pal palette (mirroring
// pal.tsx) instead of relying on useTheme() flipping.
//
// Poppins everywhere via <Txt>. Icons via @expo/vector-icons Ionicons. Buttons
// via the shared <Button> (radius-8, uppercase labels). Dependency-free.
// ---------------------------------------------------------------------------

type IoniconName = keyof typeof Ionicons.glyphMap;

// Fixed pal-dark palette (matches pal.tsx's pinned constants).
const DARK = {
  bg: '#0D0A0A', // page / provider ink
  circle: 'rgba(255,255,255,0.06)', // soft icon halo
  icon: '#B9B4B4', // secondary gray (v.2)
  title: '#FFFFFF',
  message: '#B9B4B4',
  border: 'rgba(255,255,255,0.28)', // outlined secondary button
} as const;

type StatePalette = {
  bg: string;
  circle: string;
  icon: string;
  title: string;
  message: string;
  spinner: string;
};

const paletteFor = (theme: AppTheme, dark?: boolean): StatePalette =>
  dark
    ? {
        bg: DARK.bg,
        circle: DARK.circle,
        icon: DARK.icon,
        title: DARK.title,
        message: DARK.message,
        spinner: theme.primary, // brand red reads on both themes
      }
    : {
        bg: theme.background,
        circle: theme.surfaceAlt,
        icon: theme.textTertiary,
        title: theme.text,
        message: theme.textSecondary,
        spinner: theme.primary,
      };

// ---------------------------------------------------------------------------
// Internal building blocks
// ---------------------------------------------------------------------------
const IconCircle: React.FC<{ bg: string; children: React.ReactNode }> = ({ bg, children }) => (
  <View style={[styles.circle, { backgroundColor: bg }]}>{children}</View>
);

// One action button that respects both themes:
//  • primary   → BLACK pill (light) / WHITE pill (dark)  [reuses <Button>]
//  • secondary → gray pill (light) / outlined-white pill (dark)
const ActionButton: React.FC<{
  label: string;
  onPress?: () => void;
  primary?: boolean;
  icon?: IoniconName;
  dark?: boolean;
}> = ({ label, onPress, primary, icon, dark }) => {
  if (primary) {
    return <Button title={label} icon={icon} variant={dark ? 'white' : 'primary'} onPress={onPress} />;
  }
  if (dark) {
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={[styles.outlineBtn, { borderColor: DARK.border }]}
      >
        <Txt variant="button" color="#FFFFFF" style={{ letterSpacing: 0.5 }}>
          {label.toUpperCase()}
        </Txt>
      </TouchableOpacity>
    );
  }
  return <Button title={label} variant="secondary" onPress={onPress} />;
};

// Shared centered stack (icon halo + title + message + optional actions). Used
// by every list-level state so spacing/typography stay identical everywhere.
const StateBody: React.FC<{
  icon: IoniconName;
  title: string;
  message?: string;
  p: StatePalette;
  dark?: boolean;
  iconSize?: number;
  children?: React.ReactNode; // action slot
}> = ({ icon, title, message, p, dark, iconSize = 36, children }) => (
  <View style={styles.center}>
    <IconCircle bg={p.circle}>
      <Ionicons name={icon} size={iconSize} color={p.icon} />
    </IconCircle>
    <Txt variant="h4" center color={p.title} style={{ marginTop: 20 }}>
      {title}
    </Txt>
    {!!message && (
      <Txt variant="bodySm" center color={p.message} style={{ marginTop: 8, lineHeight: 22 }}>
        {message}
      </Txt>
    )}
    {children ? <View style={styles.actionSlot}>{children}</View> : null}
  </View>
);

// ---------------------------------------------------------------------------
// EmptyState — centered Ionicon in a soft circle + title + message + optional CTA.
// ---------------------------------------------------------------------------
export const EmptyState: React.FC<{
  icon: IoniconName;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  dark?: boolean;
}> = ({ icon, title, message, actionLabel, onAction, dark }) => {
  const { theme } = useTheme();
  const p = paletteFor(theme, dark);
  return (
    <StateBody icon={icon} title={title} message={message} p={p} dark={dark}>
      {actionLabel && onAction ? (
        <ActionButton label={actionLabel} onPress={onAction} primary dark={dark} />
      ) : null}
    </StateBody>
  );
};

// ---------------------------------------------------------------------------
// ErrorState — load-failure state with a "Try again" button (5xx/timeout/offline).
// ---------------------------------------------------------------------------
export const ErrorState: React.FC<{
  title?: string;
  message?: string;
  onRetry?: () => void;
  dark?: boolean;
}> = ({
  title = "Something went wrong",
  message = "We couldn’t load this. Check your connection and try again.",
  onRetry,
  dark,
}) => {
  const { theme } = useTheme();
  const p = paletteFor(theme, dark);
  return (
    <StateBody icon="cloud-offline-outline" title={title} message={message} p={p} dark={dark}>
      {onRetry ? (
        <ActionButton label="Try again" onPress={onRetry} primary icon="refresh" dark={dark} />
      ) : null}
    </StateBody>
  );
};

// ---------------------------------------------------------------------------
// LoadingState — centered spinner (brand red) + optional label.
// ---------------------------------------------------------------------------
export const LoadingState: React.FC<{ label?: string; dark?: boolean }> = ({ label, dark }) => {
  const { theme } = useTheme();
  const p = paletteFor(theme, dark);
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={p.spinner} />
      {!!label && (
        <Txt variant="bodySm" center color={p.message} style={{ marginTop: 14 }}>
          {label}
        </Txt>
      )}
    </View>
  );
};

// ---------------------------------------------------------------------------
// ListState — the reusable list primitive backing every collection screen.
// Renders Loading / Empty / Error+Retry with sensible defaults matching the
// pal.tsx BrowseFavors gold standard (cloud-offline / file-tray Ionicons).
// Drop into FlatList's ListEmptyComponent (with contentContainerStyle
// flexGrow:1) and branch on the store's per-collection status flag.
// ---------------------------------------------------------------------------
export const ListState: React.FC<{
  kind: 'loading' | 'empty' | 'error';
  dark?: boolean;
  onRetry?: () => void;
  icon?: IoniconName;
  title?: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}> = ({ kind, dark, onRetry, icon, title, message, actionLabel, onAction }) => {
  if (kind === 'loading') {
    return <LoadingState dark={dark} label={message} />;
  }
  if (kind === 'error') {
    return (
      <ErrorState
        dark={dark}
        title={title ?? "Couldn’t load"}
        message={message ?? 'Check your connection and try again.'}
        onRetry={onRetry}
      />
    );
  }
  return (
    <EmptyState
      dark={dark}
      icon={icon ?? 'file-tray-outline'}
      title={title ?? 'Nothing here yet'}
      message={message}
      actionLabel={actionLabel}
      onAction={onAction}
    />
  );
};

// ---------------------------------------------------------------------------
// ResourceUnavailable — the shared "this no longer exists" detail primitive
// (favor / earning / pal / thread / active-favor gone, plus the 404 body).
// Icon + title + subtitle + one action, themed light or dark.
// ---------------------------------------------------------------------------
export const ResourceUnavailable: React.FC<{
  icon?: IoniconName;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  dark?: boolean;
}> = ({ icon = 'help-buoy-outline', title, message, actionLabel, onAction, dark }) => {
  const { theme } = useTheme();
  const p = paletteFor(theme, dark);
  return (
    <StateBody icon={icon} title={title} message={message} p={p} dark={dark}>
      {actionLabel && onAction ? (
        <ActionButton label={actionLabel} onPress={onAction} primary dark={dark} />
      ) : null}
    </StateBody>
  );
};

// ---------------------------------------------------------------------------
// FullScreenState — full-Screen wrapper for standalone scenario screens
// (maintenance, force-update, 404, account-suspended, active-favor recovery…).
// Icon + title + message centered, with a pinned primary + optional secondary
// action at the bottom. Reuses <Screen> for the member-light path; renders a
// self-contained dark SafeAreaView for the pal-dark path so the whole surface
// (incl. safe areas) is themed.
// ---------------------------------------------------------------------------
export const FullScreenState: React.FC<{
  icon?: IoniconName;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  dark?: boolean;
}> = ({
  icon = 'alert-circle-outline',
  title,
  message,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
  dark,
}) => {
  const { theme } = useTheme();
  const p = paletteFor(theme, dark);

  const body = (
    <View style={{ flex: 1 }}>
      <View style={styles.center}>
        <IconCircle bg={p.circle}>
          <Ionicons name={icon} size={44} color={p.icon} />
        </IconCircle>
        <Txt variant="h3" center color={p.title} style={{ marginTop: 24 }}>
          {title}
        </Txt>
        {!!message && (
          <Txt variant="body" center color={p.message} style={{ marginTop: 10, lineHeight: 24 }}>
            {message}
          </Txt>
        )}
      </View>
      {(actionLabel && onAction) || (secondaryLabel && onSecondary) ? (
        <View style={styles.footer}>
          {actionLabel && onAction ? (
            <ActionButton label={actionLabel} onPress={onAction} primary dark={dark} />
          ) : null}
          {secondaryLabel && onSecondary ? (
            <ActionButton label={secondaryLabel} onPress={onSecondary} dark={dark} />
          ) : null}
        </View>
      ) : null}
    </View>
  );

  if (dark) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: p.bg }} edges={['top', 'bottom']}>
        <View style={{ flex: 1, padding: tokens.spacing.lg }}>{body}</View>
      </SafeAreaView>
    );
  }
  return <Screen>{body}</Screen>;
};

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingVertical: 40 },
  circle: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  actionSlot: { marginTop: 24, alignSelf: 'stretch' },
  footer: { paddingBottom: 8, gap: 10 },
  outlineBtn: {
    height: 54,
    borderRadius: tokens.radius.sm,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
});
