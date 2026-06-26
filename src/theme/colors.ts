// Color tokens extracted from the "My Favor (B)" Figma file.
// Light + dark themes. Consume via useTheme() (see src/theme/index.ts).

export const palette = {
  // Brand / accent — the "My Favor" mark is a scarlet red rounded square.
  brand: '#ED1C24',
  brandDark: '#C20E15',
  brandLight: '#FBD9DA',
  info: '#009FEE',
  link: '#007AFF',

  // Primary call-to-action is BLACK (see btn/solid/black in the design).
  cta: '#141414',
  ctaText: '#FFFFFF',
  // Secondary button is a light gray pill.
  secondaryBtn: '#EAEAEA',

  // Status
  success: '#02CB00',
  successAlt: '#35C75A',
  warning: '#FFBD00', // rating star / amber
  danger: '#ED1C24',

  // Neutrals
  black: '#000000',
  white: '#FFFFFF',
  textPrimary: '#1A1A1A',
  textSecondary: '#68707F', // "Text/Grey 5" (~4.9:1 on white)
  textTertiary: '#767676', // darkened from #959595 to pass WCAG AA (4.54:1) for placeholders/captions
  disabled: '#999999',
  border: '#ECEBED', // Grey 25%
  divider: '#E5E5E5',
  inputBg: '#EFEFEF', // filled gray fields
  surfaceAlt: '#F5F5F5',

  // Dark-mode / map-overlay surfaces (side drawer + map bottom sheets)
  darkBg: '#131820',
  darkSurface: '#1C2331', // side drawer navy
  darkSurfaceAlt: '#253246',
  darkBorder: '#2C3647',
} as const;

// Named dark-surface tokens for the black/navy screens (profile, pal, payouts).
// Use these instead of scattering near-duplicate literals across screens.
export const darkTokens = {
  bg: '#0C0C0C', // near-black screen background (Profile/EditProfile/Pal feedback)
  bgAlt: '#11161F', // dark map backdrop
  surface: '#141A24', // bottom sheet
  surfaceAlt: '#1C2331', // raised sheet / filled field
  field: '#262C40', // input field navy (BankInfo)
  border: '#2C3647',
  divider: '#262C38',
  textSubtle: '#9BA1A6', // secondary text on dark
  textMuted: '#8A8A8A', // tertiary text on dark
  onDarkShadow: 'rgba(0,0,0,0.6)',
} as const;

export interface AppTheme {
  mode: 'light' | 'dark';
  primary: string; // brand red
  primaryDark: string;
  cta: string; // black CTA button bg
  ctaText: string;
  secondaryBtn: string; // gray button bg
  link: string;
  background: string;
  surface: string;
  surfaceAlt: string;
  card: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  border: string;
  divider: string;
  inputBg: string;
  success: string;
  warning: string;
  danger: string;
  star: string;
  onPrimary: string;
  disabled: string;
}

export const lightTheme: AppTheme = {
  mode: 'light',
  primary: palette.brand,
  primaryDark: palette.brandDark,
  cta: palette.cta,
  ctaText: palette.ctaText,
  secondaryBtn: palette.secondaryBtn,
  link: palette.link,
  background: palette.white,
  surface: palette.white,
  surfaceAlt: palette.surfaceAlt,
  card: palette.white,
  text: palette.textPrimary,
  textSecondary: palette.textSecondary,
  textTertiary: palette.textTertiary,
  border: palette.border,
  divider: palette.divider,
  inputBg: palette.inputBg,
  success: palette.success,
  warning: palette.warning,
  danger: palette.danger,
  star: palette.warning,
  onPrimary: palette.white,
  disabled: palette.disabled,
};

export const darkTheme: AppTheme = {
  ...lightTheme,
  mode: 'dark',
  background: palette.darkBg,
  surface: palette.darkSurface,
  surfaceAlt: palette.darkSurfaceAlt,
  card: palette.darkSurface,
  text: palette.white,
  textSecondary: '#ADB5BD',
  textTertiary: '#838383',
  border: palette.darkBorder,
  divider: palette.darkBorder,
  inputBg: palette.darkSurfaceAlt,
};
