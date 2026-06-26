# App Store & Google Play Compliance

Status of getting **My Favor** onto the Apple App Store and Google Play, what was
done in code, and the steps that only you (the account holder) can complete.

Last updated: June 2026 · Expo SDK 56 · EAS Build + EAS Submit (no Mac required).

---

## TL;DR

The app's **code and config are now store-ready**: stable bundle IDs, versioning,
in-app account deletion, a privacy policy + terms screen, permission strings, an
iOS privacy manifest, and the encryption-export exemption are all in place. What
remains is **account/business work you must do yourself**: pay the developer fees,
host the privacy policy at a public URL, fill out the store privacy questionnaires,
create screenshots, set up a reviewer demo account, and run the cloud build/submit.

---

## ✅ Done in code

| Area | Requirement | Where |
| --- | --- | --- |
| **App identity** | Stable reverse-DNS bundle ID / package `com.myfavor.app`, deep-link `scheme`, app description, primary color | `app.json` |
| **Versioning** | `version` 1.0.0, iOS `buildNumber` 1, Android `versionCode` 1, `production.autoIncrement` for builds | `app.json`, `eas.json` |
| **Account deletion** (Apple 5.1.1(v) — *mandatory* for any app with accounts) | In-app **Settings ▸ Delete Account** permanently wipes the account + all user data, with a confirm dialog that works on web **and** native | `src/screens/profile.tsx`, `src/store/index.tsx` (`deleteAccount`) |
| **Privacy policy + terms** (Apple 5.1.1, Google) | In-app **Privacy Policy** and **Terms of Service** screens, linked from Settings ▸ Support and from the Signup terms checkbox | `src/screens/legal.tsx`, wired in `src/navigation` |
| **Permission strings** (Apple 5.1.1(i)) | Purpose strings for Photos & Camera (`NSPhotoLibraryUsageDescription`, `NSCameraUsageDescription`); managed by `expo-image-picker` plugin too. *No location string* — location is mocked, so we don't request it. | `app.json` `ios.infoPlist` + `plugins` |
| **iOS privacy manifest** (required since Spring 2024) | `PrivacyInfo.xcprivacy` generated from `ios.privacyManifests`, declaring required-reason API usage: UserDefaults `CA92.1`, file timestamp `C617.1`, system boot time `35F9.1`, disk space `E174.1` | `app.json` `ios.privacyManifests` |
| **Encryption export** (Apple) | `usesNonExemptEncryption: false` + `ITSAppUsesNonExemptEncryption: false` → skips the export-compliance prompt at every submit (app uses only standard HTTPS) | `app.json` |
| **UGC safety** (Apple 1.2 — *required* because users post favor content & message each other) | In-app **Report user**, **Block user**, and a Terms section with a zero-tolerance objectionable-content clause | `src/store` (`reportUser`, `blockUser`, `blockedUsers`), `src/screens/legal.tsx` |
| **Payments model** (Apple 3.1.3/3.1.5, Google) | Favors are *real-world services* delivered outside the app, so they correctly use a third-party processor (Stripe) and **must not** use in-app purchase. No IAP SDK is included. | money model in `src/types` |

