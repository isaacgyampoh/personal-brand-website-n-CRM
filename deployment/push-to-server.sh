#!/usr/bin/env bash
# Copies the committed application to the server WITHOUT needing GitHub access on the server,
# using the dedicated deploy key, then runs the deploy script there.
#   SERVER=deploy@<ip-or-host> deployment/push-to-server.sh
set -euo pipefail
: "${SERVER:?SERVER=deploy@host is required}"
KEY="${DEPLOY_KEY:-$HOME/.ssh/brand_platform_deploy_ed25519}"
DEST="${DEST:-/opt/brand-platform}"
cd "$(dirname "$0")/.."
[ -z "$(git status --porcelain)" ] || { echo "Commit your changes first"; exit 1; }
REL="$(git rev-parse --short HEAD)"
git archive --format=tar HEAD | ssh -i "$KEY" -o IdentitiesOnly=yes "$SERVER" "mkdir -p $DEST/releases/$REL && tar -x -C $DEST/releases/$REL && ln -sfn $DEST/releases/$REL $DEST/current && echo $REL > $DEST/current/.release"
echo "Uploaded release $REL. Secrets live in $DEST/shared (create once; see docs/DEPLOYMENT.md)."
ssh -i "$KEY" -o IdentitiesOnly=yes "$SERVER" "cd $DEST/current/deployment && for f in .env.production .env.backup; do ln -sfn $DEST/shared/\$f \$f; done && ln -sfn $DEST/shared/secrets secrets && RELEASE=$REL ./deploy.sh"
