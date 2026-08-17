/**
 * Static regression: public portal layouts must mount PublicPortalProviders
 * so shared deal/PFS widgets do not throw useUserSettings outside the
 * signed-in AppChrome tree.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const LAYOUTS = [
  "app/client-portal/layout.tsx",
  "app/lender-delivery/layout.tsx",
  "app/portal/layout.tsx",
  "app/upload/layout.tsx",
  "app/public/layout.tsx",
] as const;

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

const providersSrc = read("components/portal/PublicPortalProviders.tsx");
assert.match(
  providersSrc,
  /UserSettingsProvider/,
  "PublicPortalProviders must wrap UserSettingsProvider",
);
assert.match(
  providersSrc,
  /UserPreferencesProvider/,
  "PublicPortalProviders must wrap UserPreferencesProvider",
);
assert.match(
  providersSrc,
  /ColorSchemeProvider/,
  "PublicPortalProviders must wrap ColorSchemeProvider",
);

for (const layout of LAYOUTS) {
  const src = read(layout);
  assert.match(
    src,
    /PublicPortalProviders/,
    `${layout} must wrap children with PublicPortalProviders`,
  );
}

console.log("portal-public-providers-tests: ok");
