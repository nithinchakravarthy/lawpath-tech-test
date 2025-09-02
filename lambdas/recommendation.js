// recommendation.js
// Prefer LocalStack’s injected hostname when running inside the Lambda container
const LS_HOST = process.env.LOCALSTACK_HOSTNAME || process.env.LS_HOST || "localhost";
const AWS_ENDPOINT = process.env.AWS_ENDPOINT || `http://${LS_HOST}:4566`;
const REGION = process.env.AWS_REGION || "us-east-1";

// Qdrant: default to container name when inside Docker; fallback to localhost
const IN_CONTAINER = !!process.env.LOCALSTACK_HOSTNAME;
const QDRANT_URL = process.env.QDRANT_URL || (IN_CONTAINER ? "http://qdrant:6333" : "http://localhost:6333");
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION || "events";

const { DynamoDBClient, QueryCommand, GetItemCommand, PutItemCommand } = require("@aws-sdk/client-dynamodb");

// config
const TABLE_NAME = process.env.TABLE_NAME || "EventsTable-dev4";
const CACHE_TABLE = process.env.CACHE_TABLE || "RecsCache-dev4";
const USER_INDEX = process.env.USER_INDEX || "userId-index";

const SCORE_FLOOR = Number(process.env.MIN_SCORE ?? 0.15);
const MAX_RESULTS = Number(process.env.MAX_RESULTS ?? 5);

const axios = require("axios");

const HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
};

const db = new DynamoDBClient({
  endpoint: AWS_ENDPOINT,
  region: REGION,
  credentials: { accessKeyId: "test", secretAccessKey: "test" },
});

const ok = (body) => ({ statusCode: 200, headers: HEADERS, body: JSON.stringify(body) });

function embed(text, dims = 4) {
  const arr = new Array(dims).fill(0);
  const words = String(text || "").toLowerCase().match(/\w+/g) || [];
  for (const w of words) {
    let h = 0; for (let i = 0; i < w.length; i++) h = (h * 31 + w.charCodeAt(i)) | 0;
    for (let j = 0; j < dims; j++) arr[j] += ((h >> (j * 4)) & 0xf) / 8;
  }
  const norm = Math.sqrt(arr.reduce((s, v) => s + v * v, 0)) || 1;
  return arr.map(v => v / norm);
}

exports.handler = async (event) => {
  try {
    if (event?.httpMethod === "OPTIONS") return { statusCode: 200, headers: HEADERS, body: "" };

    const qs = event?.queryStringParameters || {};
    const minScore = Number(qs.minScore ?? process.env.MIN_SCORE ?? 0.0);
    const userId = qs.userId || qs.user_id;
    if (!userId) return ok({ error: "Missing userId" });

    // query events via GSI
    let items;
    try {
      const q = await db.send(new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: USER_INDEX,
        KeyConditionExpression: "userId = :u",
        ExpressionAttributeValues: { ":u": { S: userId } },
      }));
      items = (q.Items || []).map(i => ({
        eventId: i.eventId?.S,
        userId: i.userId?.S,
        companyId: i.companyId?.S || "",
        eventType: i.eventType?.S ?? i.type?.S ?? "",
        ts: Number(i.ts?.N ?? i.timestamp?.N ?? i.timestamp?.S ?? 0),
      }));
      items.sort((a, b) => a.ts - b.ts);
    } catch (e) {
      return ok({ userId, hits: [], reason: `dynamodb: ${e.message}` });
    }

    if (!items.length) return ok({ userId, hits: [], reason: "no user events yet" });

    const seed = items[items.length - 1];
    const companyId = seed.companyId || "";

    // cache short-circuit
    try {
      const { Item } = await db.send(new GetItemCommand({
        TableName: CACHE_TABLE,
        Key: { userId: { S: userId }, lastEventId: { S: seed.eventId } },
      }));
      if (Item?.payload?.S) return ok(JSON.parse(Item.payload.S));
    } catch (_) {}

    // search
    const vec = embed(`${seed.eventType} ${seed.ts || ""}`, 4);
    let hits = [];
    try {
      const body = {
        vector: vec,
        with_payload: true,
        limit: Math.max(1, MAX_RESULTS * 2),
        ...(companyId ? { filter: { must: [{ key: "companyId", match: { value: companyId } }] } } : {}),
        };
        const { data } = await axios.post(
            `${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/search`,
            body,
            { headers: { "content-type": "application/json" } }
        );
        if (data) {
            const raw = Array.isArray(data.result) ? data.result : [];
            hits = raw.filter(h => typeof h.score === "number" && h.score >= minScore)
                  .slice(0, MAX_RESULTS)
                  .map(h => ({ id: h.id, score: h.score, payload: h.payload ?? {} }));
      }
    } catch (_) {
      hits = [];
    }

    const payload = { userId, companyId, seedEventId: seed.eventId, hits };
    try {
      await db.send(new PutItemCommand({
        TableName: CACHE_TABLE,
        Item: {
          userId: { S: String(userId) },
          lastEventId: { S: String(seed.eventId || "") },
          payload: { S: JSON.stringify(payload) },
          ts: { N: String(Date.now()) },
        },
      }));
    } catch (_) {}
    return ok(payload);
  } catch (err) {
    return ok({ error: String(err?.message || err) });
  }
};
