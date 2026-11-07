require('@nomicfoundation/hardhat-ethers');
require('@nomicfoundation/hardhat-chai-matchers');
require('dotenv').config();

const { subtask } = require('hardhat/config');
const { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } = require('hardhat/builtin-tasks/task-names');

const compilerVersion = '0.8.24';
subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD).setAction(async ({ solcVersion }, _, runSuper) => {
  if (solcVersion !== compilerVersion) return runSuper();
  return {
    compilerPath: require.resolve('solc/soljson.js'),
    isSolcJs: true,
    version: solcVersion,
    longVersion: require('solc').version(),
  };
});

module.exports = {
  solidity: { version: compilerVersion, settings: { optimizer: { enabled: true, runs: 200 } } },
  networks: { localhost: { url: process.env.RPC_URL || 'http://127.0.0.1:8545' } },
};
