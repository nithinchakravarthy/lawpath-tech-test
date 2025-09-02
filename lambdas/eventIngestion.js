const { SNSClient, PublishCommand } = require("@aws-sdk/client-sns");

const LS_HOST = process.env.LOCALSTACK_HOSTNAME || process.env.LS_HOST || "localhost";
const AWS_ENDPOINT = process.env.AWS_ENDPOINT || `http://${LS_HOST}:4566`;
const REGION = process.env.AWS_REGION || "us-east-1";
const TOPIC_ARN = process.env.TOPIC_ARN || `arn:aws:sns:${REGION}:000000000000:${process.env.TOPIC_NAME}`;

const sns = new SNSClient({
  region: REGION,
  endpoint: AWS_ENDPOINT,
  credentials: { accessKeyId: "test", secretAccessKey: "test" },
});

const ok = (b) => ({
  statusCode: 200,
  headers: { "content-type": "application/json", "Access-Control-Allow-Origin": "*" },
  body: JSON.stringify(b),
});

exports.handler = async (event) => {
  const body = (() => { try { return JSON.parse(event.body || "{}"); } catch { return {}; }})();
  const msg = {
    eventId: body.eventId || `evt_${Math.random().toString(36).slice(2)}_${Date.now()}`,
    userId: body.userId,
    companyId: body.companyId,
    eventType: body.type || body.eventType || "page_view",
    vector: Array.isArray(body.vector) ? body.vector : undefined,
    timestamp: typeof body.timestamp === "number" ? body.timestamp : Date.now(),
  };
  if (!msg.userId || !msg.companyId) return ok({ error: "userId and companyId are required" });

  await sns.send(new PublishCommand({ TopicArn: TOPIC_ARN, Message: JSON.stringify(msg) }));
  return ok({ ok: true, published: msg.eventId });
};
