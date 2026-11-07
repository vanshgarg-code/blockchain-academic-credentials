const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');

const filename = path.join(__dirname, 'private-data.enc');

function key() {
  const value = process.env.DATA_KEY;
  if (!value || !/^[0-9a-f]{64}$/i.test(value)) throw new Error('DATA_KEY must be 64 hex characters (32 bytes)');
  return Buffer.from(value, 'hex');
}

function read() {
  if (!fs.existsSync(filename)) return {};
  const { iv, tag, data } = JSON.parse(fs.readFileSync(filename, 'utf8'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data, 'hex')), decipher.final()]).toString('utf8'));
}

function write(data) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(data)), cipher.final()]);
  const payload = { iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex'), data: ciphertext.toString('hex') };

  const temporary = filename + '.' + crypto.randomUUID() + '.tmp';
  try {
    fs.writeFileSync(temporary, JSON.stringify(payload), { mode: 0o600, flag: 'wx', flush: true });
    fs.renameSync(temporary, filename);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

function validate() {
  key();
  read();
}

module.exports = { read, write, validate };
