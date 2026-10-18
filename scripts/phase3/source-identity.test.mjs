import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
const output=await build({entryPoints:['lib/identity/source-review.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {sourceReviewQuery}=await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].contents).toString('base64')}`);
test('source-first Person lookup requires an explicit bounded name search and valid cursor',()=>{
 for(const input of [{q:''},{q:'a'},{q:'x'.repeat(101)},{cursor:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'},{q:'name',cursor:'invalid'},{q:'name',invented:true}])
  assert.equal(sourceReviewQuery.safeParse(input).success,false);
 assert.deepEqual(sourceReviewQuery.parse({q:'  Example  '}),{q:'Example'});
 assert.equal(sourceReviewQuery.safeParse({}).success,true);
 assert.equal(sourceReviewQuery.safeParse({q:'%_'}).success,true); // SQL uses literal substring, never LIKE patterns.
});
