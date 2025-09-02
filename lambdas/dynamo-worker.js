// lambdas/dynamo-worker.js
const { DynamoDBClient, PutItemCommand } = require("@aws-sdk/client-dynamodb");

const LS_HOST = process.env.LOCALSTACK_HOSTNAME || process.env.LS_HOST || "localhost";
const AWS_ENDPOINT = process.env.AWS_ENDPOINT || `http://${LS_HOST}:4566`;
const REGION = process.env.AWS_REGION || "us-east-1";
const TABLE_NAME = process.env.TABLE_NAME || "EventsTable-dev4";

const db = new DynamoDBClient({
  region: REGION,
  endpoint: AWS_ENDPOINT,
  credentials: { accessKeyId: "test", secretAccessKey: "test" },
});

exports.handler = async (event) => {
  for (const rec of event.Records || []) {
    const m = JSON.parse(rec.Sns.Message);
    const item = {
      eventId:     { S: String(m.eventId) },
      userId:      { S: String(m.userId) },
      companyId:   { S: String(m.companyId) },
      eventType:   { S: String(m.eventType || "page_view") },
      timestamp:   { N: String(typeof m.timestamp === "number" ? m.timestamp : Date.now()) },
    };
    await db.send(new PutItemCommand({ TableName: TABLE_NAME, Item: item }));
  }
  return { ok: true };
};
