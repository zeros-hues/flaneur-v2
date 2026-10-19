import fs from "fs";
import postgres from "postgres";
import { postgresRetrievalReader } from "../../lib/retrieval/postgres-reader.ts";
import { plannedQuery } from "../../lib/retrieval/planned-query.ts";
import { generateText } from "../../lib/enrich/groq.ts";
import { memoryQuery } from "../../lib/query/memory.ts";
import { memoryLabelsInTransaction } from "../../lib/query/postgres-labels.ts";

const env = Object.fromEntries(
  fs.readFileSync(".env", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "")];
    })
);

for (const [k, v] of Object.entries(env)) {
  process.env[k] = v;
}

const sql = postgres(env.DIRECT_URL, { max: 1 });

async function validateLive() {
  console.log("=================================================================");
  console.log("RUNNING LIVE MILESTONE C PATTERN TEST ON NEON DEV CORPUS");
  console.log("Query: 'What patterns do you see among the people I keep saving?'");
  console.log("=================================================================\n");

  const question = "What patterns do you see among the people I keep saving?";
  const referenceInstant = new Date().toISOString();

  // Test full end-to-end memoryQuery with live Groq planner and read-only Postgres reader:
  const block = await memoryQuery(question, referenceInstant, {
    planner: { plan: generateText },
    reader: postgresRetrievalReader(sql),
    async labels(ids) {
      if (!ids.length) return [];
      const result = await sql.begin("isolation level read committed read only", async (tx) => {
        await tx`set local statement_timeout = '10s'`;
        return { rows: await memoryLabelsInTransaction(tx, ids) };
      });
      return result.rows;
    },
  });

  console.log("Result State:", block.state);
  console.log("Result Mode:", block.mode);
  console.log("Interpretation:", block.interpretation);
  console.log("Evaluated Candidates:", block.evaluated);
  console.log("Matched Total:", block.matchedTotal);
  console.log("Discovered Patterns Count:", block.patterns?.length ?? 0);

  if (block.patterns) {
    console.log("\n---------------- DISCOVERED PATTERNS ----------------");
    for (let i = 0; i < block.patterns.length; i++) {
      const p = block.patterns[i];
      console.log(`\n[PATTERN ${i + 1}]`);
      console.log(`Headline: ${p.headline}`);
      console.log(`Statement: "${p.observationCopy}"`);
      console.log(`Type: ${p.patternType}`);
      console.log(`Dimension: ${p.dimensionKey} = ${p.dimensionValue}`);
      console.log(`Supporting People (${p.supportingPeopleCount} of ${p.totalPopulation}):`);
      console.log(`Specificity Score: ${p.specificityScore}`);
      console.log(`Composite Score: ${p.compositeScore.toFixed(4)}`);

      for (const sp of p.supportingPeople) {
        console.log(`\n  - Person: ${sp.personName} (${sp.personId})`);
        if (sp.headline) console.log(`    Headline: ${sp.headline}`);
        console.log(`    Supporting Signals (${sp.signals.length}):`);
        for (const sig of sp.signals) {
          console.log(`      * [${sig.supportKind}] ${sig.label}: "${sig.value}"`);
        }
      }
    }
  }

  await sql.end();
}

validateLive().catch((e) => {
  console.error("Validation error:", e);
  process.exit(1);
});
