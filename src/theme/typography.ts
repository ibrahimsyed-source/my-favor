// Type scale from the Figma file. v.2 rule: Poppins EVERYWHERE (weights 400/500/
// 600, bold 700 only for the wordmark/headings). Every token below resolves to a
// Poppins family — the legacy Roboto/Open-Sans slot names are kept so existing
// consumers keep working, but they now point at the matching Poppins weight.
// Families are registered in App.tsx.

export const fonts = {
  // Poppins (display / headings / logo)
  display: 'Poppins_700Bold',
  displayMedium: 'Poppins_600SemiBold',
  // Legacy "Roboto" slots — repointed to Poppins (v.2 "Poppins everywhere").
  robotoRegular: 'Poppins_400Regular',
  robotoMedium: 'Poppins_500Medium',
  robotoBold: 'Poppins_700Bold',
  // Body — repointed from Open Sans to Poppins.
  bodyRegular: 'Poppins_400Regular',
  bodyMedium: 'Poppins_500Medium',
  bodySemiBold: 'Poppins_600SemiBold',
  bodyBold: 'Poppins_700Bold',
} as const;

export const typography = {
  display: { fontFamily: fonts.display, fontSize: 40, lineHeight: 48 }, // "My Favor"
  h1: { fontFamily: fonts.display, fontSize: 30, lineHeight: 38 }, // screen titles e.g. "Verification"
  h2: { fontFamily: fonts.display, fontSize: 26, lineHeight: 32 },
  h3: { fontFamily: fonts.display, fontSize: 22, lineHeight: 28 },
  h4: { fontFamily: fonts.displayMedium, fontSize: 20, lineHeight: 26 },
  h6: { fontFamily: fonts.display, fontSize: 17, lineHeight: 22 }, // topbar titles
  body: { fontFamily: fonts.bodyRegular, fontSize: 17, lineHeight: 24 },
  bodySm: { fontFamily: fonts.bodyRegular, fontSize: 15, lineHeight: 21 },
  label: { fontFamily: fonts.bodySemiBold, fontSize: 16, lineHeight: 22 }, // field labels (bold dark)
  caption: { fontFamily: fonts.bodyRegular, fontSize: 13, lineHeight: 18 },
  button: { fontFamily: fonts.bodyMedium, fontSize: 16, lineHeight: 20 }, // Poppins Medium uppercase CTA text
  tab: { fontFamily: fonts.robotoMedium, fontSize: 10, lineHeight: 12 },
} as const;

export type TypographyVariant = keyof typeof typography;
