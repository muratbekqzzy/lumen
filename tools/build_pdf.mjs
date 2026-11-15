// Bundle the pinned PDF renderer and its worker locally; original PDFs stay private.
import {cp,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.join(root,'web/pdfjs');
await mkdir(out,{recursive:true});
await cp(path.join(root,'node_modules/pdfjs-dist/legacy/build/pdf.min.mjs'),path.join(out,'pdf.mjs'));
await cp(path.join(root,'node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs'),path.join(out,'pdf.worker.mjs'));
await cp(path.join(root,'node_modules/pdfjs-dist/LICENSE'),path.join(out,'LICENSE'));
// Local support data makes embedded fonts and image-only slides independent of a CDN.
for(const dir of ['cmaps','standard_fonts','wasm'])await cp(path.join(root,'node_modules/pdfjs-dist',dir),path.join(out,dir),{recursive:true});
console.log('Bundled PDF renderer, worker and support data.');
