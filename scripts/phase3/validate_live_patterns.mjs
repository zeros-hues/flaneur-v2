import postgres from 'postgres';
import { build } from 'esbuild';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { databaseUrl, safeFailure } from '../phase0/environment.mjs';

// Existing live planner only; no enrichment, classification, embeddings or writes.
let sql;
try {
  const compiled = await build({ stdin: { contents: `
    export {postgresRetrievalReader} from './lib/retrieval/postgres-reader';
    export {generateText} from './lib/enrich/groq';
    export {memoryQuery} from './lib/query/memory';
    export {memoryLabelsInTransaction} from './lib/query/postgres-labels';
  `, resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent' });
  const api = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].contents).toString('base64'));
  sql = postgres(databaseUrl('DIRECT_URL'), { max: 1, connect_timeout: 15, onnotice: () => {} });
  const result = await api.memoryQuery('What patterns do you see among the people I keep saving?', new Date().toISOString(), {
    planner: { plan: api.generateText }, reader: api.postgresRetrievalReader(sql),
    async labels(ids) {
      if (!ids.length) return [];
      return sql.begin('isolation level repeatable read read only', async tx => {
        await tx`set local statement_timeout='10s'`;
        return api.memoryLabelsInTransaction(tx, ids);
      });
    },
  });
  const report = { state: result.state, mode: result.mode, evaluated: result.evaluated, patterns: result.patterns ?? [] };
  writeFileSync(join(tmpdir(), 'flaneur-pattern-support-result.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (result.mode !== 'reflect' || result.state !== 'matches') process.exitCode = 1;
} catch (error) { safeFailure(error); process.exitCode = 1; }
finally { await sql?.end({ timeout: 2 }); }
