import React from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ViewStyle, TextStyle,
  ScrollView, Image, ActivityIndicator, KeyboardAvoidingView, Platform,
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
  const bg = {
    primary: theme.cta,
    secondary: theme.secondaryBtn,
    brand: theme.primary,
    white: '#FFFFFF',
    ghost: 'transparent',
    danger: theme.danger,
  }[variant];
  const fg =
    variant === 'secondary' || variant === 'white'
      ? '#141414'
      : variant === 'ghost'
      ? theme.cta
      : '#FFFFFF';
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      disabled={disabled || loading}
      onPress={onPress}
      style={[
        styles.btn,
        { backgroundColor: bg, opacity: disabled ? 0.5 : 1, borderWidth: variant === 'ghost' ? 1.5 : 0, borderColor: theme.cta },
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
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((i) => {
        const filled = i <= Math.round(value);
        const star = <Ionicons name={filled ? 'star' : 'star-outline'} size={size} color={theme.star} />;
        return onChange ? (
          <TouchableOpacity key={i} onPress={() => onChange(i)}>{star}</TouchableOpacity>
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
        <TouchableOpacity onPress={onBack} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={theme.text} />
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
  return (
    <View style={{ height, borderRadius: tokens.radius.lg, overflow: 'hidden', backgroundColor: '#DCE6F2', alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name="map" size={40} color={theme.primary} />
      <Txt variant="caption" color={theme.textSecondary} style={{ marginTop: 6 }}>{label}</Txt>
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

const styles = StyleSheet.create({
  btn: { height: 54, borderRadius: tokens.radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  field: { flexDirection: 'row', alignItems: 'center', borderRadius: tokens.radius.md, paddingHorizontal: 16, minHeight: 56 },
  card: { borderRadius: tokens.radius.lg, padding: tokens.spacing.base, borderWidth: StyleSheet.hairlineWidth },
  topbar: { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth },
});
