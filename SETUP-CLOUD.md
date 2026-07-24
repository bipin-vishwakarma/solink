# ☁️ Solink — Cloud Setup (Google login + saved history)

Follow these once. Everything here is **free**. When you're done, Solink automatically
switches from Demo mode to Cloud mode (it detects your `.env.local`).

Total time: ~10–15 minutes.

---

## 1. Create a Supabase project
1. Go to https://supabase.com → sign in → **New project**.
2. Name it `solink`, set a database password (save it), pick the nearest region.
3. Wait ~2 min for it to provision.

## 2. Create the database tables
1. In the project, open **SQL Editor** (left sidebar) → **New query**.
2. Open `supabase/schema.sql` from this repo, copy **everything**, paste it in, click **Run**.
3. You should see "Success". This creates `profiles`, `conversations`,
   `conversation_members`, `messages`, all the security rules, and the `get_or_create_dm`
   helper. It also turns on Realtime for `messages`.

## 3. Set up Google login
You need Google OAuth credentials, then paste them into Supabase.

**a) Get your Supabase callback URL**
- In Supabase: **Authentication → Sign In / Providers → Google**. Note the
  **Callback URL (for OAuth)** shown there — it looks like
  `https://<your-ref>.supabase.co/auth/v1/callback`. Copy it.

**b) Create Google credentials**
1. Go to https://console.cloud.google.com → create/select any project.
2. **APIs & Services → OAuth consent screen** → choose **External** → fill app name +
   your email → Save (you can leave it in "Testing" and add your own Google account as a
   test user).
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
   - Application type: **Web application**.
   - **Authorized redirect URIs → Add** the Supabase callback URL from step (a).
   - Create → copy the **Client ID** and **Client secret**.

**c) Paste into Supabase**
- Back in **Authentication → Providers → Google**: toggle **Enabled**, paste the **Client
  ID** and **Client secret**, and **Save**.

## 4. Allow localhost redirects
- In Supabase: **Authentication → URL Configuration**.
  - **Site URL:** `http://localhost:3000`
  - **Redirect URLs → Add:** `http://localhost:3000`
  - Save. (When you deploy later, add your Vercel URL here too.)

## 5. Get your API keys
- Supabase: **Project Settings → API**.
  - Copy **Project URL**.
  - Copy the **anon / public** key (NOT the service_role key).

## 6. Create `.env.local`
In the project root, copy `.env.local.example` to `.env.local` and fill in:

```
NEXT_PUBLIC_SUPABASE_URL=https://<your-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-public-key>
```

## 7. Restart and try it
```bash
npm run dev
```
Open http://localhost:3000 → **Continue with Google** → pick a username → you're in.

To test a real 2-person chat, sign in as **two different Google accounts** (e.g. one in a
normal window, one in an Incognito window), give each a username, then search each other.

---

## Notes / gotchas
- **Env vars only load on server start** — always restart `npm run dev` after editing
  `.env.local`.
- **Same-device history:** your encryption key lives in this browser (IndexedDB). Logging in
  on a brand-new device/browser gives you a fresh key, so old messages there stay encrypted.
  (Cross-device key backup is a future enhancement.)
- **Still end-to-end:** open the `messages` table in Supabase → you'll only ever see
  `ciphertext` and `iv`, never readable text. That's the whole point. 🔒
