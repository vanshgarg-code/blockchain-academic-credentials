require('dotenv').config();
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');

const base = process.env.CREDENTIALS_SMOKE_API || 'http://127.0.0.1:' + (process.env.PORT || 3001) + '/api';
const key = process.env.ADMIN_API_KEY;

async function request(path, body, expectedStatus = 200) {
  const response = await fetch(base + path, body === undefined ? {} : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-key': key },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  assert.equal(response.status, expectedStatus, JSON.stringify(result));
  return result;
}

async function main() {
  assert(key, 'Run npm run setup first');
  await request('/config');
  const fields = { name: 'Smoke Test Student', degree: 'B.Tech', graduationYear: '2026' };
  const requestId = '0x' + randomBytes(32).toString('hex');
  const issued = await request('/issue', { fields, requestId });
  const retry = await request('/issue', { requestId, fields: { degree: fields.degree, name: fields.name, graduationYear: fields.graduationYear } });
  assert.deepEqual(retry, issued);
  await request('/issue', { fields: { ...fields, degree: 'Different' }, requestId }, 409);

  const access = { id: '0x' + issued.id.slice(2).toUpperCase(), studentToken: issued.studentToken };
  const fieldList = await request('/fields', access);
  assert.deepEqual(new Set(fieldList.fields), new Set(Object.keys(fields)));
  await request('/fields', { ...access, studentToken: '0'.repeat(64) }, 403);
  const legacy = await request('/disclose', { ...access, field: 'degree' });
  assert.equal((await request('/verify', legacy)).valid, true);
  const proof = await request('/disclose', { ...access, fields: ['degree', 'graduationYear'] });
  assert.deepEqual(proof.claims.map(claim => claim.field), ['degree', 'graduationYear']);
  assert.equal((await request('/verify', proof)).valid, true);
  const tampered = structuredClone(proof);
  tampered.claims[0].value = 'PhD';
  assert.equal((await request('/verify', tampered)).valid, false);
  await request('/verify', { ...proof, chainId: '0' }, 400);

  await request('/revoke', { id: issued.id });
  const revoked = await request('/verify', proof);
  assert.equal(revoked.valid, false);
  assert.equal(revoked.status, 'REVOKED');
  await request('/disclose', { ...access, field: 'degree' }, 409);
  const { events } = await request('/history');
  assert.deepEqual(events.filter(event => event.id === issued.id).map(event => event.action), ['Revoked', 'Issued']);
  console.log('Credential smoke test passed.');
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
