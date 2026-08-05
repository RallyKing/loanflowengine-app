/**
 * Unit checks for pipeline hub borrower/entity search tokens.
 * Run: npx tsx scripts/pipeline-deal-party-search-tests.ts
 */

import assert from "node:assert/strict";
import { buildPipelineDealPartySearchBlob } from "../lib/pipeline/pipelineDealPartySearch";

function main() {
  const blob = buildPipelineDealPartySearchBlob({
    clientName: "Primary Client LLC",
    business: { legalName: "Acme Holdings LLC", dba: "Acme Co" },
    borrowers: [
      { firstName: "Pat", lastName: "Nguyen" },
      { firstName: "Sam", middleName: "Q", lastName: "Rivera" },
    ],
    guarantors: [{ name: "Jordan Lee" }],
    cover: { borrowers: "Cover Party" },
  }).toLowerCase();

  for (const token of [
    "primary client llc",
    "acme holdings llc",
    "acme co",
    "pat",
    "nguyen",
    "pat nguyen",
    "sam q rivera",
    "rivera",
    "jordan lee",
    "cover party",
  ]) {
    assert.ok(blob.includes(token), `expected search blob to include "${token}"`);
  }

  assert.equal(buildPipelineDealPartySearchBlob(null), "");
  assert.equal(buildPipelineDealPartySearchBlob(undefined), "");
  assert.equal(buildPipelineDealPartySearchBlob({}), "");

  console.log("pipeline-deal-party-search-tests: ok");
}

main();
