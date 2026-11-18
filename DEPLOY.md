# Host GVA Sales Pipeline on Vercel

The app runs on **Vercel**, with three parts that Vercel connects for you:

| Part | Service | Holds |
|---|---|---|
| Website + API | **Vercel** (project from this GitHub repo) | The app itself; redeploys on every push to `main` |
| Database | **Neon Postgres** (Vercel → Storage) | Customers, payments, users… |
| Files | **Vercel Blob** (Vercel → Storage) | Installation photos and backups, **encrypted** by the app |

**Plan:** Vercel's free *Hobby* plan is for **personal, non-commercial** use only. GVA is a company, so use **Vercel Pro ($20/month per member)**. Neon's free plan (0.5 GB) and the Blob storage included with Pro are enough to start.

Allow about 20 minutes.

---

## 1. Email for sign-in codes (Gmail)
1. Use a dedicated Gmail address (for example `gva.sales.noreply@gmail.com`) and turn on **2-Step Verification**.
2. Go to **https://myaccount.google.com/apppasswords** → create **a new** app password called "GVA" → keep the 16 letters for step 3. Never paste it in chats or code.

## 2. Two secret keys
On your computer, in a terminal, run this **twice** and keep both results (one for `JWT_SECRET`, one for `CRON_SECRET`):
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 3. Create the Vercel project
1. Go to **https://vercel.com** → **Sign up with GitHub** (the `kayi122` account) → choose the **Pro** plan.
2. **Add New… → Project** → import **GVA-company**.
3. Leave *Framework Preset* = **Other** and *Root Directory* = `./`. The build settings come from `vercel.json`.
4. Open **Environment Variables** and add:

   | Name | Value |
   |---|---|
   | `JWT_SECRET` | first key from step 2 |
   | `CRON_SECRET` | second key from step 2 |
   | `SMTP_HOST` | `smtp.gmail.com` |
   | `SMTP_PORT` | `587` |
   | `SMTP_USER` | the Gmail address |
   | `SMTP_PASS` | the 16-letter app password (no spaces) |
   | `MAIL_FROM` | `GVA Sales <the Gmail address>` |
   | `INITIAL_ADMIN_EMAIL` | the admin's real email |
   | `INITIAL_ADMIN_PASSWORD` | a strong password, 12+ characters |

5. Click **Deploy**. **This first deploy will fail** ("DATABASE_URL" missing). That's expected: the database is created next.

## 4. Add the database and file storage
In the project → **Storage** tab:
1. **Create Database → Neon (Postgres)** → region **Frankfurt (eu-central-1)**, the closest to Rwanda → **Create** → connect it to the project for **all environments**. This adds `DATABASE_URL` and `DATABASE_URL_UNPOOLED` automatically.
2. **Create → Blob** → name `gva-files` → connect to the project. This adds `BLOB_READ_WRITE_TOKEN`.
3. Go to **Deployments** → on the failed deployment, click **⋯ → Redeploy**.

The build now creates the tables and the admin account. When it shows **Ready**, click **Visit**.

## 5. First sign-in
1. Sign in as **`admin`** with your password and the code sent by email.
2. **My profile → change the password.** Then in Vercel → **Settings → Environment Variables**, delete `INITIAL_ADMIN_PASSWORD`.
3. Set up, in this order:
   1. **System & backups → Send test email**
   2. **Packages:** real prices
   3. **Inventory:** stock and the standard kit
   4. **Users:** supervisors, then agents, finance, operations and technicians
   5. **Targets**

## Your own address (optional)
Vercel → project → **Settings → Domains** → add `sales.yourdomain.rw` → add the DNS record Vercel shows. HTTPS is automatic.

## How things work on Vercel
- **Updates:** every push to `main` builds and deploys. Database changes are applied during the build.
- **Visit reminders:** sent while anyone has the app open, because the app checks every 30 seconds. There are no background servers on Vercel.
- **Daily backup:** a Vercel Cron job at **02:00 Kigali** saves an encrypted backup to Blob. See **System & backups**, and download one weekly to keep off-site.
- **Photos:** compressed on the phone, uploaded one at a time, and stored encrypted. Only people allowed to see that customer can view them, through the app.
- **Going back in time:** Neon can restore the database to an earlier moment: Vercel → Storage → the database → **Open in Neon → Restore**. A downloaded backup can also be loaded with `npm run restore -w server -- <file>.zip --yes`, with the production `DATABASE_URL` put in `server/.env`.

> **Never change `JWT_SECRET`** once the app is in use. It also unlocks the encrypted photos and backups (unless you set a separate `FILE_ENCRYPTION_KEY` from the start).

## If something goes wrong
| What you see | Fix |
|---|---|
| Build log: `Environment variable not found: DATABASE_URL` | Step 4 isn't done. Connect the Neon database, then redeploy. |
| Build log: `First start: set INITIAL_ADMIN_EMAIL…` | Add both admin variables (password 12+ characters), then redeploy. |
| Site shows "Something went wrong" at sign-in | Vercel → **Logs**. If it says `SMTP_HOST is required`, add the email variables, then redeploy. |
| No code arrives | Check spam. `SMTP_PASS` must be the **app password**. Then **System → Send test email**. |
| Anything else | Copy the last 30 lines of the build log or Logs, **without any passwords**, and send them to me. |

---

## Running on your computer (development)
```bash
npm install
npm run setup   # local Postgres (no install needed), tables, demo data
npm run dev     # app on http://localhost:5173
```
