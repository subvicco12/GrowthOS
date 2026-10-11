import { spawnSync } from 'node:child_process';

const name = process.env.GROWTHOS_DB_NAME ?? '';
if (process.env.GROWTHOS_TEST_DB_DISPOSABLE !== 'YES' ||
    !/^growthos_test_[a-zA-Z0-9_]+$/.test(name)) {
  console.error('REFUSED: set GROWTHOS_TEST_DB_DISPOSABLE=YES and a disposable growthos_test_* database name.');
  process.exit(2);
}
for (const key of ['GROWTHOS_DB_HOST','GROWTHOS_DB_USER','GROWTHOS_DB_PASSWORD']) {
  if (!process.env[key]) {
    console.error('REFUSED: missing ' + key);
    process.exit(2);
  }
}
const result = spawnSync(process.execPath, [
  '--import=tsx', '--test', 'src/core/__tests__/mysql-approval.integration.test.ts'
], { stdio: 'inherit', env: process.env });
if (result.error) {
  console.error(result.error.message);
  process.exit(2);
}
process.exit(result.status ?? 2);
