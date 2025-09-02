#!/usr/bin/env bash
set -euo pipefail

# -------- Config --------
STAGE="${STAGE:-dev4}"
AWS_URL="${AWS_URL:-http://localhost:4566}"
QDRANT_URL="${QDRANT_URL:-http://localhost:6333}"
USER_ID="${USER_ID:-user_test}"
COMPANY_ID="${COMPANY_ID:-comp_test}"
TABLE_NAME="EventsTable-${STAGE}"
BUCKET_NAME="events-bucket-${STAGE}"
TOPIC_ARN="arn:aws:sns:us-east-1:000000000000:events-topic-${STAGE}"
STACK_PREFIX="lawpath-tech-test-${STAGE}"

# -------- Helpers --------
need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing: $1"; exit 1; }; }
log()  { printf "\n=== %s ===\n" "$*"; }
awsls(){ aws --endpoint-url="$AWS_URL" --cli-binary-format raw-in-base64-out "$@"; }

# -------- Preflight --------
need docker
need jq
need curl
need aws
need npx

export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_REGION=us-east-1
export AWS_PAGER=""

log "Starting docker services"
if command -v docker-compose >/dev/null 2>&1; then
  docker-compose up -d
else
  docker compose up -d
fi

log "Waiting for LocalStack on $AWS_URL"
for i in {1..60}; do
  if curl -fsS "$AWS_URL/health" >/dev/null; then break; fi
  sleep 1
  if [[ $i -eq 60 ]]; then echo "LocalStack not ready"; exit 1; fi
done

log "Waiting for Qdrant on $QDRANT_URL"
for i in {1..60}; do
  if curl -fsS "$QDRANT_URL/collections" >/dev/null; then break; fi
  sleep 1
  if [[ $i -eq 60 ]]; then echo "Qdrant not ready"; exit 1; fi
done

log "Serverless deploy (${STAGE})"
npx serverless deploy -s "$STAGE"

log "Ensure S3 bucket exists: s3://$BUCKET_NAME"
awsls s3 mb "s3://$BUCKET_NAME" || true

log "Grant SNS -> Lambda invoke permission (LocalStack quirk)"
for f in ${STACK_PREFIX}-dynamoWorker ${STACK_PREFIX}-s3Worker ${STACK_PREFIX}-vectorWorker; do
  awsls lambda add-permission \
    --function-name "$f" \
    --statement-id "sns-invoke-$f" \
    --action lambda:InvokeFunction \
    --principal sns.amazonaws.com \
    --source-arn "$TOPIC_ARN" || true
done

log "Create/verify Qdrant collection 'events' (size=4, Cosine)"
curl -fsS -X PUT "$QDRANT_URL/collections/events" \
  -H "content-type: application/json" \
  -d '{"vectors":{"size":4,"distance":"Cosine"}}' >/dev/null || true
curl -fsS "$QDRANT_URL/collections/events" | jq '.result | {status, points_count}' || true

log "Discover API base"
API_BASE="$(npx serverless info -s "$STAGE" --verbose | awk '/ServiceEndpoint:/{print $2}')"
echo "API_BASE=$API_BASE"

log "Post 3 sample events for user_id=$USER_ID"
curl -fsS -X POST "$API_BASE/events" -H "content-type: application/json" -d "{
  \"userId\":\"$USER_ID\",\"companyId\":\"$COMPANY_ID\",\"type\":\"page_view\",
  \"vector\":[0.12,0.34,0.56,0.78]
}" | jq -r '.published' || true

curl -fsS -X POST "$API_BASE/events" -H "content-type: application/json" -d "{
  \"userId\":\"$USER_ID\",\"companyId\":\"$COMPANY_ID\",\"type\":\"product_view\",
  \"vector\":[0.11,0.33,0.55,0.77]
}" | jq -r '.published' || true

curl -fsS -X POST "$API_BASE/events" -H "content-type: application/json" -d "{
  \"userId\":\"$USER_ID\",\"companyId\":\"$COMPANY_ID\",\"type\":\"cart_open\",
  \"vector\":[0.20,0.40,0.60,0.80]
}" | jq -r '.published' || true

log "Dynamo check via GSI userId-index"
awsls dynamodb query \
  --table-name "$TABLE_NAME" \
  --index-name userId-index \
  --key-condition-expression "userId = :u" \
  --expression-attribute-values "{\":u\":{\"S\":\"$USER_ID\"}}" \
  | jq '{Count, ScannedCount}'

log "Recommendations API (fallback mode)"
curl -fsS "$API_BASE/recommendations?userId=$USER_ID&minScore=0" | jq .

log "One-shot Lambda logs (recommendation)"
STREAM=$(awsls logs describe-log-streams \
  --log-group-name "/aws/lambda/${STACK_PREFIX}-recommendation" \
  --order-by LastEventTime --descending --max-items 1 | jq -r '.logStreams[0].logStreamName' || true)
if [[ -n "${STREAM:-}" ]]; then
  awsls logs filter-log-events \
    --log-group-name "/aws/lambda/${STACK_PREFIX}-recommendation" \
    --log-stream-names "$STREAM" \
    --start-time $(( ( $(date +%s) - 300 ) * 1000 )) \
    | jq -r '.events[].message'
else
  echo "No log stream found for recommendation"
fi

log "Smoke complete"