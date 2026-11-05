// Generates local-only secrets and first Hardhat development account. Never use these keys on public chains.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {HDNodeWallet}=require('ethers');
const target=path.join(__dirname,'../.env');
if(fs.existsSync(target)){console.log('.env already exists; leaving it unchanged.');process.exit(0)}
const wallet=HDNodeWallet.fromPhrase('test test test test test test test test test test test junk',undefined,"m/44'/60'/0'/0/0");
const data=[`RPC_URL=http://127.0.0.1:8545`,`ISSUER_PRIVATE_KEY=${wallet.privateKey}`,`DATA_KEY=${crypto.randomBytes(32).toString('hex')}`,`ADMIN_API_KEY=${crypto.randomBytes(32).toString('hex')}`,`FRONTEND_ORIGIN=http://localhost:5173`,`HOST=127.0.0.1`,`PORT=3001`].join('\n')+'\n';
fs.writeFileSync(target,data,{mode:0o600});console.log('Created .env for Hardhat LOCAL DEVELOPMENT ONLY. Admin key is in .env. Never commit or use on public networks.');
