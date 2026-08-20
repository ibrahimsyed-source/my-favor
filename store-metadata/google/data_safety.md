# Play Console — Data safety form answers

Overview answers:
- **Does your app collect or share any of the required user data types?** Yes
- **Is all of the user data collected by your app encrypted in transit?** Yes (HTTPS everywhere)
- **Do you provide a way for users to request that their data is deleted?** Yes — in-app (Settings ▸ Delete Account) — deletion is immediate and permanent
- **Data shared with third parties:** only with processors to run the service (Stripe for payments, Resend for verification email, Google Maps for map display). No data is sold; nothing is shared for advertising.

Per-type declarations (all: **Collected**, **Not shared** for advertising, **Required**, purpose = **App functionality** unless noted):

| Play data type | Collected | Notes |
| --- | --- | --- |
| Personal info ▸ Name | Yes | account, matching, display |
| Personal info ▸ Email address | Yes | account, login, verification |
| Personal info ▸ Phone number | Yes | account, verification |
| Personal info ▸ User IDs | Yes | operate the account |
| Location ▸ Approximate location | Yes | match nearby favors/pals |
| Location ▸ Precise location | Yes | favor address + live GPS while a favor is in progress (foreground only) |
| Financial info ▸ Payment info | Yes | processed by Stripe; app stores only card brand + last4 |
| Photos and videos ▸ Photos | Yes | favor images, profile picture (user-initiated) |
| Messages ▸ Other in-app messages | Yes | member ↔ pal favor coordination |
| App activity ▸ Other user-generated content | Yes | favor posts, profiles, ratings |
| App info and performance ▸ Diagnostics | Yes | purpose: Analytics (reliability/crash fixing) |

Not collected (declare "No"): contacts, calendar, SMS/call logs, health,
audio/music files, browsing history, installed apps, device IDs for ads.
