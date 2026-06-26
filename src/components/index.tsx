import React from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ViewStyle, TextStyle,
  ScrollView, Image, ActivityIndicator, KeyboardAvoidingView, Platform, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, tokens } from '../theme';

// ---------------------------------------------------------------------------
// Screen: safe-area wrapper with optional scroll + keyboard handling.
// ---------------------------------------------------------------------------
export const Screen: React.FC<{
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  style?: ViewStyle;
}> = ({ children, scroll, padded = true, style }) => {
  const { theme } = useTheme();
  const inner = (
    <View style={[{ flex: 1, padding: padded ? tokens.spacing.lg : 0 }, style]}>{children}</View>
  );
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {scroll ? (
          <ScrollView contentContainerStyle={{ flexGrow: 1, padding: padded ? tokens.spacing.lg : 0 }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        ) : (
          inner
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

// ---------------------------------------------------------------------------
// Text components
// ---------------------------------------------------------------------------
type TxtVariant = keyof typeof tokens.typography;
export const Txt: React.FC<{
  children: React.ReactNode;
  variant?: TxtVariant;
  color?: string;
  center?: boolean;
  style?: TextStyle;
  numberOfLines?: number;
}> = ({ children, variant = 'body', color, center, style, numberOfLines }) => {
  const { theme } = useTheme();
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[tokens.typography[variant], { color: color ?? theme.text, textAlign: center ? 'center' : 'left' }, style]}
    >
      {children}
    </Text>
  );
};

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------
// Button variants mirror the Figma kit:
//  primary   → black pill, white uppercase text (btn/solid/black)
//  secondary → light-gray pill, dark text (btn/solid/gray)
//  brand     → red pill, white text
//  white     → white pill w/ dark text (used on dark map sheets)
//  ghost     → outlined
export const Button: React.FC<{
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'brand' | 'white' | 'ghost' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  uppercase?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: ViewStyle;
}> = ({ title, onPress, variant = 'primary', disabled, loading, uppercase = true, icon, style }) => {
  const { theme } = useTheme();
  const variantBg = {
    primary: theme.cta,
    secondary: theme.secondaryBtn,
    brand: theme.primary,
    white: '#FFFFFF',
    ghost: 'transparent',
    danger: theme.danger,
  }[variant];
  const variantFg =
    variant === 'secondary' || variant === 'white'
      ? '#141414'
      : variant === 'ghost'
      ? theme.cta
      : '#FFFFFF';
  // Spec-correct disabled state: a flat light-gray pill with muted text (no opacity hacks).
  const isDisabled = !!disabled;
  const bg = isDisabled ? theme.secondaryBtn : variantBg;
  const fg = isDisabled ? theme.textTertiary : variantFg;
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      disabled={isDisabled || loading}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled || !!loading, busy: !!loading }}
      accessibilityLabel={title}
      style={[
        styles.btn,
        { backgroundColor: bg, borderWidth: variant === 'ghost' && !isDisabled ? 1.5 : 0, borderColor: theme.cta },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {icon && <Ionicons name={icon} size={18} color={fg} />}
          <Text style={[tokens.typography.button, { color: fg, letterSpacing: 0.5 }]}>
            {uppercase ? title.toUpperCase() : title}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

// ---------------------------------------------------------------------------
// TextField
// ---------------------------------------------------------------------------
export const Field: React.FC<{
  label?: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: any;
  autoCapitalize?: any;
  multiline?: boolean;
  maxLength?: number;
  icon?: keyof typeof Ionicons.glyphMap;
}> = ({ label, value, onChangeText, placeholder, secureTextEntry, keyboardType, autoCapitalize, multiline, maxLength, icon }) => {
  const { theme } = useTheme();
  return (
    <View style={{ marginBottom: tokens.spacing.base }}>
      {label && <Txt variant="label" style={{ marginBottom: 8 }}>{label}</Txt>}
      <View style={[styles.field, { backgroundColor: theme.inputBg }]}>
        {icon && <Ionicons name={icon} size={18} color={theme.textTertiary} style={{ marginRight: 8 }} />}
        <TextInput
          style={[{ flex: 1, color: theme.text, fontSize: 16, paddingVertical: multiline ? 8 : 0 }, multiline && { height: 100, textAlignVertical: 'top' }]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.textTertiary}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          multiline={multiline}
          maxLength={maxLength}
        />
      </View>
    </View>
  );
};

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------
export const Card: React.FC<{ children: React.ReactNode; style?: ViewStyle; onPress?: () => void }> = ({ children, style, onPress }) => {
  const { theme } = useTheme();
  const content = (
    <View style={[styles.card, tokens.shadow.card, { backgroundColor: theme.card, borderColor: theme.border }, style]}>{children}</View>
  );
  return onPress ? <TouchableOpacity activeOpacity={0.9} onPress={onPress}>{content}</TouchableOpacity> : content;
};

// ---------------------------------------------------------------------------
// Avatar
// ---------------------------------------------------------------------------
export const Avatar: React.FC<{ uri?: string; size?: number; name?: string }> = ({ uri, size = 48, name }) => {
  const { theme } = useTheme();
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: theme.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
      <Txt variant="h6" color={theme.textSecondary}>{name?.[0] ?? '?'}</Txt>
    </View>
  );
};

// ---------------------------------------------------------------------------
// StarRating (display + selectable)
// ---------------------------------------------------------------------------
export const StarRating: React.FC<{ value: number; size?: number; onChange?: (v: number) => void }> = ({ value, size = 20, onChange }) => {
  const { theme } = useTheme();
  return (
    <View
      style={{ flexDirection: 'row', gap: 2 }}
      accessibilityRole={onChange ? 'adjustable' : 'image'}
      accessibilityLabel={onChange ? 'Rating' : `Rated ${Math.round(value)} out of 5`}
      accessibilityValue={onChange ? { min: 0, max: 5, now: Math.round(value) } : undefined}
    >
      {[1, 2, 3, 4, 5].map((i) => {
        const filled = i <= Math.round(value);
        const star = <Ionicons name={filled ? 'star' : 'star-outline'} size={size} color={theme.star} />;
        return onChange ? (
          <TouchableOpacity key={i} onPress={() => onChange(i)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Rate ${i} star${i > 1 ? 's' : ''}`}>{star}</TouchableOpacity>
        ) : (
          <View key={i}>{star}</View>
        );
      })}
    </View>
  );
};

// ---------------------------------------------------------------------------
// TopBar
// ---------------------------------------------------------------------------
export const TopBar: React.FC<{
  title?: string;
  onBack?: () => void;
  right?: React.ReactNode;
}> = ({ title, onBack, right }) => {
  const { theme } = useTheme();
  return (
    <View style={[styles.topbar, { borderBottomColor: theme.border }]}>
      {onBack ? (
        <TouchableOpacity onPress={onBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={26} color={theme.text} />
        </TouchableOpacity>
      ) : (
        <View style={{ width: 26 }} />
      )}
      <Txt variant="h6">{title}</Txt>
      <View style={{ width: 26, alignItems: 'flex-end' }}>{right}</View>
    </View>
  );
};

// ---------------------------------------------------------------------------
// MapPlaceholder — web-safe stand-in for react-native-maps (real map is a
// drop-in later; this keeps the app runnable everywhere incl. browser).
// ---------------------------------------------------------------------------
export const MapPlaceholder: React.FC<{ height?: number; label?: string; children?: React.ReactNode }> = ({ height = 240, label = 'Map', children }) => {
  const { theme } = useTheme();
  const hasContent = React.Children.count(children) > 0;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ height, borderRadius: tokens.radius.lg, overflow: 'hidden', backgroundColor: '#E9EEF3', alignItems: 'center', justifyContent: 'center' }}
    >
      {/* Faint street-grid wash so it reads as a map, not clip-art. */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {[0.18, 0.42, 0.66, 0.9].map((t) => (
          <View key={`h${t}`} style={{ position: 'absolute', left: 0, right: 0, top: `${t * 100}%`, height: 1, backgroundColor: '#D2DAE2' }} />
        ))}
        {[0.2, 0.5, 0.8].map((t) => (
          <View key={`v${t}`} style={{ position: 'absolute', top: 0, bottom: 0, left: `${t * 100}%`, width: 1, backgroundColor: '#D2DAE2' }} />
        ))}
      </View>
      {/* Only show the literal map glyph/label on a truly empty placeholder. */}
      {!hasContent && (
        <>
          <Ionicons name="map-outline" size={36} color={theme.textTertiary} />
          {!!label && <Txt variant="caption" color={theme.textTertiary} style={{ marginTop: 6 }}>{label}</Txt>}
        </>
      )}
      {children}
    </View>
  );
};

// ---------------------------------------------------------------------------
// Row helper (label + value list items)
// ---------------------------------------------------------------------------
export const Row: React.FC<{
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onPress?: () => void;
}> = ({ icon, title, subtitle, right, onPress }) => {
  const { theme } = useTheme();
  return (
    <TouchableOpacity disabled={!onPress} onPress={onPress} activeOpacity={0.7} style={[styles.row, { borderBottomColor: theme.divider }]}>
      {icon && <Ionicons name={icon} size={22} color={theme.textSecondary} style={{ marginRight: 14 }} />}
      <View style={{ flex: 1 }}>
        <Txt variant="label">{title}</Txt>
        {subtitle && <Txt variant="caption" color={theme.textSecondary}>{subtitle}</Txt>}
      </View>
      {right ?? (onPress && <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />)}
    </TouchableOpacity>
  );
};

// ---------------------------------------------------------------------------
// InfoModal — centered white card over a dimmed scrim (Figma "Card Added" /
// "No Favor Pal Available" alerts). Optional action button; tap-scrim closes.
// ---------------------------------------------------------------------------
export const InfoModal: React.FC<{
  visible: boolean;
  title: string;
  message: string;
  buttonLabel?: string;
  onClose: () => void;
}> = ({ visible, title, message, buttonLabel, onClose }) => {
  const { theme } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity activeOpacity={1} onPress={onClose} style={styles.modalScrim}>
        <TouchableOpacity activeOpacity={1} style={[styles.modalCard, { backgroundColor: theme.card }]}>
          <Txt variant="h2" center style={{ marginBottom: 16 }}>{title}</Txt>
          <Txt variant="body" color={theme.textSecondary} center style={{ lineHeight: 24 }}>{message}</Txt>
          {buttonLabel ? (
            <Button title={buttonLabel} uppercase={false} onPress={onClose} style={{ marginTop: 24 }} />
          ) : null}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// ConfirmModal — cross-platform confirm dialog (Alert.alert silently no-ops on
// web, so destructive actions must not rely on it). Confirm + Cancel buttons.
// ---------------------------------------------------------------------------
export const ConfirmModal: React.FC<{
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ visible, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', destructive, onConfirm, onCancel }) => {
  const { theme } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <TouchableOpacity activeOpacity={1} onPress={onCancel} style={styles.modalScrim}>
        <TouchableOpacity activeOpacity={1} style={[styles.modalCard, { backgroundColor: theme.card }]}>
          <Txt variant="h3" center style={{ marginBottom: 12 }}>{title}</Txt>
          <Txt variant="body" color={theme.textSecondary} center style={{ lineHeight: 24 }}>{message}</Txt>
          <Button title={confirmLabel} variant={destructive ? 'danger' : 'primary'} uppercase={false} onPress={onConfirm} style={{ marginTop: 22 }} />
          <Button title={cancelLabel} variant="secondary" uppercase={false} onPress={onCancel} style={{ marginTop: 10 }} />
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  btn: { height: 54, borderRadius: tokens.radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  modalScrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  modalCard: { width: '100%', borderRadius: 18, paddingVertical: 32, paddingHorizontal: 28 },
  field: { flexDirection: 'row', alignItems: 'center', borderRadius: tokens.radius.md, paddingHorizontal: 16, minHeight: 56 },
  card: { borderRadius: tokens.radius.lg, padding: tokens.spacing.base, borderWidth: StyleSheet.hairlineWidth },
  topbar: { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth },
});
