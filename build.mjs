import { cp, mkdir, readdir } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
await cp('public', 'dist', { recursive: true });
console.log(`Built ${ (await readdir('dist')).length } static files in dist/.`);
