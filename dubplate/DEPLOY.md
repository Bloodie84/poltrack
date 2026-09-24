# Putting Dubplate online

**The short way: two tokens and one button.** Everything below that is the
manual route, kept for when you want to understand or repair what the button
does.

---

## The one-run route

`.github/workflows/bootstrap.yml` creates the Supabase project, applies the
schema, switches on anonymous sign-ins, creates the Vercel project pointed at
this repository, sets its environment variables and deploys — in a single
manual run. It needs two tokens, and nothing else.

1. **Supabase token** — [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens)
   → *Generate new token*. (Signing in with GitHub is enough; no card.)
2. **Vercel token** — [vercel.com/account/tokens](https://vercel.com/account/tokens)
   → *Create Token*.
3. Put both in this repository at **Settings → Secrets and variables → Actions
   → New repository secret**, under exactly these names:

   ```
   SUPABASE_ACCESS_TOKEN
   VERCEL_TOKEN
   ```

   A third, `SUPABASE_DB_PASSWORD`, is needed **only** when re-running against a
   Supabase project that already exists: a project's database password cannot be
   read back after it is created, so a second run has no way to reach the
   database without being told it. The run stops and says so rather than failing
   later on an authentication error.

4. **Actions** tab → **Set everything up** → *Run workflow*. Pick a region
   (`eu-west-3` is Paris), leave the branch as it is, and go.

   The workflow file lives on the default branch because that is the only place
   GitHub reads *Run workflow* from; the application does not, which is why the
   run takes the branch as an input and checks that out.

It takes five to ten minutes, most of which is Supabase provisioning the
database. The run summary ends with the URL.

One thing it cannot do for you: in the Supabase dashboard, **Authentication →
URL Configuration**, add `<your-url>/auth/callback` to the redirect URLs, so
confirmation e-mails come back to the right place.

> Honest caveat: this workflow talks to the Supabase and Vercel REST APIs, and
> it was written in an environment with no network route to either, so it has
> never been run against them. It has been read as carefully as it can be
> without running — shell-linted, its URL building tested both with and without
> a team, and the places where an API's answer might not be what was assumed
> now stop the run with a message rather than carrying on — but the first run
> may still trip over a detail. The log says where, and fixing it is a small
> edit rather than a reason to fall back to the manual route.

The Vercel project is deliberately **not** linked to the repository: Vercel
would then build the default branch on every push, and the application is not on
it. Re-run this workflow to ship a change, or connect the repository in the
Vercel project and set its production branch to the one holding the app.

---

## The GitHub route

`.github/workflows/deploy.yml` builds, ships and then smoke-tests the
deployment on every push to this branch. It is inert until three repository
secrets exist, and says which are missing instead of failing red — so arming it
is the whole job.

1. **A token**: [vercel.com/account/tokens](https://vercel.com/account/tokens) →
   create one.
2. **The project and org ids**: run `npx vercel link` once inside `dubplate/`
   (it writes `.vercel/project.json` with both), or read them in the dashboard —
   Project Settings → General → *Project ID*, and Account/Team Settings →
   *Team ID*.
3. **Add them** at Settings → Secrets and variables → Actions → *New repository
   secret*, exactly these names:

   ```
   VERCEL_TOKEN
   VERCEL_ORG_ID
   VERCEL_PROJECT_ID
   ```

4. The Supabase keys do **not** go on GitHub. Set them once in the Vercel
   project's environment variables (step 5 below); the workflow fetches them
   with `vercel pull`.

Push anything, or run the workflow by hand from the Actions tab, and it
deploys. If the site does not answer correctly afterwards, the run goes red —
a deploy that builds but does not work is a failed deploy.

`.github/workflows/ci.yml` runs alongside it on every push: types, lint, the 29
SQL security assertions against a real PostgreSQL, and the 30 browser tests
end to end.

---

## The terminal route

```bash
cd dubplate
npm install

npx supabase login                    # opens a browser, stores a token
npx supabase projects create dubplate   # or skip, and use a project you have
npx supabase link --project-ref <ref> # the ref is in the project URL

npx supabase db push                  # creates the schema (step 2 below)

export SUPABASE_SITE_URL=https://your-domain.com
export SUPABASE_REDIRECT_URL=https://your-domain.com/auth/callback
npx supabase config push              # anonymous uploads + redirect URLs
                                      # (steps 3 and 6 below)

npx supabase projects api-keys --project-ref <ref>   # the keys for step 5
```

`supabase/config.toml` is version-controlled, so `config push` also carries the
things that are easy to forget: anonymous sign-ins on, the anonymous rate limit,
a 500 MB storage ceiling that matches the audio bucket, and a minimum password
length that agrees with the interface.

Then deploy: `npx vercel --cwd dubplate`, or step 5 below in the dashboard.

---

## The click route

### 1. Create the Supabase project

1. [supabase.com](https://supabase.com) → **New project**.
2. Pick a region close to your listeners — it is where the audio will be
   served from.
3. Save the database password it gives you.

Wait for the project to finish provisioning.

### 2. Create the schema

Supabase dashboard → **SQL Editor** → **New query**, paste, **Run**.

Either paste the files in `supabase/migrations/` one at a time in filename
order, or paste the whole schema in one go:

```bash
cat supabase/migrations/*.sql | pbcopy      # macOS
cat supabase/migrations/*.sql | xclip -sel c # Linux
```

That creates five tables, thirteen Row Level Security policies and the two
storage buckets. Running it again changes nothing — every statement is written
to be re-runnable — so it is safe to paste twice if you lose track.

There is no output to read: if a statement fails, the editor says so in red.

*(With the Supabase CLI linked to the project, `supabase db push` does the same
thing.)*

### 3. Decide about anonymous uploads

Authentication → **Sign In / Providers**:

- **Anonymous sign-ins ON** — anyone can upload without registering. This is
  the product as designed, and what `supabase config push` sets. Supabase caps
  anonymous sign-ins per IP per hour (30, in `config.toml`); add **Captcha** in
  the same screen if the link is going somewhere public.
- **Anonymous sign-ins OFF** — uploading requires an account. Everything else
  works unchanged; the upload screen says so plainly instead of failing.

While you are here, under **Email**: leave *Confirm email* on for real use. For
a first look, turning it off lets you register without checking a mailbox.

### 4. Collect the three keys

Project Settings → **API**:

| Value | Goes into |
| --- | --- |
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` |
| `anon` `public` key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `service_role` key | `SUPABASE_SERVICE_ROLE_KEY` |

The `service_role` key bypasses Row Level Security. It goes in the server
environment and nowhere else — never in a `NEXT_PUBLIC_` name, never in the
browser, never in the repository.

### 5. Deploy on Vercel

1. [vercel.com](https://vercel.com) → **Add New → Project** → import this
   repository.
2. **Root Directory: `dubplate`.** This is the one setting people miss; the app
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

### 6. Point Supabase back at the deployment

Authentication → **URL Configuration**:

- **Site URL**: `https://your-domain.com`
- **Redirect URLs**: add `https://your-domain.com/auth/callback`

Without this, the confirmation e-mail link fails.

### 7. Check it

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
