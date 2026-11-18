# Putting GVA Sales Pipeline online

This guide takes the app from your computer to a server your 60+ staff can open from their phones at an address like `https://sales.gva.rw`.

## What you need

| Item | Recommendation |
|---|---|
| **Server** | A small Linux VPS (Ubuntu 22.04/24.04): 1–2 vCPU, **2 GB RAM, 40 GB disk**. Any provider works (a local Rwandan host, or DigitalOcean, Hetzner, AWS Lightsail, …). |
| **Domain** | A sub-domain such as `sales.gva.rw`, with a DNS **A record** pointing to the server's IP address. |
| **Email account** | SMTP details, to send sign-in codes. Gmail works (needs an *app password*), or the company mail server / an email service (Brevo, Mailgun, Amazon SES…). |

> **Why SQLite and not a separate database server?** About 60 users, a few hundred customers a month and a few thousand visits is a small load for SQLite. The app runs it in WAL mode, so reads continue while writes happen. Everything (database + photos) is in one folder, so it's easy to back up. Move to PostgreSQL only if you grow to hundreds of simultaneous users; that is a schema change, not a rewrite.

---

## Option A — Docker (recommended)

Docker runs the app plus **Caddy**, which gets and renews the HTTPS certificate automatically.

### 1. Prepare the server (once)
```bash
# on the server, as a sudo user
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # log out and back in after this
```

### 2. Copy the project and fill in the settings
Copy the `canalbox` folder to the server (for example with `git clone` or `scp`), then:
```bash
cd canalbox
cp .env.production.example .env.production
nano .env.production
```
Fill in:
- `DOMAIN`: your domain.
- `JWT_SECRET`: generate it with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` or `openssl rand -hex 32`.
- `SMTP_*` and `MAIL_FROM`: the email details.
- `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD` (12+ characters): the first admin account.

### 3. Start
```bash
docker compose up -d --build
docker compose logs -f app     # watch it start; Ctrl+C to stop watching
```
Open `https://your-domain`. Sign in as `admin` with the email code. Then:
1. **My profile → change the password**, then delete `INITIAL_ADMIN_PASSWORD` from `.env.production`.
2. **System & backups → Send test email** to check that email works.
3. **Packages**: add GVA's real packages and prices. Agents can't record payments until at least one package exists.
4. **Inventory**: add your stock items (router, ONT, cable…) and set "used per installation" for the standard kit.
5. **Users**: create the supervisors first, then the agents (choosing their supervisor), finance, operations and technicians.
6. **Targets**: set this month's targets.

### Everyday commands
```bash
docker compose ps                          # is it running?
docker compose logs --tail 100 app         # recent log
docker compose restart app                 # restart
git pull && docker compose up -d --build   # install an update (data is kept)
```

---

## Option B — Without Docker (Node + PM2 + Nginx)

```bash
# Node 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs nginx
sudo npm install -g pm2

cd canalbox
npm ci
npm run build
cp server/.env.example server/.env && nano server/.env
```
In `server/.env`, set:
- `JWT_SECRET` and the SMTP details.
- `DATABASE_URL="file:/var/lib/gva/gva.db"`, `UPLOAD_DIR=/var/lib/gva/uploads`, `BACKUP_DIR=/var/lib/gva/backups`.
- `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD`.
- `TZ=Africa/Kigali`.

Then:
```bash
sudo mkdir -p /var/lib/gva && sudo chown $USER /var/lib/gva
npm run db:push -w server
cd server && node --env-file=.env prisma/init-prod.js && cd ..
NODE_ENV=production pm2 start "npm start" --name gva && pm2 save && pm2 startup
```
Nginx site (`/etc/nginx/sites-available/gva`), then get HTTPS with `sudo apt install certbot python3-certbot-nginx && sudo certbot --nginx`:
```nginx
server {
  server_name sales.gva.rw;
  client_max_body_size 90m;
  location / {
    proxy_pass http://127.0.0.1:4000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

---

## Backups

- **Automatic:** every day at 02:00 by default. A backup holds the database **and** all installation photos. Change the time and how many to keep under **System & backups**. Admins get a notification if a backup fails.
- **Manual:** use **Back up now** on the same page, or run `npm run backup -w server`.
- **Keep a copy somewhere else.** A backup on the same server doesn't help if the server is lost. At least weekly, **Download** the newest backup to another computer or cloud drive, or copy the folder automatically:
  ```bash
  # Docker: backups are in the gva-data volume
  docker compose cp app:/data/backups ./gva-backups
  ```

### Restoring
1. Stop the app: `docker compose stop app` (or `pm2 stop gva`).
2. Restore. The current data is saved first, just in case.
   ```bash
   # Docker
   docker compose run --rm app node server/scripts/restore.js /data/backups/gva-backup-YYYYMMDD-HHMMSS-auto.zip
   # Without Docker
   npm run restore -w server -- /var/lib/gva/backups/gva-backup-YYYYMMDD-HHMMSS-auto.zip
   ```
3. Start again: `docker compose start app` (or `pm2 start gva`).

---

## Security already built in

- Sign-in with password **plus a 6-digit email code**. Codes expire after 10 minutes and allow 5 tries. Failed attempts are rate-limited per account.
- Changing or resetting a password, disabling an account or changing a role **signs that user out on every device**.
- Each role sees only what it should: agents see their own customers, supervisors their team. Photos are visible only to the people involved with that customer.
- HTTPS-only cookies, strict security headers (Content-Security-Policy, HSTS) in production, and an audit log of every important action.
- In production, the server refuses to start without a strong `JWT_SECRET` and working email settings.

## Troubleshooting

| Problem | Fix |
|---|---|
| Server stops at start with "SMTP_HOST is required" | Fill in the SMTP settings. Production needs email for sign-in codes. |
| "First start: set INITIAL_ADMIN_EMAIL…" | Add the admin email and password to the settings and start again. |
| No sign-in email arrives | **System → Send test email**. Check the spam folder. For Gmail, use an *app password*, not the normal password. |
| HTTPS certificate is not issued | The domain's A record must point to this server, and ports 80 and 443 must be open in the firewall. |
| Phone shows an old version after an update | Close and reopen the app. It reloads itself automatically if it notices it's out of date. |
