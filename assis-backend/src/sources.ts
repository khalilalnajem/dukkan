import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hash } from '../contracts/index.ts';
const sourceRoot=resolve(dirname(fileURLToPath(import.meta.url)),'../data/sources');
export function sourceFingerprint(){return hash(existsSync(sourceRoot)?readdirSync(sourceRoot).sort().map(name=>({name,hash:hash(readFileSync(resolve(sourceRoot,name)))})):[]);}
