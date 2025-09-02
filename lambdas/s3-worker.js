const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

const endpoint = process.env.AWS_ENDPOINT || "http://localstack-main:4566";
const REGION = "us-east-1";
const BUCKET = process.env.ARCHIVE_BUCKET || "events-bucket";

const s3 = new S3Client({
  endpoint, region: REGION,
  credentials: { accessKeyId: "test", secretAccessKey: "test" },
  forcePathStyle: true,
});

module.exports.handler = async (event) => {
  const recs = event?.Records || [];
  for (const r of recs) {
    if (r.EventSource !== "aws:sns") continue;
    const msg = JSON.parse(r.Sns.Message || "{}");
    const key = `${msg.companyId}/${msg.eventId}.json`;
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: "application/json",
      Body: JSON.stringify(msg),
    }));
    console.log("archived", key);
  }
  return { statusCode: 200 };
};
