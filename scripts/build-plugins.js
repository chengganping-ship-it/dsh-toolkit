// Compiles all plugins/dsh-tool-*/src into dist/plugins via tsc.
import { execSync } from 'node:child_process';

execSync('npx tsc -p tsconfig.plugins.json', { stdio: 'inherit', cwd: process.cwd() });
