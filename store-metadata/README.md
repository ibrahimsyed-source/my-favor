# Store metadata — paste-ready files

Each file maps 1:1 to a field in App Store Connect / Google Play Console.
Character limits are enforced by the stores; every file here has been verified
to fit. The narrative doc (privacy labels, age rating answers, review
walkthrough) lives in `../APP_STORE_LISTING.md`.

## Apple — App Store Connect (`apple/`)

| File | ASC field | Limit |
| --- | --- | --- |
| `name.txt` | App Information ▸ Name | 30 |
| `subtitle.txt` | App Information ▸ Subtitle | 30 |
| `promotional_text.txt` | Version ▸ Promotional Text | 170 |
| `description.txt` | Version ▸ Description | 4000 |
| `keywords.txt` | Version ▸ Keywords | 100 |
| `release_notes.txt` | Version ▸ What's New | 4000 |
| `review_notes.txt` | App Review Information ▸ Notes | 4000 |

- **Primary category:** Lifestyle · **Secondary:** Business
- **Age rating:** answer the questionnaire per `APP_STORE_LISTING.md` (expect 17+)
- **Demo account:** required (app is login-gated) — seed a pre-verified
  reviewer account; see `APP_STORE_LISTING.md ▸ App Review information`.

## Google — Play Console (`google/`)

| File | Play field | Limit |
| --- | --- | --- |
| `title.txt` | Main store listing ▸ App name | 30 |
| `short_description.txt` | Main store listing ▸ Short description | 80 |
| `full_description.txt` | Main store listing ▸ Full description | 4000 |

- **Category:** Lifestyle · **Tags:** errands, local services
- **Content rating (IARC):** declare user interaction + user-generated content
  + shares location → expect Teen/Mature.
- **Data safety form:** use the table in `APP_STORE_LISTING.md ▸ App Privacy`.

## URLs (live once the server redeploys — served by the API)

- Privacy Policy: `https://my-favor-api.onrender.com/privacy`
- Terms of Service: `https://my-favor-api.onrender.com/terms`
- Support: `https://my-favor-api.onrender.com/support`
- Support email: `support@myfavor.app` (must be a real, monitored inbox)

Swap these for `https://myfavrapp.com/...` equivalents if/when a marketing
site exists — update both store listings and keep the API routes as redirects.

## Screenshots (still to capture)

- iPhone 6.7" (1290×2796) and 6.5" (1242×2688) — 4–6 shots
- Android phone + 7"/10" tablet (Play also wants a 1024×500 feature graphic
  and the 512×512 icon — `../assets/icon.png` upscaled/exported)
- Suggested shots: Home map + "Request a Favor" · favor tier picker ·
  live tracking · Browse Favors (Pal) · Earnings/cash-out · Messages
