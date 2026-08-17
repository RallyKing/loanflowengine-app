/**
 * Smoke checks for floating-block host cascade helper + favorites key map +
 * Document Vault provider ancestry (WiW host is outside tab panels).
 * Run: npx tsx scripts/floating-block-window-host-tests.ts
 */
import React from "react";
import { renderToString } from "react-dom/server";
import { nextFloatingBlockCascadeIndex } from "../components/ui/FloatingBlockWindowProvider";
import { floatingBlockKeyForPipelineBlock } from "../lib/pipeline/fileWorkspaceTabRouting";
import {
  DOCUMENTS_TAB_SECTION_IDS,
  MODULAR_BLOCK_SECTION_IDS,
  OVERVIEW_TAB_SECTION_IDS,
  SETTINGS_TAB_SECTION_IDS,
} from "../lib/pipeline/fileWorkspaceTabRouting";
import { vaultDocumentFloatingBlockKey } from "../lib/library/vaultDocumentFloatingKey";
import {
  DocumentVaultStateProvider,
  useDocumentVaultState,
} from "../lib/library/documentVaultState";

const a = nextFloatingBlockCascadeIndex();
const b = nextFloatingBlockCascadeIndex();
if (!(b > a)) {
  throw new Error(`cascade should increase: ${a} -> ${b}`);
}

if (
  vaultDocumentFloatingBlockKey("jd7exampledocid" as never) !==
  "vault-doc:jd7exampledocid"
) {
  throw new Error("vault document WiW key must be vault-doc:<id>");
}

if (
  floatingBlockKeyForPipelineBlock("fileNotes") !==
  OVERVIEW_TAB_SECTION_IDS.notes
) {
  throw new Error("fileNotes WiW key should match overview notes section id");
}
if (
  floatingBlockKeyForPipelineBlock("people") !== SETTINGS_TAB_SECTION_IDS.sharing
) {
  throw new Error("people WiW key should match settings sharing section id");
}
if (
  floatingBlockKeyForPipelineBlock("pfs") !== MODULAR_BLOCK_SECTION_IDS.pfs
) {
  throw new Error("pfs WiW key should match modular PFS section id");
}
if (
  floatingBlockKeyForPipelineBlock("simplePl") !==
  MODULAR_BLOCK_SECTION_IDS.simplePl
) {
  throw new Error("simplePl WiW key should match modular Simple P&L section id");
}

if (DOCUMENTS_TAB_SECTION_IDS.vault !== "pipeline-documents-vault") {
  throw new Error(
    "Document Vault CollapsibleBlock id must stay stable for WiW detach key",
  );
}

function VaultProbe() {
  useDocumentVaultState();
  return React.createElement("div", { "data-vault-ok": "1" });
}

let threwWithoutProvider = false;
try {
  renderToString(React.createElement(VaultProbe));
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  if (!msg.includes("DocumentVaultStateProvider")) {
    throw new Error(`unexpected vault hook error: ${msg}`);
  }
  threwWithoutProvider = true;
}
if (!threwWithoutProvider) {
  throw new Error(
    "useDocumentVaultState must throw outside DocumentVaultStateProvider (WiW regression guard)",
  );
}

const withProvider = renderToString(
  React.createElement(
    DocumentVaultStateProvider,
    null,
    React.createElement(VaultProbe),
  ),
);
if (!withProvider.includes("data-vault-ok")) {
  throw new Error(
    "DocumentVaultStateProvider must supply context to descendants (same tree as FloatingBlockWindowHost)",
  );
}

console.log("floating-block-window-host-tests: ok");
