# GVA Sales Pipeline Management System

Field sales → payment → finance → installation pipeline for GVA (FTTH internet).

**Phase 1 (done):** sign-in with password plus an email code, roles and permissions, admin user management, teams, audit log, profile, light/dark theme.

**Phase 2 (done):** customers and field visits.
- Agents add a customer with a 4-step form: contact → location (with GPS) → conversation (current ISP, monthly spend, satisfaction, **Cold / Warm / Hot**) → next visit.
- The same phone number can't be registered twice. Phone numbers are normalised to `07XXXXXXXX`.
- Each customer page has Call, WhatsApp and Map buttons, a visit history, and Log visit (changes Hot/Warm/Cold), Book visit and Edit.
- Visits calendar (month view) with a list of overdue visits. Reminders appear in the bell an hour before each visit and can also pop up as browser alerts.
- Who sees what: agents see only their own customers, supervisors see their team's customers (read-only), and finance, operations and admin see everyone.
- Dashboards: agents get big quick-action buttons and today's numbers. Supervisors get their team pipeline and agent ranking.
- `npm run seed` adds about 350 demo customers on a fresh database.

**Phase 3 (done):** targets and reports.
- **Targets:** monthly goals per agent for new leads, visits and sales. Supervisors set them for their own team and admins for everyone. You can set the same value for everyone or copy last month. A team's target is the sum of its agents' targets.
- **Dashboards:** progress rings for "My target" (agent) or "Team target" (supervisor) that say whether you're on track for the days passed, plus how many agents are on track.
- **Reports page:** quick periods (today, this week, last month, …) or custom dates, with team and agent filters. It shows totals, a daily or weekly chart (with a table view), current-provider and district breakdowns, a team comparison (company-wide users) and an agent table you can sort.
- **Downloads:** Excel with Summary, By agent, By team, Customers and Visits sheets, and a PDF summary (landscape A4). Every export is written to the audit log.

**Phase 4 (done):** payments, finance, operations, technicians and inventory.
- **Payment flow:** the agent records a payment (package, amount, MoMo/Airtel/bank/cash, transaction ID). Their **supervisor confirms** it, then **finance reconfirms** it, and an installation order goes to operations. Either of them can **reject with a reason**; the agent fixes it and sends it again. A transaction ID can only be used once.
- **Stage tracker on every customer:** Lead → Paid → Confirmed → Scheduled → Connected.
- **Operations:** an installation board (waiting, scheduled, in progress, installed). Assigning a technician with a date and the **standard kit** (router, ONT, cable, connectors…) deducts the materials from stock.
- **Technicians:** a phone-friendly "My jobs" list with Call and Directions buttons, Start job, **photo evidence (at least 2, taken with the camera and shrunk before upload)**, router serial number, the name of the person who received the installation, and Complete. A job with a problem can be put on hold with a reason.
- **Inventory:** stock levels with low-stock alerts, receive stock, returns, count corrections with a reason, and the full movement history per item.
- **Packages:** admin and finance manage packages and prices. The 4 seeded packages are **examples**.
- **Notifications** at every step: supervisor → finance → operations → technician → agent.
- Reports now count **sales = payments confirmed by finance** and show revenue.
- Photos are stored in `server/uploads/` (not in git), and only people involved with that customer can view them.

**Phase 5 (done):** backups, production readiness and polish.
- **Backups:** the database and all photos go into one .zip. There is a daily automatic backup (time and number kept are set under **System & backups**), plus Back up now, Download and Delete. Admins are notified if a backup fails. From the command line: `npm run backup -w server` and `npm run restore -w server -- <file.zip>` (the restore saves the current data first).
- **Security:** changing or resetting a password, disabling an account or changing a role signs that user out on every device. Strict security headers are on, and sign-in limits count only failed attempts per account. In production the server refuses to start without a strong secret and working email, and shows a clear message if email is down.
- **Production:** `Dockerfile` + `docker-compose.yml` with Caddy for automatic HTTPS, and `.env.production.example`. A first-run script creates only the admin (no demo data). Step-by-step guide in **[DEPLOY.md](DEPLOY.md)**.
- **Polish:** installable on phones (Add to Home Screen, app icon, shortcuts), pages load on demand (smaller first download), an offline banner, a friendly error screen, and an automatic reload after an update.

## Run it (on your computer)

Requires Node.js 20+.

```bash
npm install
npm run setup     # creates server/.env, the database and demo users
npm run dev       # API on :4000, app on http://localhost:5173
```

## Demo accounts

`npm run setup` creates 61 users. Their passwords are in `server/.env`:

| Username | Role | Password variable |
|---|---|---|
| `admin` | Admin | `SEED_ADMIN_PASSWORD` |
| `supervisor1` … `supervisor5` | Supervisors (10 agents each) | `SEED_DEMO_PASSWORD` |
| `agent1` … `agent50` | Sales agents | `SEED_DEMO_PASSWORD` |
| `finance`, `operations`, `tech1` … `tech3` | Other roles | `SEED_DEMO_PASSWORD` |

## Email sign-in codes

Every sign-in needs a 6-digit code sent to the user's email. The code expires after 10 minutes and allows 5 tries.
While `SMTP_HOST` in `server/.env` is empty, the app is in **test mode**: the code is printed in the server console and shown on the sign-in screen.
To send real emails, fill in `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `MAIL_FROM` (for example a Gmail app password), then restart.

## Project layout

```
server/   Express API · Prisma (SQLite) · prisma/schema.prisma · src/permissions.js (roles & default rights)
client/   React + Vite + Tailwind · src/pages/* · src/components/*
```

## Put it online

**Easiest: [RENDER.md](RENDER.md)** (hosted from this GitHub repo). Own server: **[DEPLOY.md](DEPLOY.md)**: Docker or Node + PM2 + Nginx, HTTPS, email, backups and restore.
