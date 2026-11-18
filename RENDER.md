# Host GVA Sales Pipeline on Render

About 15 minutes. Cost: **Starter plan ($7/month) + 1 GB disk (~$0.25/month)**. The disk keeps the database and photos; the free plan has no disk and loses everything on each restart.

## 1. Prepare the email account (5 min)
The app emails a 6-digit code at every sign-in, so it needs an account that can send mail.

**With Gmail** (use a dedicated address, for example `gva.sales.noreply@gmail.com`):
1. Sign in to that Gmail account → **Google Account → Security** → turn on **2-Step Verification**.
2. Open **https://myaccount.google.com/apppasswords** → create an app password named "GVA" → copy the **16-letter password**.

You will need:
| Setting | Value for Gmail |
|---|---|
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_USER` | the Gmail address |
| `SMTP_PASS` | the 16-letter app password (no spaces) |
| `MAIL_FROM` | `GVA Sales <the Gmail address>` |

## 2. Create the service on Render
1. Go to **https://render.com** → sign up **with GitHub** (the account that owns `kayi122/GVA-company`).
2. Add a payment method (**Account → Billing**). The disk needs a paid plan.
3. **New + → Blueprint** → connect GitHub if asked → choose **GVA-company** → **Connect**.
4. Render reads `render.yaml` and asks for the secret values:
   - `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`: from step 1.
   - `INITIAL_ADMIN_EMAIL`: the admin's real email (the sign-in code goes there).
   - `INITIAL_ADMIN_PASSWORD`: a strong password, **at least 12 characters**.
5. Click **Apply**. The first build takes about 5–8 minutes. Follow it under **Logs**.
   When it's ready you will see `API ready … (production)`.

## 3. First sign-in
1. Open the address Render shows (for example `https://gva-sales-pipeline.onrender.com`).
2. Sign in as **`admin`** with the password from step 2.4 and the code that arrives by email.
3. **My profile → change the password.** Then, in Render, go to **Environment** → delete `INITIAL_ADMIN_PASSWORD` → **Save** (it's only used on the very first start).
4. Set up, in this order:
   1. **System & backups → Send test email**
   2. **Packages:** the real prices
   3. **Inventory:** stock items and the standard kit
   4. **Users:** supervisors first, then agents, finance, operations and technicians
   5. **Targets**

## Updating the app
Every push to the `main` branch on GitHub redeploys automatically. The data on the disk is kept. Users may see 1–2 minutes of downtime during a deploy.

## Your own address (optional)
Render → the service → **Settings → Custom Domains → Add** `sales.yourdomain.rw`, then add the DNS record Render shows. HTTPS is automatic.

## Backups on Render
- The app makes a daily backup on the disk (see **System & backups**). Render also snapshots disks daily (**Disks** tab).
- **Download a backup at least once a week** from **System & backups** and keep it off Render.
- **To go back in time on Render:** the service → **Disks → Snapshots** → pick a day → **Restore**. This is the simplest way.
- The downloaded `.zip` backups are your safety copy if you ever leave Render. They can be restored on any server with `npm run restore -w server -- <file>.zip` (see DEPLOY.md).

## If something goes wrong
| What you see in **Logs** | Fix |
|---|---|
| `SMTP_HOST is required in production` | Add the email settings under **Environment**, then **Manual Deploy**. |
| `First start: set INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD` | Add both (password 12+ characters), then redeploy. |
| No code arrives at sign-in | Check spam. For Gmail, `SMTP_PASS` must be the **app password**, not the normal one. |
| Build failed | Copy the last 30 lines of the log and send them to me. |
