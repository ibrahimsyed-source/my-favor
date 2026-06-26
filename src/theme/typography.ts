// Type scale from the Figma file. Headings/wordmark use Comfortaa (rounded
// geometric — matches "My Favor", "Verification", "Favor Booked"); body uses
// Open Sans; Roboto for labels/buttons. Families are registered in App.tsx.

export const fonts = {
  // Comfortaa (display / headings / logo)
  display: 'Comfortaa_700Bold',
  displayMedium: 'Comfortaa_500Medium',
  // Roboto
  robotoRegular: 'Roboto_400Regular',
  robotoMedium: 'Roboto_500Medium',
  robotoBold: 'Roboto_700Bold',
  // Open Sans (body)
  bodyRegular: 'OpenSans_400Regular',
  bodySemiBold: 'OpenSans_600SemiBold',
  bodyBold: 'OpenSans_700Bold',
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
  button: { fontFamily: fonts.bodySemiBold, fontSize: 16, lineHeight: 20 }, // uppercase CTA text
  tab: { fontFamily: fonts.robotoMedium, fontSize: 10, lineHeight: 12 },
} as const;

export type TypographyVariant = keyof typeof typography;
