/**
 * Validates pipeline block registry: unique ids, structure, and that
 * each `componentReference` path exists under lender-app/.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import {
  PIPELINE_BLOCKS,
  validatePipelineBlockRegistry,
} from "../lib/pipelineBlockRegistry";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");

function main(): void {
  const structural = validatePipelineBlockRegistry();
  if (!structural.ok) {
    // eslint-disable-next-line no-console
    console.error(structural.errors.join("\n"));
    process.exit(1);
  }

  const missing: string[] = [];
  for (const block of PIPELINE_BLOCKS) {
    const rel = block.componentReference.replace(/^\.\//, "");
    const abs = path.join(appRoot, rel);
    if (!fs.existsSync(abs)) {
      missing.push(
        `${block.blockId}: componentReference ${block.componentReference} -> missing file ${abs}`,
      );
    }
  }

  if (missing.length > 0) {
    // eslint-disable-next-line no-console
    console.error(
      "Pipeline block registry: componentReference files not found:\n" +
        missing.join("\n"),
    );
    process.exit(1);
  }

  // eslint-disable-next-line no-console
  console.log(
    "Pipeline block registry OK:",
    PIPELINE_BLOCKS.length,
    "blocks; all componentReference paths exist.",
  );
}

main();
