# Required URLs (App Store Connect)

The API now serves the legal pages itself (`server/src/routes/legal.routes.ts`),
so these URLs go live on the next server deploy to Render — no separate website
needed. Verify each one loads in a browser before submitting.

| Field | URL | Status |
| --- | --- | --- |
| Privacy Policy URL (required) | https://my-favor-api.onrender.com/privacy | live after next API deploy |
| Support URL (required) | https://my-favor-api.onrender.com/support | live after next API deploy |
| Terms of Service (EULA field, optional) | https://my-favor-api.onrender.com/terms | live after next API deploy |
| Marketing URL (optional) | https://myfavrapp.com | only if the domain hosts a page |

- Support email shown on the pages: `support@myfavor.app` — make sure this is a
  real, monitored inbox (or change `CONTACT_EMAIL` in
  `server/src/routes/legal.routes.ts` and both store listings to match).
- If a marketing site on `myfavrapp.com` ships later, point the store fields at
  `https://myfavrapp.com/privacy` etc. and keep the API routes as redirects.

Categories: **Primary: Lifestyle · Secondary: Business**
Copyright: `© 2026 [legal entity name]`
