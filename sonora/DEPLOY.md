# Putting Sonora online

Two accounts do the work: **Supabase** holds the data and the audio, **Vercel**
runs the app. Both have a free tier that is enough to see it live. Budget about
fifteen minutes.

Nothing here needs a terminal except the last step, and that one is optional.

---

## 1. Create the Supabase project

1. [supabase.com](https://supabase.com) → **New project**.
2. Pick a region close to your listeners — it is where the audio will be
   served from.
3. Save the database password it gives you.

Wait for the project to finish provisioning.

## 2. Create the schema

Supabase dashboard → **SQL Editor** → **New query**. Paste the contents of each
file in `supabase/migrations/`, **in filename order**, and run them one at a
time:

1. `20260901000000_init.sql` — tables, Row Level Security, the two storage
   buckets.
2. `20260901010000_public_profiles.sql` — the artist page URLs.

There is no output to read: if a statement fails, the editor says so in red.

*(With the Supabase CLI linked to the project, `supabase db push` does the same
thing.)*

## 3. Decide about anonymous uploads

Authentication → **Sign In / Providers**:

- **Anonymous sign-ins ON** — anyone can upload without registering. This is
  the product as designed. Turn on **Captcha** in the same screen: an open
  upload endpoint is an open storage bill otherwise.
- **Anonymous sign-ins OFF** — uploading requires an account. Everything else
  works unchanged; the upload screen says so plainly instead of failing.

While you are here, under **Email**: leave *Confirm email* on for real use. For
a first look, turning it off lets you register without checking a mailbox.

## 4. Collect the three keys

Project Settings → **API**:

| Value | Goes into |
| --- | --- |
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` |
| `anon` `public` key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `service_role` key | `SUPABASE_SERVICE_ROLE_KEY` |

The `service_role` key bypasses Row Level Security. It goes in the server
environment and nowhere else — never in a `NEXT_PUBLIC_` name, never in the
browser, never in the repository.

## 5. Deploy on Vercel

1. [vercel.com](https://vercel.com) → **Add New → Project** → import this
   repository.
2. **Root Directory: `sonora`.** This is the one setting people miss; the app
   is not at the repository root.
3. Framework preset: Next.js. Leave the build and output settings alone.
4. Environment Variables — add all five:

   ```
   NEXT_PUBLIC_SUPABASE_URL       https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY  eyJ...
   SUPABASE_SERVICE_ROLE_KEY      eyJ...
   NEXT_PUBLIC_SITE_URL           https://your-domain.com
   LISTENER_SALT                  any long random string
   ```

   `NEXT_PUBLIC_SITE_URL` is what share links are built from, so it must be the
   address people will actually receive. If you do not have a custom domain
   yet, use the `*.vercel.app` one Vercel assigns, and change it later.

   `LISTENER_SALT` hashes listener identities for the unique-listener count.
   Any long random value. Changing it later only resets how listeners are
   matched.

5. **Deploy.**

## 6. Point Supabase back at the deployment

Authentication → **URL Configuration**:

- **Site URL**: `https://your-domain.com`
- **Redirect URLs**: add `https://your-domain.com/auth/callback`

Without this, the confirmation e-mail link fails.

## 7. Check it

```bash
npm run smoke -- https://your-domain.com
```

Nine checks: the instance is configured, the home page renders, uploading needs
no account, the dashboard is behind a session, dead links answer 404 rather
than a soft 200, a private stream is refused, the security headers are set, and
`robots.txt` names the right host. It exits non-zero on the first failure, so
it can gate a deploy.

Then do it by hand once, because it is the whole product: upload a track, copy
the link, open it on your phone.

---

## When something is wrong

**The home page loads but nothing works.** `/api/health` returns 503 — an
environment variable is missing. The Vercel function log names which one.

**"Uploading without an account is turned off for this project."** Anonymous
sign-ins are off in Supabase (step 3). Either turn them on, or log in first.

**Uploads fail at 100%.** The storage bucket rejected the file. Check the
`audio` bucket exists and is **private**, and that the file is under 500 MB.
The migration in step 2 creates it; if you ran the migration before creating
the project's storage, run that block again.

**Share links point at localhost.** `NEXT_PUBLIC_SITE_URL` is wrong or unset.
It is read at build time, so change it *and redeploy*.

**The confirmation e-mail link fails.** Step 6.

## Costs to keep an eye on

Audio is heavy and the free tiers are small. What runs out first is Supabase
**storage** and **egress** — every play streams the file. A handful of WAVs
will use more than a lot of MP3s. Watch it in Supabase → Reports.

If you enabled anonymous uploads, that consumption is open to anybody with your
link. Captcha (step 3) is the guard that belongs at that layer.
