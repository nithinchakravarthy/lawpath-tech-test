#!/usr/bin/env bash
set -euo pipefail

# Requires: curl, jq, serverless CLI (npx serverless)
command -v jq >/dev/null || { echo "jq not found. On macOS: brew install jq"; exit 1; }

# Determine API base: use $API_BASE if provided, otherwise read from 'serverless info'
API_BASE="${API_BASE:-$(npx serverless info -s dev --verbose | awk '/ServiceEndpoint:/{print $2}')}"
API_BASE="${API_BASE%/}"  # trim any trailing slash
if [[ -z "$API_BASE" ]]; then
  echo "Could not determine API base. Set API_BASE env var and re-run."; exit 1
fi
echo "API_BASE=$API_BASE"

TMP="data-sample.json"
echo "⬇️  Downloading sample events..."
curl -fsS -o "$TMP" https://lawpath.github.io/lawpath-tech-test/sample-events.json

echo "🚚 Posting events to $API_BASE/events ..."
i=0
jq -c '.[]' "$TMP" | while read -r row; do
  curl -s -X POST "$API_BASE/events" \
    -H "Content-Type: application/json" \
    -d "$row" >/dev/null || true
  i=$((i+1))
  if (( i % 20 == 0 )); then echo "…loaded $i"; fi
done
echo "✅ Loaded $i events."
