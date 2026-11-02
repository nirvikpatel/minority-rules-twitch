import {cp,mkdir,readdir,readFile,writeFile} from 'node:fs/promises';
import {join,relative,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {zipSync} from 'fflate';
const project=fileURLToPath(new URL('..',import.meta.url));
const input=join(project,'extension-dist'),files={};
async function collect(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const path=join(dir,entry.name);if(entry.isDirectory())await collect(path);else files[relative(input,path).replaceAll('\\','/')]=new Uint8Array(await readFile(path));}}
await collect(input);
if(!files['viewer.html']||!files['config.html'])throw new Error('Missing Extension HTML entrypoints.');
await mkdir(join(project,'dist','extension'),{recursive:true});
await cp(input,join(project,'dist','extension'),{recursive:true});
const output=resolve(project,'..','minority-rules-extension.zip');
await writeFile(output,zipSync(files,{level:9}));
console.log(`Extension packaged: ${Object.keys(files).length} files → ${output}`);
