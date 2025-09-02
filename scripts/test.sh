#!/usr/bin/env bash
set -euo pipefail

echo "🧪 Running End-to-End Tests..."

# Ensure we have the serverless endpoint
API_BASE=$(npx serverless info -s dev --verbose | awk '/ServiceEndpoint:/{print $2}')
API_BASE="${API_BASE%/}"
if [[ -z "$API_BASE" ]]; then
  echo "❌ Error: Could not determine API base. Is the serverless service deployed?"
  exit 1
fi
echo "✅ API Endpoint found: $API_BASE"

# === 1. Test the Event Ingestion API (Step 1 & 2) ===
echo "1️⃣ Testing Event Ingestion..."
USER_ID="test-user-$(date +%s)"
EVENT_ID="test-event-$(date +%s)"

echo "➡️ Submitting a test event for user: $USER_ID"
RESPONSE=$(curl -s -X POST "$API_BASE/events" \
  -H "Content-Type: application/json" \
  -d '{ "userId": "'"$USER_ID"'", "companyId": "test-company", "eventType": "document_signed", "eventId": "'"$EVENT_ID"'" }')

if [[ $(echo "$RESPONSE" | jq -r '.status') != "ok" ]]; then
  echo "❌ Ingestion API Test Failed: Unexpected response."
  echo "Response: $RESPONSE"
  exit 1
fi
echo "✅ Ingestion API Test Passed."
# Wait for the workers to process the SNS message
sleep 5

# === 2. Test Recommendation API (Step 4 & 5) ===
echo "2️⃣ Testing Recommendation API..."

echo "➡️ Fetching a recommendation for user: $USER_ID"
RECS_RESPONSE=$(curl -s -X GET "$API_BASE/recommendations?userId=$USER_ID")

if [[ $(echo "$RECS_RESPONSE" | jq -r '.userId') != "$USER_ID" ]]; then
  echo "❌ Recommendation API Test Failed: Missing or incorrect userId."
  echo "Response: $RECS_RESPONSE"
  exit 1
fi

echo "✅ Recommendation API Test Passed."

# === 3. Verify DynamoDB and S3 Workers ===
echo "3️⃣ Verifying Worker Functionality..."

# DynamoDB Check
DDB_COUNT=$(aws --endpoint-url=http://localhost:4566 dynamodb scan --table-name EventsTable-dev4 | jq '.Count')
if [[ "$DDB_COUNT" -lt 1 ]]; then
  echo "❌ DynamoDB Worker Test Failed: No records found in EventsTable."
  exit 1
fi
echo "✅ DynamoDB Worker Test Passed. Found $DDB_COUNT records."

# S3 Check
S3_OBJECT=$(aws --endpoint-url=http://localhost:4566 s3api head-object --bucket events-bucket-dev4 --key "test-company/$EVENT_ID.json" 2>&1 || true)
if [[ "$S3_OBJECT" == *"Not Found"* ]]; then
  echo "❌ S3 Worker Test Failed: S3 object not found."
  exit 1
fi
echo "✅ S3 Worker Test Passed. Object archived."

echo "🎉 All tests passed successfully!"