> Note: the Stripe / Twilio / maps integrations are still **mocked** in this build.
> Before a public production release you must wire the real SDKs (see "Before a
> real production launch" below). The compliance *config* above is correct either way.

---

## 🔲 Your action items (cannot be done from code)

### 1. Developer accounts (paid)
- **Apple Developer Program** — **$99 / year**. Required to build, sign, and submit.
  Enroll at <https://developer.apple.com/programs/>. Use an Organization account
  (needs a D-U-N-S number) if publishing under a company name; Individual is fine
  for a solo developer.
- **Google Play Developer** — **$25 one-time**. Register at
  <https://play.google.com/console/signup>.

### 2. Host the legal documents at public URLs
Both stores require a **publicly reachable Privacy Policy URL** (Google also wants
a Terms URL). The in-app screens in `src/screens/legal.tsx` are the source text —
publish the same content at stable URLs, e.g.:
- `https://myfavor.app/privacy`
- `https://myfavor.app/terms`
- A support URL/email (e.g. `https://myfavor.app/support` or `support@myfavor.app`).

> ⚠️ The legal text in `legal.tsx` is a **structured template, not legal advice**.
> Have it reviewed by counsel and fill in the bracketed business details (legal
> entity name, address, governing law) before you publish or submit.

### 3. App Store Connect setup (Apple)
1. Create the app record in <https://appstoreconnect.apple.com> with bundle ID
   `com.myfavor.app`. Copy the **App Store Connect App ID (ascAppId)**,
   your **Apple ID email**, and **Apple Team ID** into `eas.json` ▸
   `submit.production.ios` (replace the `REPLACE_WITH_...` placeholders).
2. **App Privacy ("nutrition labels")** — declare data collected: Name, Email,
   Phone, Photos, Coarse Location, Payment Info (via Stripe), Messages/User
   Content, Usage/Diagnostics. Keep it consistent with `legal.tsx`.
3. **Age rating** questionnaire — likely **17+** (user-generated content + the app
   facilitates real-world meetups/services; answer the UGC questions honestly).
4. **Demo account for review** — the app gates everything behind login, so App
   Review **requires** working credentials. Provide a demo email + password (and an
   OTP note, since sign-in uses a one-time code) in *App Review Information ▸
   Sign-In Information*, plus notes on how to request and complete a favor.
5. Screenshots (see item 5) + description, keywords, support URL, privacy URL.

### 4. Google Play Console setup
1. Create the app, package `com.myfavor.app`.
2. **Data safety** form — mirror the Apple privacy declaration above.
3. **Content rating** questionnaire (IARC).
4. Privacy Policy URL (required), target audience, ads declaration (none),
   and a **Closed/Internal testing** track before production.
5. Provide test credentials / demo account in the review notes (same reason as Apple).

### 5. Store assets
- **App icon** 1024×1024 (already have `assets/icon.png` — confirm it's 1024² and
  has no transparency for iOS).
- **Screenshots**: iPhone 6.7" and 6.5" (and 5.5" if you support older), plus
  Android phone shots. Capture from a real EAS build or the web preview at phone
  size. At least 3–4 per platform showing core flows (request a favor, tracking,
  pal earnings, messaging).
- Short + full description, keywords, category (Lifestyle or Business).

### 6. Build & submit (no Mac needed — EAS cloud)
```bash
# one-time
npm install -g eas-cli
eas login

# configure credentials (Expo manages signing for you)
eas build:configure

# production builds (cloud)
eas build --platform ios --profile production
eas build --platform android --profile production

# submit to the stores (after filling the eas.json submit placeholders)
eas submit --platform ios --profile production
eas submit --platform android --profile production
```
`eas.json` already defines `development`, `preview` (internal/simulator), and
`production` (auto-incrementing) profiles.

---

## Before a real production launch (beyond store *acceptance*)

These aren't blockers for a build, but the app isn't truly production-ready until:
- **Stripe** is wired for real charges + Connect payouts (currently mocked). Apple
  3.1.3 requires real card entry to use a PCI-compliant processor — never collect
  raw card numbers in-app yourself.
- **Twilio/OTP** sends real verification codes (currently mocked).
- **Maps/location** uses a real provider and you add `NSLocationWhenInUseUsageDescription`
  + the location plugin **only when** you actually request location.
- A real backend replaces the in-memory mock store (`src/store`), and account
  deletion deletes server-side data too (the in-app flow currently clears local
  session state — the *requirement* is satisfied, but a real backend must honor it
  server-side).
- Push notifications: add `expo-notifications` + APNs/FCM credentials if you ship them.

---

## Sources
- [Apple — App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) (5.1.1 account deletion, 1.2 UGC safety, 3.1 payments)
- [Apple — Offering account deletion in your app](https://developer.apple.com/support/offering-account-deletion-in-your-app/)
- [Apple — Privacy manifest files](https://developer.apple.com/documentation/bundleresources/privacy-manifest-files)
- [Apple — App Privacy Details](https://developer.apple.com/app-store/app-privacy-details/)
- [Expo — Privacy manifests (`ios.privacyManifests`)](https://docs.expo.dev/guides/apple-privacy/)
- [Expo — Submit to the App Store](https://docs.expo.dev/submit/ios/) · [Submit to Google Play](https://docs.expo.dev/submit/android/)
- [Expo — App config (`app.json`) reference](https://docs.expo.dev/versions/v56.0.0/config/app/)
- [Google Play — Data safety](https://support.google.com/googleplay/android-developer/answer/10787469)
