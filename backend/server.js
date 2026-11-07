require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('node:crypto');
const { ethers } = require('ethers');
const { makeTree, disclosure } = require('./merkle');
const store = require('./store');

const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
app.use(cors({ origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '128kb' }));

const deployment = require('./deployment.json');
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'http://127.0.0.1:8545', undefined, { cacheTimeout: -1 });
const signer = new ethers.Wallet(process.env.ISSUER_PRIVATE_KEY, provider);
const contract = new ethers.Contract(deployment.address, deployment.abi, signer);
const statuses = ['NONE', 'ISSUED', 'REVOKED'];
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const isBytes32 = value => typeof value === 'string' && /^0x[0-9a-f]{64}$/i.test(value) && value.startsWith('0x');

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function route(handler) {
  return (req, res, next) => Promise.resolve().then(() => handler(req, res)).catch(next);
}

function credentialId(value) {
  if (!isBytes32(value)) throw new RequestError(400, 'Invalid credential ID');
  return value.toLowerCase();
}

function equal(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function adminOnly(req, res, next) {
  const key = process.env.ADMIN_API_KEY;
  if (!key || key.length < 24) return next(new RequestError(503, 'Configure ADMIN_API_KEY in .env'));
  if (!equal(req.get('x-admin-key') || '', key)) return next(new RequestError(403, 'Administrator key required'));
  next();
}

async function deploymentHealth() {
  const network = await provider.getNetwork();
  if (deployment.chainId && String(network.chainId) !== deployment.chainId) {
    throw new RequestError(503, 'RPC is connected to the wrong chain');
  }
  const code = await provider.getCode(deployment.address);
  if (code === '0x' || (deployment.codeHash && ethers.keccak256(code) !== deployment.codeHash)) {
    throw new RequestError(503, 'Contract unavailable. Deploy it and restart the API.');
  }
  return String(network.chainId);
}

let writes = Promise.resolve();
function serializeWrite(handler) {
  return route((req, res) => {
    const operation = writes.then(() => handler(req, res));
    writes = operation.catch(() => {});
    return operation;
  });
}

function metadata(record) {
  return {
    issuer: record.issuer,
    root: record.merkleRoot,
    issuedAt: Number(record.issuedAt),
    version: Number(record.version),
    status: statuses[Number(record.status)],
  };
}

app.get('/api/config', route(async (req, res) => {
  res.json({ contract: deployment.address, chainId: await deploymentHealth(), issuer: signer.address });
}));

app.post('/api/authorize', adminOnly, serializeWrite(async (req, res) => {
  if (!ethers.isAddress(req.body?.address)) throw new RequestError(400, 'Invalid address');
  const tx = await contract.authorizeIssuer(req.body.address);
  await tx.wait();
  res.json({ txHash: tx.hash });
}));

app.post('/api/issue', adminOnly, serializeWrite(async (req, res) => {
  const { fields, requestId = ethers.hexlify(crypto.randomBytes(32)) } = req.body || {};
  if (!isBytes32(requestId)) throw new RequestError(400, 'Invalid issuance request ID');
  const entries = fields && typeof fields === 'object' && !Array.isArray(fields) ? Object.entries(fields) : [];
  if (entries.length < 1 || entries.length > 20 || entries.some(([key, value]) =>
    !key.trim() || key.includes('\x1f') || key.length > 64 ||
    !['string', 'number'].includes(typeof value) || String(value).includes('\x1f') || String(value).length > 500)) {
    throw new RequestError(400, 'Provide 1–20 valid credential fields');
  }

  const chainId = await deploymentHealth();
  const scope = [chainId, deployment.address.toLowerCase(), signer.address.toLowerCase(), requestId.toLowerCase()].join(':');
  const id = '0x' + hash(scope);
  const token = crypto.createHmac('sha256', Buffer.from(process.env.DATA_KEY, 'hex')).update(scope).digest('hex');
  const fingerprint = hash(JSON.stringify(entries.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)));
  const db = store.read();
  let entry = db[id];
  if (entry && entry.fingerprint !== fingerprint) throw new RequestError(409, 'Retry with the original fields or start a new issuance');
  if (!entry) {
    entry = { tree: makeTree(fields), tokenHash: hash(token), fingerprint };
    db[id] = entry;
    store.write(db);
  }

  const record = await contract.getCredential(id);
  if (Number(record.status) === 0) {
    if (entry.txHash && await provider.getTransaction(entry.txHash) && !(await provider.getTransactionReceipt(entry.txHash))) {
      throw new RequestError(409, 'Issuance is pending. Retry after confirmation.');
    }
    const tx = await contract.issueCredential(id, entry.tree.root);
    entry.txHash = tx.hash;
    store.write(db);
    await tx.wait();
  } else if (record.merkleRoot !== entry.tree.root || record.issuer.toLowerCase() !== signer.address.toLowerCase()) {
    throw new RequestError(409, 'On-chain record differs from the pending issuance');
  }
  res.json({ id, root: entry.tree.root, txHash: entry.txHash, studentToken: token, fields: entry.tree.leaves.map(item => item.field) });
}));

