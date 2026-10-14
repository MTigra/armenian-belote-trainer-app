import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const result = spawnSync(process.platform === 'win32' ? 'gradlew.bat' : './gradlew',
  [':game-core:jsNodeProductionLibraryDistribution', '-PuseSystemNode=true'],
  { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
