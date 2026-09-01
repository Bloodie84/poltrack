# Sonora

Upload a track. Get a link. Send it.

A small, fast audio host built around four things and nothing else:
**upload → listen → share → download**. Someone receives a link on their phone,
opens it, and the track plays. No feed, no comments, no followers — and no
account needed to upload or to listen.

---

## What it does

- **Upload without registering.** Drop a file, fill in a title, publish, get a
  link. Nothing to remember, no e-mail to confirm. An e-mail and password can be
  attached later, and every track already uploaded stays yours.
- **Upload** MP3, WAV, FLAC, M4A and AAC (up to 500 MB) by drag & drop on the
  desktop or the file picker on a phone, with real byte-level progress.
- **Analyse** the file in the browser: duration, sample rate, bit rate, channel
  count and the peak data used to draw the waveform.
- **Publish** with a title, artist, cover, description, genre, a visibility
  (public / unlisted / private) and a downloads switch.
- **Play** on a dedicated page with an interactive waveform — click, drag or
  touch anywhere to seek — plus volume, mute and repeat, and a mini player that
  keeps playing while you move around the app.
- **Share** with a copy-link button, WhatsApp, Messenger, X, Facebook, e-mail,
  and the phone's own share sheet where the browser exposes it.
- **Download** the original file, but only when the owner allows it.
- **Manage** everything from *My tracks*: play, share, copy link, statistics,
  edit, delete, and flip downloads on or off without republishing.

## Pages

| Route | What it is |
| --- | --- |
| `/` | One line about the service, then Upload / My tracks (signed in) or Log in / Create account |
| `/login`, `/register` | E-mail + password |
| `/upload` | The upload and publish screen — open to everyone |
| `/library` | My tracks, with statistics and quick actions |
| `/track/<slug>-<id>` | The listening page — works signed out |
| `/u/<name>-<id>` | An artist's public page: their public tracks, nothing else |
| `/settings` | Artist name, password, sign out |

## Design

**Direction: a piece of studio equipment.** Warm anodised dark metal, bone-white
controls, and one brass colour that only appears where something is lit — the
played part of a waveform, the track playing right now, a control that is on.
The app commits to a single dark world on purpose and paints every colour
explicitly.

- **Neutrals carry a brown bias** toward the brass (`#0b0a09` ground,
  `#131110` panels) rather than the usual cold near-black.
- **One superfamily, three voices**: IBM Plex Sans Condensed for display
  (the way credits are set on a sleeve), IBM Plex Sans for the interface, and
  IBM Plex Mono with tabular figures for anything an engineer reads off a
  device — timecode, kbps, kHz, file size. Self-hosted in `src/fonts`
  (OFL 1.1), so a build needs no font CDN.
- **Radii by role**, not one value everywhere: a sleeve is nearly square, a
  control is barely rounded, a sheet is soft.
- **A track with no artwork gets a sleeve drawn from its own waveform** — real
  peak data, so every sleeve differs and none of it is invented decoration. The
  ground brightens slightly with the track's average level.
- **State is encoded in form**: visibility is an icon and a label, not a
  colour, which keeps brass meaning exactly one thing.

## Architecture

- **Next.js 15** (App Router) and **React 19** in **TypeScript**.
- **Supabase** for auth, PostgreSQL, storage and Row Level Security.
- Hand-written CSS with design tokens — no UI framework, no component library.
- No client-side state library: one `<audio>` element lives in a context
  provider mounted in the root layout, which is what keeps the mini player alive
  across navigation.

```
src/
  app/
    api/                 route handlers — every permission check lives here
      upload/sign        issues a signed upload URL scoped to the user's folder
      tracks             publish, edit, delete
      tracks/[id]/play   records a play (server-side only)
      tracks/[id]/stats  owner-only statistics
      stream/[id]        permission check → redirect to a short-lived signed URL
      download/[id]      the same, but only when downloads are enabled
    track/[slug]         the listening page
    library, upload, settings, login, register
  components/            player, waveform, share sheet, upload studio, …
  lib/
    audio.ts             duration / bit rate / sample rate / waveform peaks
    supabase/            browser, server and service-role clients
supabase/
  migrations/            the schema, RLS policies and storage buckets
  tests/                 SQL assertions for the security model
test/
  e2e/                   Playwright tests
  fake-supabase/         a local Supabase stand-in used only by those tests
```

## Database

Five tables — `profiles`, `tracks`, `track_files`, `plays`, `downloads` — created
by `supabase/migrations/20260901000000_init.sql`, together with two storage
buckets: `audio` (private) and `covers` (public).

`tracks` holds `id, owner_id, short_id, slug, title, artist, description, genre,
cover_url, cover_path, audio_path, duration, visibility, downloads_enabled,
play_count, download_count, created_at, updated_at`.

## Uploading without an account

The visitor still gets a real Supabase identity — it is just created for them,
with no e-mail, at the moment they choose a file
(`supabase.auth.signInAnonymously()`). That matters: **every Row Level Security
policy keeps working unchanged**, because a guest is an ordinary
`authenticated` user as far as Postgres is concerned. There is no second,
weaker ownership path bolted on beside the first one.

