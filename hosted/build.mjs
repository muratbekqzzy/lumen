// Build the existing browser application into a dependency-free hosted Worker.
import { readFile, mkdir, writeFile, rm, cp, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = ['index.html', 'manifest.webmanifest', 'sw.js', 'web/app.js', 'web/import.js', 'web/pdf.js', 'web/tutor.js', 'web/markdown.js', 'web/aura.js', 'web/force.js', 'web/graph.js', 'web/universe.js', 'web/style.css', 'web/icon.svg', 'web/spss.html', 'cloud/cloud.js', 'cloud/panopto.js', 'cloud/hosting.js', 'cloud/migrate.js'];
async function appendAssets(dir){for(const entry of await readdir(path.join(root,dir),{withFileTypes:true})){const name=dir+'/'+entry.name;if(entry.isDirectory())await appendAssets(name);else files.push(name)}}
await appendAssets('web/pdfjs');
const types = {mjs:'text/javascript; charset=utf-8',wasm:'application/wasm',html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',svg:'image/svg+xml',webmanifest:'application/manifest+json'};
const assets = {};
for (const name of files) {
  const binary=!['html','mjs','js','css','svg','webmanifest'].includes(name.split('.').pop())&&!name.includes('LICENSE');
  let body = binary?(await readFile(path.join(root,name))).toString('base64'):await readFile(path.join(root, name), 'utf8');
  if (name === 'index.html') body = body.replace('<head>', '<head>\n<script>window.LUMEN_HOSTED = true;</script>');
  assets['/' + name] = {body,binary,type:types[name.split('.').pop()]||'application/octet-stream'};
}
assets['/'] = assets['/index.html'];
const backend = await readFile(path.join(root, 'hosted/sync.mjs'), 'utf8')+'\n'+await readFile(path.join(root, 'hosted/files.mjs'), 'utf8');
const worker = `${backend}\nconst assets = ${JSON.stringify(assets)};
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/sync') return handleSync(request, env);
    if (url.pathname === '/api/maintenance/lecture-materials') return handleMaterialImport(request, env);
    if (url.pathname.startsWith('/api/lecture-files/')) return handleLectureFiles(request, env);
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', {status:405});
    const asset = assets[url.pathname];
    if (!asset) return new Response('Not found', {status:404});
    return new Response(request.method === 'HEAD' ? null : asset.binary ? Uint8Array.from(atob(asset.body), c => c.charCodeAt(0)) : asset.body, {headers:{
      'Content-Type':asset.type,
      'Cache-Control':'no-cache',
      'X-Content-Type-Options':'nosniff',
      'Referrer-Policy':'strict-origin-when-cross-origin',
      'Cross-Origin-Resource-Policy':'same-origin'
    }});
  }
};\n`;
const dist = path.join(root, 'dist');
await rm(dist, {recursive:true, force:true});
await mkdir(path.join(dist, 'server'), {recursive:true});
await mkdir(path.join(dist, '.openai'), {recursive:true});
await writeFile(path.join(dist, 'server/index.js'), worker);
await cp(path.join(root, '.openai/hosting.json'), path.join(dist, '.openai/hosting.json'));
await cp(path.join(root, 'drizzle'), path.join(dist, 'drizzle'), {recursive:true});
console.log(`Built hosted Lumen (${Buffer.byteLength(worker)} bytes)`);
