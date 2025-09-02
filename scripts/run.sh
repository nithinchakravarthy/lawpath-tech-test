#!/usr/bin/env bash
set -euo pipefail
export AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID:-test}
export AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY:-test}
export AWS_DEFAULT_REGION=${AWS_DEFAULT_REGION:-us-east-1}

echo "▶️ docker up..."
docker-compose up -d

echo "⏳ wait for LocalStack..."
until curl -sf http://localhost:4566/_localstack/health >/dev/null; do sleep 2; done

echo "🧠 ensure Qdrant collection..."
curl -s -X PUT "http://localhost:6333/collections/events" \
  -H "Content-Type: application/json" -d '{"vectors":{"size":4,"distance":"Cosine"}}' >/dev/null || true

echo "🚀 deploy..."
npx serverless deploy -s dev --verbose

SERVICE=$(npx serverless info -s dev --verbose | awk '/ServiceEndpoint:/{print $2}')
echo "API_BASE=$SERVICE"

echo "📨 seed one event..."
curl -s -X POST "$SERVICE/events" -H "Content-Type: application/json" \
  -d '{"companyId":"comp_123","userId":"user_456","eventType":"document_created","description":"seed"}' >/dev/null

echo "🔎 verify"
aws --endpoint-url=http://localhost:4566 dynamodb scan --table-name EventsTable --max-items 1 | jq '.Count'
curl -s -X POST "http://localhost:6333/collections/events/points/count" -H "Content-Type: application/json" -d '{"exact":true}' | jq '.result.count'
curl -s "$SERVICE/recommendations?user_id=user_456&limit=3" | jq '.'

echo "✅ done"