What follows from that:

- The session lives in the browser cookie. *My tracks* works, editing works,
  deleting works — from that browser. The app says so plainly rather than
  letting someone discover it later.
- Attaching an e-mail and password (`updateUser`) keeps the same user id, so
  links, play counts and ownership all survive.
- Nobody else can touch a guest's track: a request from another browser is
  refused by the same policies that protect a registered account.

**This has to be enabled in Supabase**: Authentication → Sign In / Providers →
*Anonymous sign-ins*. If it is off, the upload screen says so instead of
failing silently.

**It is also a decision with a cost**, so it is worth taking deliberately: an
open upload endpoint means anyone can consume your storage. Sonora does not
ship a home-made rate limiter — a per-IP counter punishes everyone behind one
NAT and is trivially bypassed. Use the protections that sit at the right layer:
turn on **Captcha for anonymous sign-ins** in Supabase, keep the bucket's
500 MB file cap, and watch storage usage. If your project should not accept
anonymous uploads at all, leave anonymous sign-ins off — the rest of the app
works exactly as before.

## The security model

Hiding a button is not protection. Every rule is enforced in the database or in
a server route:

- **Row Level Security is on for every table.** A private track is invisible to
  everyone but its owner — not filtered in the UI, absent from the query result.
- **Unlisted tracks are readable but never listed.** Public listings — the home
  page and every artist page — filter on `visibility = 'public'`; an unlisted
  page also sends `noindex`.
- **The audio bucket is private.** Nothing reads it with the anon key. Playback
  goes through `/api/stream/[id]`, which checks the caller against RLS and then
  redirects to a signed URL that expires in an hour and supports HTTP range
  requests, so playback starts immediately and seeking does not pull the whole
  file.
- **Downloads are checked server-side.** `/api/download/[id]` refuses with 403
  unless `downloads_enabled` is true or the caller is the owner, and the signed
  URL it issues lives for two minutes.
- **Uploads cannot escape their folder.** The client never chooses a storage
  path: the server issues a signed upload URL under `<user id>/…`.
- **Counters cannot be forged.** `plays` and `downloads` have no insert policy at
  all; only the service role, from a route handler, can write them, and
  `increment_play` / `increment_download` are revoked from `public`, `anon` and
  `authenticated`.
- **The service role key is server-only.** It is never prefixed `NEXT_PUBLIC_`
  and never imported from a client component.

One thing worth being honest about: a signed stream URL is a URL to the original
file. It is short-lived and only issued after a permission check, but any
browser that can play a file can also save the bytes it received. The downloads
switch controls the download *feature* — it is not DRM, and no web player is.

## Putting it online

**[DEPLOY.md](DEPLOY.md)** is the step-by-step: Supabase project, migrations,
the anonymous-upload decision, Vercel with **root directory `sonora`**, the
five environment variables, the redirect URL, and a smoke test to confirm it.

```bash
npm run smoke -- https://your-domain.com
```

## Running it locally

1. Create a Supabase project.
2. Apply the migration — `supabase db push`, or paste
   `supabase/migrations/20260901000000_init.sql` into the SQL editor.
3. Copy `.env.example` to `.env.local` and fill in:

   ```
   NEXT_PUBLIC_SUPABASE_URL=…
   NEXT_PUBLIC_SUPABASE_ANON_KEY=…
   SUPABASE_SERVICE_ROLE_KEY=…      # server only
   NEXT_PUBLIC_SITE_URL=…           # used to build share links
   LISTENER_SALT=…                  # any random string
   ```

4. Turn on **Anonymous sign-ins** (Authentication → Sign In / Providers) if you
   want uploads without registration, and consider enabling Captcha with it.
5. `npm install && npm run dev`

If you leave e-mail confirmation on in Supabase, add `<your site>/auth/callback`
to the allowed redirect URLs.

## Tests

**Security assertions against a real PostgreSQL** — 29 checks covering every
policy (`supabase/tests/rls_test.sql`):

```bash
supabase/tests/run.sh          # needs a local postgres superuser
```

**End-to-end, in a real browser** (Playwright + Chromium). These drive the actual
application against a local stand-in for the Supabase API that talks to a real
PostgreSQL database with the real migrations applied — so RLS is genuinely
exercised:

```bash
npm run test:e2e
```

They cover: uploading and publishing with no account at all, managing that
track from the same browser and being refused from another, attaching an
e-mail afterwards and finding every track still there, sign-up, log in and out,
upload with analysis and progress,
publishing, playing / pausing / seeking as a signed-out visitor, the waveform,
the mini player across navigation, share sheet and copy link, downloads on and
off (including a direct request to the endpoint), public / unlisted / private,
editing, deleting, statistics, a second user trying to touch someone else's
track, and the whole flow again on a phone-sized viewport.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm run typecheck` | TypeScript, no emit |
| `npm run lint` | ESLint |
| `npm run test:sql` | The RLS assertions |
| `npm run test:e2e` | The browser tests (starts everything it needs) |
