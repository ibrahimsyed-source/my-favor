# App Store / Play listing — ready-to-paste content

Everything App Review and the store listing need, drafted from the actual app.
Fill the [bracketed] bits with your real details. Keep the privacy answers
consistent with `src/screens/legal.tsx` (the in-app policy) and your hosted policy.

---

## Names & copy

- **App name:** My Favor
- **Subtitle (iOS, ≤30 chars):** Errands & favors, on demand
- **Promotional text (≤170):** Need a hand? Post a favor and a nearby Favor Pal
  takes care of it. Want to earn? Accept favors and get paid. Simple, local, fast.
- **Keywords (iOS, ≤100 chars, comma-sep):**
  `favor,errand,task,delivery,help,gig,handyman,chores,pickup,local,odd jobs,assistant,hire,nearby`
- **Primary category:** Lifestyle  ·  **Secondary:** Business
- **Description:**

```
My Favor connects people who need everyday favors done with nearby Favor Pals who
get them done — and get paid.

NEED A FAVOR?
• Post what you need — a pickup, a delivery, an errand, a quick task
• Get matched with a nearby Favor Pal
• Track it live and pay securely in the app
• Rate your Pal when it's done

WANT TO EARN?
• Browse open favors near you and pick the ones that fit
• See exactly what you'll earn before you accept
• Get paid straight to your bank after each favor

WHY MY FAVOR
• Secure in-app payments — your card details never touch us
• Private messaging and calling with the other person
• Ratings and reviews on both sides
• Report and block tools to keep the community safe

Switch between requesting favors and being a Favor Pal anytime.

Favors are agreements between members and Pals; My Favor provides the platform.
You must be 18+ to use My Favor.
```

---

## Age rating (Apple questionnaire)

Target: **17+** (user-generated content + facilitates real-world services/meetups).
- Unrestricted web access: **No**
- User-generated content: **Yes** (messaging, favor posts, profiles) → answer the
  follow-ups honestly; with report/block tools present.
- Gambling / contests: **No**
- Medical/treatment, drugs, violence, sexual content, profanity: **None**
- Google Play content rating (IARC): expect **Teen/Mature**; declare
  user-interaction + user-generated content + shares location.

---

## App Privacy ("nutrition labels" / Play Data Safety)

All data is **linked to the user's identity**, used for **App Functionality**
(and Analytics for diagnostics) — **not** for tracking or third-party ads.

| Data | Collected | Why |
| --- | --- | --- |
| Name | Yes | account, matching, display |
| Email address | Yes | account, login, verification |
| Phone number | Yes | account, verification, contact |
| Coarse location | Yes | match nearby favors/pals |
| Precise address (entered) | Yes | deliver/perform the favor |
| Photos (favor/profile) | Yes | favor details, profile |
| Payment info | Yes (via Stripe) | process payments/payouts; we store only brand + last4 |
| Messages / user content | Yes | enable favor coordination |
| User ID | Yes | operate the account |
| Usage/diagnostic data | Yes | reliability, crash fixing |

- Data is **not sold**.  Account + data are **deletable in-app** (Settings ▸ Delete Account).
- Third-party processors: **Stripe** (payments), **Resend** (verification email),
  **Google Maps** (map display). List per store requirements.

---

## App Review information

- **Demo account (Sign-In required):** the app gates everything behind login.
  Provide a verified account, e.g. `reviewer@myfavor.app` / `[password]`.
  IMPORTANT: this account must be **pre-verified** so review can log in with just
  email + password (no OTP needed). Seed it like the `alex@example.com` demo user.
- **Reviewer notes:**
  ```
  Log in with the demo account above (email + password; no code needed).
  Home shows the map + "Request a Favor". To see the two-sided flow, use the
  "Switch to be a Favor Pal" toggle on Home, then "Browse all open favors" to see
  and accept requests. Payments use Stripe (real-world services, not digital
  goods), so Apple in-app purchase does not apply.
  ```
- **Contact:** [your name / phone / email]
- **Notes on payments:** favors are real-world services performed off-app, billed
  via Stripe per Guideline 3.1.3(e) / 3.1.5 — not digital content, so no IAP.

---

## Required URLs (host these)
- **Privacy Policy:** https://[yourdomain]/privacy  (text in `src/screens/legal.tsx`)
- **Terms of Service:** https://[yourdomain]/terms
- **Support URL:** https://[yourdomain]/support  (or a support email)
- **Marketing URL (optional):** https://[yourdomain]

## Screenshots (capture from the running app at device sizes)
Required iPhone sizes: **6.7"** and **6.5"** (1290×2796 / 1242×2688). Suggested 4–6:
1. Home map + "Request a Favor"  2. Pick a favor tier / describe it
3. Live tracking  4. Browse Favors board (pal)  5. Earnings + cash-out  6. Messages
Android: phone screenshots of the same. (I can produce these from the web build at
phone dimensions, or you can screenshot a TestFlight build.)
