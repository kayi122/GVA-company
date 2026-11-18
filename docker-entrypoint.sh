#!/bin/sh
# Starts GVA Sales Pipeline inside the container.
# Hosting disks (Render, Docker volumes) are often owned by root: fix ownership once,
# then run the app as the unprivileged "node" user.
set -e

mkdir -p /data/uploads /data/backups
if [ "$(id -u)" = "0" ]; then
  chown -R node:node /data
  exec setpriv --reuid=node --regid=node --init-groups "$0" "$@"
fi

# 1) create/upgrade database tables  2) first-run admin + permissions  3) start the server
npx prisma db push --skip-generate --schema server/prisma/schema.prisma
node server/prisma/init-prod.js
exec node server/src/index.js
