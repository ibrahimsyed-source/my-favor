# App Privacy (nutrition labels) — answers

All collected data is **linked to the user's identity** and used for **App
Functionality** (plus Analytics for diagnostics). Nothing is used for
**tracking** (no cross-app/site tracking, no third-party advertising) and
nothing is **sold**.

| Data type | Collected? | Linked to user | Used for |
| --- | --- | --- | --- |
| Name | Yes | Yes | App functionality (account, matching, display) |
| Email address | Yes | Yes | App functionality (account, login, verification) |
| Phone number | Yes | Yes | App functionality (account, verification, contact) |
| Coarse location | Yes | Yes | App functionality (match nearby favors/pals) |
| Precise location (entered address + live GPS during a favor) | Yes | Yes | App functionality (deliver/perform the favor, live tracking) |
| Photos | Yes | Yes | App functionality (favor details, profile picture) |
| Payment info | Yes (via Stripe) | Yes | App functionality (payments/payouts; we store only card brand + last4) |
| Messages / other user content | Yes | Yes | App functionality (favor coordination) |
| User ID | Yes | Yes | App functionality (operate the account) |
| Usage & diagnostic data | Yes | Yes | Analytics (reliability, crash fixing) |

- Tracking (ATT): **No** — the app does not track users across apps/websites.
- Account + all data are **deletable in-app**: Settings ▸ Delete Account.
- Third-party processors to disclose: **Stripe** (payments), **Resend**
  (verification email), **Google Maps** (map display/geocoding).
- Keep these answers consistent with the in-app policy
  (`src/screens/legal.tsx`) and the hosted privacy-policy URL.
