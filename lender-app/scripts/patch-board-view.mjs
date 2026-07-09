import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const p = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "app",
  "pipeline",
  "PipelinePageClient.tsx",
);
let s = fs.readFileSync(p, "utf8");
const marker = '{effectiveView === "board" && (';
const start = s.indexOf(marker);
const end = s.indexOf("\n        )}\n        </div>\n        </div>", start);
if (start < 0 || end < 0) {
  console.error("markers not found", start, end);
  process.exit(1);
}
const replacement = `{effectiveView === "board" && (
          <PipelineBoardView
            rows={filtered}
            stageTree={stageIndex.tree}
            stageIndex={stageIndex}
            hubFocusFileId={hubFocusFileId}
            selectFile={selectFile}
            runPatchPipeline={runPatchPipeline}
            runSetClientMomentum={runSetClientMomentum}
          />
        )}`;
s = s.slice(0, start) + replacement + s.slice(end + "\n        )}".length);
fs.writeFileSync(p, s);
console.log("replaced board block");
