'use strict';

const axios = require('axios');
const crypto = require('crypto');

const QDRANT_URL = process.env.QDRANT_URL || 'http://qdrant:6333';
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION || 'events';
const VECTOR_SIZE = Number(process.env.VECTOR_SIZE || 4);
const QDRANT_TIMEOUT_MS = Number(process.env.QDRANT_TIMEOUT_MS || 2000);
const ENV_BYPASS = process.env.QDRANT_BYPASS === '1';

const AX = axios.create({ timeout: QDRANT_TIMEOUT_MS });

function safeParse(s){ try { return JSON.parse(s); } catch { return null; } }
function* extractRecords(event){
  if (event?.Records?.length){
    for (const r of event.Records){
      if (r.Sns?.Message){
        const once = typeof r.Sns.Message === 'string' ? safeParse(r.Sns.Message) : r.Sns.Message;
        const msg = typeof once === 'string' ? safeParse(once) : once;
        if (msg) yield msg;
      }
    } return;
  }
  if (event?.body){
    const body = typeof event.body === 'string' ? safeParse(event.body) : event.body;
    if (body) yield body;
    return;
  }
  if (event && typeof event === 'object') yield event;
}

function toNumericArray(v){
  if (!Array.isArray(v)) return null;
  const out = v.map(Number);
  return out.some(Number.isNaN) ? null : out;
}
function vectorIsValid(v){ return Array.isArray(v) && v.length === VECTOR_SIZE && v.every(x => typeof x === 'number'); }

function intIdFrom(eventId){
  const h = crypto.createHash('sha256').update(String(eventId)).digest();
  let big = 0n; for (let i=0;i<7;i++) big = (big<<8n)|BigInt(h[i]);
  big = big & ((1n<<53n)-1n);
  return Number(big);
}

async function upsertPoint(point){
  const url = `${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points`;
  return AX.put(url, { points: [point] }, { headers: { 'content-type': 'application/json' } });
}

exports.handler = async (event) => {
  console.log('vectorWorker build', {
    mode: 'int-ids',
    qdrantUrl: QDRANT_URL,
    collection: QDRANT_COLLECTION,
    vectorSize: VECTOR_SIZE,
    timeoutMs: QDRANT_TIMEOUT_MS,
    envBypass: ENV_BYPASS,
  });

  let processed = 0;

  for (const rec of extractRecords(event)){
    const bypass = ENV_BYPASS || rec.__bypass === true;
    const ping   = rec.__ping === true;

    if (ping){
      try { const r = await AX.get(`${QDRANT_URL}/collections`); console.log('Qdrant ping OK',{status:r.status}); }
      catch(e){ console.error('Qdrant ping FAIL',{code:e.code,msg:e.message}); }
      continue;
    }

    const { eventId, userId, companyId, vector } = rec;
    const vec = toNumericArray(vector);
    if (!vec || !vectorIsValid(vec)){
      console.error('Invalid vector', { got: vector, expectedSize: VECTOR_SIZE });
      continue;
    }

    const id = intIdFrom(eventId || `${userId}:${Date.now()}`);
    const point = { id, vector: vec, payload: { eventId: eventId ?? null, userId: userId ?? null, companyId: companyId ?? null } };
    console.log('upserting point', { idType: typeof id, id });

    if (bypass){
      console.log('BYPASS enabled, skipping upsert');
      processed += 1; continue;
    }

    try { const res = await upsertPoint(point); console.log('Qdrant upsert OK', res.data?.result); processed += 1; }
    catch (err) { console.error('Qdrant upsert failed', { status: err.response?.status, data: err.response?.data, code: err.code, msg: err.message }); }
  }

  const summary = { processed };
  console.log('vectorWorker summary', summary);
  return summary;
};
