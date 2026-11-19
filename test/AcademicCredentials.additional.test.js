const { expect } = require('chai');
const { ethers } = require('hardhat');
const { makeTree, disclosure } = require('../backend/merkle');

describe('AcademicCredentials – additional security and lifecycle checks', function () {
  let contract, owner, issuer, outsider, id, tree;

  beforeEach(async () => {
    [owner, issuer, outsider] = await ethers.getSigners();
    contract = await (await ethers.getContractFactory('AcademicCredentials')).deploy();
    await contract.waitForDeployment();
    await contract.authorizeIssuer(issuer.address);
    id = ethers.hexlify(ethers.randomBytes(32));
    tree = makeTree({
      name: 'Demo Student',
      degree: 'B.Tech',
      branch: 'Computer Science',
      cgpa: '8.7',
    });
  });

  it('records issuer and issuance events without exposing academic field values', async () => {
    await expect(contract.connect(issuer).issueCredential(id, tree.root))
      .to.emit(contract, 'CredentialIssued')
      .withArgs(id, issuer.address, tree.root);
    const record = await contract.getCredential(id);
    expect(record.issuer).to.equal(issuer.address);
    expect(record.merkleRoot).to.equal(tree.root);
    expect(record.status).to.equal(1n);
    expect(record.version).to.equal(1n);
  });

  it('rejects a forged value even when the credential is active', async () => {
    await contract.connect(issuer).issueCredential(id, tree.root);
    const proof = disclosure(tree, 'degree');
    expect(await contract.verifyDisclosure(id, proof.field, proof.value, proof.salt, proof.siblings, proof.siblingLeft))
      .to.equal(true);
    expect(await contract.verifyDisclosure(id, proof.field, 'M.Tech', proof.salt, proof.siblings, proof.siblingLeft))
      .to.equal(false);
  });

  it('emits a revocation event and rejects previously valid disclosures', async () => {
    await contract.connect(issuer).issueCredential(id, tree.root);
    const proof = disclosure(tree, 'branch');
    await expect(contract.connect(issuer).revokeCredential(id))
      .to.emit(contract, 'CredentialRevoked')
      .withArgs(id, issuer.address, 2n);
    expect(await contract.verifyDisclosure(id, proof.field, proof.value, proof.salt, proof.siblings, proof.siblingLeft))
      .to.equal(false);
    await expect(contract.connect(issuer).revokeCredential(id)).to.be.revertedWithCustomError(contract, 'NotIssued');
  });

  it('removing an issuer blocks new issuance but preserves historical records', async () => {
    await contract.connect(issuer).issueCredential(id, tree.root);
    await contract.removeIssuer(issuer.address);
    expect(await contract.authorizedIssuers(issuer.address)).to.equal(false);
    await expect(contract.connect(issuer).issueCredential(ethers.hexlify(ethers.randomBytes(32)), tree.root))
      .to.be.revertedWithCustomError(contract, 'NotIssuer');
    const oldRecord = await contract.getCredential(id);
    expect(oldRecord.status).to.equal(1n);
    expect(oldRecord.issuer).to.equal(issuer.address);
  });
});
