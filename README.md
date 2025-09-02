---
# Lawpath Tech Test — Scripts Quickstart

## Prerequisites

- Docker
- Node.js 18+
- AWS CLI
- jq
- curl

LocalStack and Qdrant are run via Docker.

## Common Environment Variables

| Variable      | Default Value                |
|--------------|------------------------------|
| STAGE        | dev4                         |
| AWS_URL      | http://localhost:4566        |
| QDRANT_URL   | http://localhost:6333        |
| USER_ID      | user_test                    |
| COMPANY_ID   | comp_test                    |

## Make Scripts Executable

```sh
chmod +x run.sh smoke.sh test.sh
```

---

## `run.sh` — Start Infra and Deploy

**What it does:**
- Starts Docker services (LocalStack + Qdrant)
- Deploys the Serverless stack to LocalStack for `$STAGE`
- Prints the API base URL

**Usage:**
```sh
./run.sh
# or with overrides
STAGE=dev4 AWS_URL=http://localhost:4566 QDRANT_URL=http://localhost:6333 ./run.sh
```

**Expect:**
- Containers up
- `serverless deploy -s $STAGE` completes
- One line with ServiceEndpoint (save as API_BASE)

---

## `smoke.sh` — One-Command Local Smoke Test

**What it does:**
- Verifies LocalStack/Qdrant health
- Full deploy (`serverless deploy -s $STAGE`)
- Ensures S3 bucket exists
- Grants SNS→Lambda invoke permissions (LocalStack quirk)
- Creates/validates Qdrant collection `events` (size=4, Cosine)
- Posts 3 sample events for `USER_ID`
- Confirms Dynamo via `userId-index`
- Calls `/recommendations` (fallback path) and prints JSON
- Pulls one-shot Lambda logs for recommendation

**Usage:**
```sh
./smoke.sh
# or
STAGE=dev4 USER_ID=alice COMPANY_ID=acme ./smoke.sh
```

**Expect:**
- Dynamo Count >= 3
- Recommendations 200 with non-empty hits
- Recent recommendation logs printed

---

## `test.sh` — End-to-End Assertions

**What it does:**
- Hits `/health`
- Sends a sample `/events` payload
- Validates SNS→workers→Dynamo path
- Optionally checks S3 archive and Qdrant points (if enabled)
- Calls `/recommendations` and asserts JSON shape

**Usage:**
```sh
./test.sh
# or
STAGE=dev4 AWS_URL=http://localhost:4566 ./test.sh
```

**Expect:**
- Exit code 0 on pass
- Clear echo/jq assertions on failure

---

## Quick Flow (copy/paste)

```sh
./run.sh
./smoke.sh
./test.sh
```
What it does
Hits /health
Sends a sample /events payload
Validates SNS→workers→Dynamo path
Optionally checks S3 archive and Qdrant points (if enabled)
Calls /recommendations and asserts JSON shape
Use it
./test.sh
# or
STAGE=dev4 AWS_URL=http://localhost:4566 ./test.sh
Expect
Exit code 0 on pass
Clear echo/jq assertions on failure
Quick flow (copy/paste)
./run.sh
./smoke.sh
./test.sh