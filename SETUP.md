# Get your own Finance Tracker

There are two ways to use this. Pick one.

| | Just try it | Your own copy |
| --- | --- | --- |
| What you do | Open the link | About 20 minutes of setup, once |
| Link | https://finance-tracker-template.vercel.app | Your own address, like `my-money.vercel.app` |
| Login | None | Your own email and password |
| Where your data lives | Only in that one browser | Your own free database |
| Same data on phone and laptop | No | Yes |
| Cost | Free | Free |

**Just trying it?** Open https://finance-tracker-template.vercel.app and start. Nothing else to do.
Your entries stay in that browser only: clearing the browser, or opening it on another
device, starts empty again.

**Want it for real, synced on your phone and laptop?** Follow the guide below. You'll
end up with your own website and your own database. Nobody else, including whoever
made this template, can see your data.

---

## What you need

All free:

1. A **GitHub** account: https://github.com/signup
2. A **Supabase** account (your database): https://supabase.com, sign in with GitHub
3. A **Vercel** account (puts your site online): https://vercel.com, sign in with GitHub

You do **not** need to install anything on your computer for the steps below.

---

## Step 1. Make your own copy of the code

1. Open https://github.com/Peterachss/finance-tracker-template
2. Click the green **Use this template** button, then **Create a new repository**.
3. Give it a name (for example `my-money`), choose **Private**, and click **Create repository**.

You now have your own copy. Changes you make there never affect anyone else.

## Step 2. Create your database (Supabase)

1. Go to https://supabase.com/dashboard and click **New project**.
2. Pick any name, set a database password (save it somewhere), choose the region
   closest to you, and click **Create new project**. Wait a minute while it starts.
3. In the left menu open **SQL Editor**.
4. In your GitHub copy, open the folder `supabase/migrations`. There are 4 files.
   For **each file, in this order**:
   - `0001_init.sql`
   - `0002_idempotent_batch.sql`
   - `0003_revoke_handle_new_user_rpc.sql`
   - `0004_planning_tables.sql`

   open it on GitHub, click the **Copy raw file** button, paste it into a new
   Supabase SQL query, and click **Run**. Each one should say *Success*.
5. Get your two keys: open **Project Settings → API Keys** (or **Settings → API**).
   Copy and keep:
   - **Project URL**, like `https://abcdxyz.supabase.co`
   - **Publishable key**, starts with `sb_publishable_` (older projects: the **anon** key)

> ⚠️ Never use the **service_role** / **secret** key anywhere. This app does not need it,
> and it gives full access to your database.

## Step 3. Put the site online (Vercel)

1. Go to https://vercel.com/new and import the GitHub repository you made in Step 1.
2. Before clicking Deploy, open **Environment Variables** and add these two:

   | Name | Value |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | your Project URL from Step 2 |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | your Publishable (or anon) key from Step 2 |

   Do **not** add `NEXT_PUBLIC_DEMO`. That variable is only for the public try-it site.
3. Click **Deploy** and wait about two minutes. Vercel gives you your site address,
   like `https://my-money.vercel.app`. Copy it.

## Step 4. Tell Supabase about your site

1. In Supabase open **Authentication → URL Configuration**.
2. Set **Site URL** to your Vercel address from Step 3.
3. Under **Redirect URLs** add the same address followed by `/**`, for example
   `https://my-money.vercel.app/**`. Save.

## Step 5. Create your login

1. Open your site, tap **Create an account** (under the sign-in button), enter your email and a password, and tap **Create account**.
2. Supabase emails you a confirmation link. Open it, then sign in.
   (No email? Check spam. Or in Supabase go to **Authentication → Users** and confirm the
   user there.)

That's it. You start with Cash and Bank transfer accounts at 0 and the default
categories. Change the currency in **Settings**.

## Step 6 (optional). Put it on your iPhone home screen

1. Open your site in **Safari** and sign in.
2. Tap **Share → Add to Home Screen**.

It opens like an app and stays signed in.

---

## Using Codex, Claude Code or another AI coding tool

You can hand the setup or later changes to an AI coding agent. Give it **your own copy**
of the repository (from Step 1), not this template. Then paste this:

```text
This is my own copy of the Finance Tracker template (Next.js 16 + Supabase).
Read README.md and SETUP.md first.

Help me set it up and run it:
1. Run `npm install`, then copy `.env.example` to `.env.local`.
2. Ask me for my Supabase Project URL and Publishable key and put them in `.env.local`.
   Never ask for, store or use the service_role / secret key.
3. Remind me to run the 4 SQL files in supabase/migrations, in number order, in the
   Supabase SQL Editor, if I haven't yet.
4. Run `npm test`, then `npm run dev`, and tell me the local address to open.
5. Do not commit `.env.local` or any key to git.

When I ask for changes later, keep the existing design, run `npm test` and
`npx tsc --noEmit` before telling me it's done, and push to my main branch so
Vercel redeploys.
```

**Do people just copy the link?**
- **The try-it link** (`finance-tracker-template.vercel.app`): yes, just open it. It's a
  shared demo, and each person's entries stay in their own browser.
- **The GitHub link**: don't paste it into an AI tool and edit it there. Make your own
  copy with **Use this template** (Step 1) and give your tool that copy. You can't change
  the original, and your keys belong only in your own copy's Vercel settings.

---

## Run it on your own computer (optional, for developers)

```bash
git clone https://github.com/<you>/<your-repo>.git
cd <your-repo>
npm install
cp .env.example .env.local   # then fill in the two Supabase values
npm run dev                  # http://localhost:3000
```

To try it with no database at all: `npm run dev:demo`.

## Something isn't working

| Problem | Fix |
| --- | --- |
| The site says "Supabase is not configured" | The two environment variables are missing in Vercel. Add them (Step 3), then **Deployments → ⋯ → Redeploy**. |
| Sign-in says the email isn't confirmed | Open the confirmation email, or confirm the user in Supabase **Authentication → Users**. |
| Sign-in or the email link goes to the wrong site | Fix the **Site URL** and **Redirect URLs** in Step 4. |
| "relation … does not exist" or a tab shows a setup message | One of the 4 SQL files wasn't run. Run any missing ones in order (Step 2). |
| You only see an empty demo, never a login page | You added `NEXT_PUBLIC_DEMO`. Remove it in Vercel and redeploy. |
