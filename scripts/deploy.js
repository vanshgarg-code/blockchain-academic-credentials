const fs = require('node:fs');
const path = require('node:path');
const { artifacts, ethers } = require('hardhat');

async function main() {
  const factory = await ethers.getContractFactory('AcademicCredentials');
  const contract = await factory.deploy();
  const receipt = await contract.deploymentTransaction().wait();
  const address = await contract.getAddress();
  const { abi } = await artifacts.readArtifact('AcademicCredentials');
  const { chainId } = await ethers.provider.getNetwork();
  const code = await ethers.provider.getCode(address);
  const out = path.join(__dirname, '../backend/deployment.json');
  fs.writeFileSync(out, JSON.stringify({
    address, abi, chainId: String(chainId), blockNumber: receipt.blockNumber, codeHash: ethers.keccak256(code),
  }, null, 2));
  console.log('Contract deployed:', address);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
