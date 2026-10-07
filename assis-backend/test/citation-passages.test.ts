import test from 'node:test';
import assert from 'node:assert/strict';
import {citations} from '../src/chat.ts';
test('citations resolve the exact passage when one publication has multiple retrieval hits',()=>{
 const sources=[{id:'L10',versionId:'p3',title:'Guide',passage:'Account authentication',limitations:['undated']},{id:'L10',versionId:'p6',title:'Guide',passage:'Licence application and lease',limitations:['undated']}];
 const result=citations({sources,citations:[{sourceID:'L10',chunkID:'p6',page:6},{sourceID:'L10',chunkID:'p3',page:3}]});
 assert.equal(result[0].excerpt,'Licence application and lease');assert.equal(result[1].excerpt,'Account authentication');assert.equal(result[0].page,6);
});
test('ambiguous or missing passage references do not borrow an unrelated excerpt',()=>{
 const sources=[{id:'same',versionId:'a',passage:'One'},{id:'same',versionId:'b',passage:'Two'}];
 const result=citations({sources,citations:[{sourceID:'same'},{sourceID:'same',chunkID:'missing',excerpt:'Original explicit excerpt'}]});
 assert.equal(result[0].excerpt,undefined);assert.equal(result[1].excerpt,'Original explicit excerpt');
});
test('a single-source legacy citation retains its explicitly supplied excerpt',()=>{
 assert.equal(citations({sources:[{id:'one',title:'Title'}],citations:[{id:'one',excerpt:'Captured evidence'}]})[0].excerpt,'Captured evidence');
});
