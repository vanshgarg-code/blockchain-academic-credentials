// Demonstration-only encrypted local store. Use a managed DB and key vault in production.
const fs=require('fs'),crypto=require('crypto'),path=require('path');const filename=path.join(__dirname,'private-data.enc');
function key(){const k=process.env.DATA_KEY;if(!k||!/^[0-9a-fA-F]{64}$/.test(k))throw Error('DATA_KEY must be 64 hex characters (32 bytes)');return Buffer.from(k,'hex');}
function read(){if(!fs.existsSync(filename))return {};const b=JSON.parse(fs.readFileSync(filename,'utf8'));const d=crypto.createDecipheriv('aes-256-gcm',key(),Buffer.from(b.iv,'hex'));d.setAuthTag(Buffer.from(b.tag,'hex'));return JSON.parse(Buffer.concat([d.update(Buffer.from(b.data,'hex')),d.final()]).toString());}
function write(data){const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key(),iv);const encrypted=Buffer.concat([c.update(JSON.stringify(data)),c.final()]);fs.writeFileSync(filename,JSON.stringify({iv:iv.toString('hex'),tag:c.getAuthTag().toString('hex'),data:encrypted.toString('hex')}),{mode:0o600});}
module.exports={read,write};
