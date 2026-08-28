import fs from 'node:fs';
import path from 'node:path';

// Tiny .env loader (no dotenv dependency). Values already in process.env win.
export function loadEnv(root = process.cwd()) {
  const p = path.join(root, '.env');
  if (fs.existsSync(p)) {
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#') || !t.includes('=')) continue;
      const i = t.indexOf('=');
      const k = t.slice(0, i).trim();
      const v = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
      if (process.env[k] === undefined) process.env[k] = v;
    }
  }
  return process.env;
}
