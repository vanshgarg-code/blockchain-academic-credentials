# Blockchain-Based Academic Credentials

A deliberately manageable **local end-to-end academic prototype** with a real Solidity smart contract, Hardhat Ethereum-compatible chain, Express API, React frontend, encrypted JSON data store, Merkle selective disclosure, on-chain revocation and separate Python experiments.

## Quick start (Node.js 20+, npm, Python 3.10+)

From the extracted `academic-credentials/` folder:

```bash
npm ci
npm --prefix frontend ci
npm run setup
```

`npm run setup` creates `.env` **once**, generating a random admin API key and AES encryption key. It derives the local issuer wallet from Hardhat's standard **public demonstration mnemonic**. **Never use this wallet, mnemonic, or local-key approach on a real network.** If `.env` already exists, the setup command leaves it unchanged. Copy `ADMIN_API_KEY` from your `.env` into the Issue/Revoke dashboard input. Do not share or upload `.env`.

Open four terminals (all commands run from the project root):

1. `npm run chain` (leave running)
2. `npm run compile && npm run deploy` (creates `backend/deployment.json`)
3. `npm run backend` (local API on `127.0.0.1:3001`)
4. `npm run frontend` (visit `http://localhost:5173`)

If you stop/reset Hardhat, its state is lost: redeploy the contract and restart the backend. Old credential IDs will no longer be valid on a fresh chain; avoid mixing old encrypted records with a newly reset chain.

The Vite development server proxies `/api` to port 3001. Set `CREDENTIALS_API_TARGET` before starting Vite if you change the API port. For a production build, serve `/api` from the same origin or set `VITE_API_BASE` before building.

## Five-minute demo

1. **University:** enter the admin key from `.env`, issue a fake credential, then save the private student access file.
2. **Student:** import the access file or use **Open student view** after issuing. Load the available fields, select one or more, and export the disclosure proof.
3. **Verifier:** open or import the proof and verify it. The screen shows the verified claims and the chain result.
4. **Tamper:** change a disclosed value and verify again. Verification should fail.
5. **University:** revoke the issued credential. Verify the original proof again to see the revoked status.
6. **Activity:** inspect the public record or view recent issuance and revocation events.

## Tests

- `npm run check:crypto`: standalone Node tests (no external npm dependencies) for field isolation, SHA-256 proof validation, tampering, random salts and delimiter rejection.
- `npm run smoke`: with the local chain, deployed contract and API running, checks issuance retry, student authorization, legacy and multi-field proofs, tampering, revocation, and activity. It creates and revokes a demo credential.
- `npm test`: Hardhat contract tests (requires `npm ci` and compilation) for access restrictions, duplication, issuance, verification, revocation and tampering.
- `npm run experiment`: independent Python toy PoW + optimistic concurrency CSV. **This experiment is not Ethereum mining or EVM execution.** Python's GIL and negligible per-operation computation may make concurrency slower than sequential execution.

## Architecture and blockchain semantics

`Issuer -> Express (admin-key gated) -> ethers signer -> Solidity AcademicCredentials -> local Hardhat chain`

`Student -> Express (private bearer token) -> AES-256-GCM local store -> chosen field + SHA-256 salt + Merkle siblings`

`Verifier -> Express -> Solidity verifyDisclosure (eth_call) -> Merkle root + active/revoked status`

Solidity functions: `authorizeIssuer` (owner), `removeIssuer` (owner), `issueCredential` (authorized issuer), `revokeCredential` (original issuer), `getCredential` (public read), and `verifyDisclosure` (public read). On-chain record: 32-byte ID, issuer address, 32-byte Merkle root, timestamp, version and status. Off-chain: full credential fields, random salts, proof tree and hashed student token.

Merkle leaf format is `SHA256(utf8(field) || 0x1f || utf8(value) || 0x1f || utf8(salt))`; internal nodes are `SHA256(left32 || right32)`; an odd node is duplicated. Proof includes sibling hashes and left/right orientation. Fields are lexicographically sorted; input delimiter `0x1f` is rejected.

## Security model and honest limitations

- The backend holds a **demo-only local issuer key** and signs writes; its write endpoints require a **random admin key**, but this is not equivalent to a production identity system. Keep the service bound to loopback. Browser-managed keys, secure sessions and wallet-based role authentication are future extensions.
- The student token is a bearer secret; anyone with the token can disclose any stored field. A disclosure JSON intentionally reveals the chosen field, value and salt. **Merkle membership is not zero-knowledge.**
- The encrypted JSON store is AES-256-GCM protected but not a transactional multi-user DB. Server-side access, `.env` leakage, or a lost DATA_KEY compromises or blocks access. The API saves the encrypted record before submitting issuance. Retry from the same open University view to reuse its request ID. API clients should persist their request IDs and resend the original fields. Run a single API process for this local store and signer.
- An issuer removed from the authorized list cannot issue new credentials; existing credentials remain verifiable; the original issuer can still revoke them.
- No actual university login, identity attestation, production-grade key management, wallet connect, email/SMS notification, decentralized hosting, publicly deployed blockchain, independent smart-contract audit, or IPFS is included.
- All verification results rely on a functioning trusted connection to the configured local RPC chain; a malicious or compromised backend could misrepresent results.



## Contributors

### Vansh Garg
- Designed and developed the project architecture.
- Implemented the Solidity smart contracts for academic credential issuance and revocation.
- Developed the backend APIs and blockchain integration.
- Implemented cryptographic mechanisms, including SHA-256 hashing and Merkle Trees.
- Developed the React frontend and user interfaces.
- Implemented student selective disclosure and credential verification.
- Performed testing, debugging, and performance evaluation.
- Managed project integration, documentation, and GitHub repository updates.



## Folder guide

- `contracts/AcademicCredentials.sol`: chain-of-record and verification logic
- `test/AcademicCredentials.test.js`: on-chain access control and behavior tests
- `test/merkle.node.test.js`: crypto unit tests
- `backend/merkle.js`: SHA-256 Merkle tree and proof generator
- `backend/server.js`: API endpoints and on-chain transactions
- `backend/store.js`: encrypted storage at rest
- `frontend/src/main.jsx`: issuance, disclosure, verification, revocation and inspection
- `scripts/setup-local.js`, `scripts/deploy.js`: local secrets and contract deployment
- `experiments/benchmark.py`: distinct PoW and concurrent-execution simulation

The bundled `Implementation_Guide_Improved.pdf` describes the original prototype. Use this README for the updated workflow.