async function studentEntry(body) {
  const id = credentialId(body?.id);
  const token = body?.studentToken;
  if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) throw new RequestError(403, 'Valid student access required');
  const entry = store.read()[id];
  if (!entry || !equal(hash(token), entry.tokenHash)) throw new RequestError(403, 'Valid student access required');
  const record = await contract.getCredential(id);
  if (Number(record.status) !== 1 || record.merkleRoot !== entry.tree.root) {
    throw new RequestError(409, 'Credential is inactive on this deployment');
  }
  return { id, tree: entry.tree };
}

app.post('/api/fields', route(async (req, res) => {
  const { tree } = await studentEntry(req.body);
  res.json({ fields: tree.leaves.map(item => item.field) });
}));

app.post('/api/disclose', route(async (req, res) => {
  const { id, tree } = await studentEntry(req.body);
  const { field, fields } = req.body;
  const selected = fields === undefined ? [field] : fields;
  const available = new Set(tree.leaves.map(item => item.field));
  if (!Array.isArray(selected) || !selected.length || selected.length > available.size ||
      new Set(selected).size !== selected.length || selected.some(name => !available.has(name))) {
    throw new RequestError(400, 'Select valid credential fields');
  }
  if (fields === undefined) return res.json({ id, ...disclosure(tree, field) });
  res.json({
    formatVersion: 1,
    chainId: await deploymentHealth(),
    contract: deployment.address,
    id,
    claims: selected.map(name => disclosure(tree, name)),
  });
}));

function validClaim(claim) {
  return claim && typeof claim.field === 'string' && typeof claim.value === 'string' &&
    typeof claim.salt === 'string' && /^[0-9a-f]{64}$/.test(claim.salt) &&
    !claim.field.includes('\x1f') && !claim.value.includes('\x1f') &&
    Array.isArray(claim.siblings) && Array.isArray(claim.siblingLeft) &&
    claim.siblings.length <= 32 && claim.siblings.length === claim.siblingLeft.length &&
    claim.siblings.every(isBytes32) && claim.siblingLeft.every(item => typeof item === 'boolean');
}

app.post('/api/verify', route(async (req, res) => {
  const proof = req.body;
  const id = credentialId(proof?.id);
  const chainId = await deploymentHealth();
  if (proof.formatVersion !== undefined && (proof.formatVersion !== 1 || proof.chainId !== chainId ||
      typeof proof.contract !== 'string' || proof.contract.toLowerCase() !== deployment.address.toLowerCase())) {
    throw new RequestError(400, 'Unsupported proof format or proof belongs to a different deployment');
  }
  const claims = proof.formatVersion === 1 ? proof.claims : [proof];
  if (!Array.isArray(claims) || claims.length < 1 || claims.length > 20 || !claims.every(validClaim)) {
    throw new RequestError(400, 'Invalid disclosure proof');
  }
  const blockTag = await provider.send('eth_blockNumber', []);
  const record = await contract.getCredential(id, { blockTag });
  const checks = Number(record.status) === 1 ? await Promise.all(claims.map(claim =>
    contract.verifyDisclosure(id, claim.field, claim.value, claim.salt, claim.siblings, claim.siblingLeft, { blockTag }))) : [];
  const valid = checks.length > 0 && checks.every(Boolean);
  const info = metadata(record);
  const reason = valid ? 'All disclosed claims match the active credential'
    : info.status === 'REVOKED' ? 'Credential revoked'
    : info.status === 'NONE' ? 'Credential not found' : 'Disclosure does not match the committed Merkle root';
  res.json({ ...info, valid, reason, blockNumber: Number(blockTag), ...(valid && {
    claims: claims.map(({ field, value }) => ({ field, value })),
  }) });
}));

app.post('/api/revoke', adminOnly, serializeWrite(async (req, res) => {
  const tx = await contract.revokeCredential(credentialId(req.body?.id));
  await tx.wait();
  res.json({ txHash: tx.hash });
}));

app.get('/api/credential/:id', route(async (req, res) => {
  res.json(metadata(await contract.getCredential(credentialId(req.params.id))));
}));

app.get('/api/history', route(async (req, res) => {
  await deploymentHealth();
  const latest = Number(await provider.send('eth_blockNumber', []));
  const fromBlock = Math.max(deployment.blockNumber || 0, latest - 999);
  const [issued, revoked] = await Promise.all([
    contract.queryFilter(contract.filters.CredentialIssued(), fromBlock, latest),
    contract.queryFilter(contract.filters.CredentialRevoked(), fromBlock, latest),
  ]);
  const events = [...issued, ...revoked].sort((a, b) => b.blockNumber - a.blockNumber || b.index - a.index)
    .slice(0, 25).map(event => ({
      action: event.eventName === 'CredentialIssued' ? 'Issued' : 'Revoked',
      id: event.args.id,
      issuer: event.args.issuer,
      blockNumber: event.blockNumber,
      txHash: event.transactionHash,
    }));
  res.json({ events, fromBlock });
}));

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error instanceof RequestError) return res.status(error.status).json({ error: error.message });
  if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
  if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large' });
  if (error.code === 'CALL_EXCEPTION') return res.status(409).json({ error: 'The contract rejected this operation. Check the credential status and issuer permissions.' });
  console.error('[API]', error.code || error.name);
  res.status(503).json({ error: 'Credential service unavailable. Check the API, local chain, and deployment.' });
});

store.validate();
const port = process.env.PORT || 3001;
const host = process.env.HOST || '127.0.0.1';
app.listen(port, host, () => console.log(`API listening at http://${host}:${port}`));
