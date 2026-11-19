# Blockchain-Based Academic Credentials

> **CSD436 final-polish branch:** responsive university / student / verifier / activity experience, improved readable blockchain event history, new lifecycle tests, and GitHub Actions checks. The core contract and cryptographic design remain compatible with the original project report.

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

## Final demonstration walkthrough (professor-friendly)

1. Start a fresh Hardhat node and deploy the contract as described above. Confirm the **Connected** network indicator and the contract address in the application.
2. In **University**, enter the `ADMIN_API_KEY` from your private local `.env`. Issue a **fictional** academic record and save the **private access file** outside the GitHub folder.
3. In **Student**, import that access file. Choose exactly the fields needed (for example, **degree**) and download the selective disclosure JSON. Explain that the on-chain commitment is a SHA-256 Merkle root; the selected values and their salts appear only in the disclosure.
4. In **Verifier**, import the disclosure. Explain how the smart contract recomputes the salted leaf and traverses sibling hashes while checking the current on-chain status.
5. Modify a disclosed value without recomputing the root; show rejection. **Do not change a real student's information**.
6. In **University**, revoke the same credential. Reverify its *original* valid disclosure and show **Revoked**. Highlight that a correct Merkle proof is not sufficient if the contract state is revoked.
7. In **Activity**, load the blockchain events and inspect the issuance/revocation transaction hashes. Explain the difference between a blockchain event (audit log) and off-chain private data.
8. Run `npm run check:crypto`, `npm test` and `npm run experiment`. Show the experimental CSV; explain that Python's PoW and optimistic concurrency are **educational simulations**, not part of Hardhat consensus.

## How to review this enhancement safely

These changes are deliberately on the branch `enhancement/csd436-final-polish`, not directly on `main`.

```powershell
git status
git fetch origin
git switch enhancement/csd436-final-polish
npm ci
npm --prefix frontend ci
npm run check:crypto
npm test
npm --prefix frontend run build
```

If you already have local changes, commit or stash them **before** switching branches. Keep your existing `.env` private; `npm run setup` is only needed for fresh local setups.

To run the full application use the four-terminal commands near the top. Never commit `.env`, off-chain encrypted data, or student access files.

### Security and scope notes

- `ADMIN_API_KEY` is a local demo gate, **not** production-grade issuer authentication or student identity verification.
- The backend issues transactions with a local wallet; Ethereum cannot hide issuer addresses or transactions.
- Selective Merkle disclosure reveals the chosen field and proof. It is **not a zero-knowledge proof**.
- This prototype stores encrypted academic records locally. It does not implement distributed persistence, IPFS or real university identity systems.
- Event history fetches a limited block window. Use it as a **recent activity display**, not a complete historical chain index.
- The CSD436 report describes PoW and optimistic concurrency alongside Ethereum; this project correctly separates those Python simulation experiments from the Solidity/Hardhat system.

## Continuous integration

The GitHub Actions workflow at `.github/workflows/ci.yml` runs installation, standalone Merkle tests, Solidity/Hardhat tests and a frontend production build on push and pull request. The local API smoke test needs a running chain, deployment and private environment, so it is not part of that CI job.
