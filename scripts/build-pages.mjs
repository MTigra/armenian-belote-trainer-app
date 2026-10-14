import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const result = spawnSync('pnpm', ['build'], {
  cwd: fileURLToPath(new URL('..', import.meta.url)),
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: {
    ...process.env,
    VITE_BASE_PATH: '/armenian-belote-trainer-app/',
    VITE_API_URL: process.env.VITE_API_URL || 'https://armenian-blot.onrender.com',
  },
});
process.exit(result.status ?? 1);
