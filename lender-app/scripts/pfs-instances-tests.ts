/**
 * Multi-instance PFS normalize / copy / portal snapshot scoping.
 * Run: npx tsx scripts/pfs-instances-tests.ts
 */
import assert from "node:assert/strict";
import {
  applyPfsCopyPlan,
  clonePfsInstanceForCopy,
  createEmptyPfsInstance,
  findPfsInstance,
  findPfsInstanceByVaultTask,
  normalizePfsInstances,
  pfsDealPatchFromInstances,
  pfsInstanceDisplayName,
  planPfsCopy,
  removePfsInstance,
  replacePfsInstanceData,
} from "../lib/pfs/pfsInstances";
import { createEmptyPersonalFinancialStatement } from "../lib/pfs/personalFinancialStatementModel";
import {
  pfsAssociatedFormTitle,
  planPfsAssociations,
} from "../lib/pfs/pfsFormAssociation";
import {
  bundleIncludesFileTask,
  resolveBundleFileTaskIds,
} from "../convex/portalBundleTaskScope";
import { hashPassword, randomHex, verifyPassword } from "../convex/clientPortalCrypto";

function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(() => fn())
    .then(() => {
      console.log(`ok — ${name}`);
    })
    .catch((e) => {
      console.error(`FAIL — ${name}`);
      throw e;
    });
}

async function main() {
  await test("legacy pfs seeds a single instance", () => {
    const list = normalizePfsInstances({
      pfs: {
        v: 1,
        header: { names: "Alex Borrower" },
        assets: { cashOnHandAndBanks: "1000" },
      },
    });
    assert.equal(list.length, 1);
    assert.equal(list[0]!.name, "Alex Borrower");
    assert.equal(list[0]!.data.header.names, "Alex Borrower");
  });

  await test("pfsInstances stay first-class and do not overwrite each other", () => {
    const a = createEmptyPfsInstance({ name: "Borrower A" });
    a.data = {
      ...createEmptyPersonalFinancialStatement(),
      header: { names: "A" },
      assets: {
        ...createEmptyPersonalFinancialStatement().assets,
        cashOnHandAndBanks: "10",
      },
    };
    const b = createEmptyPfsInstance({ name: "Borrower B" });
    b.data = {
      ...createEmptyPersonalFinancialStatement(),
      header: { names: "B" },
      assets: {
        ...createEmptyPersonalFinancialStatement().assets,
        cashOnHandAndBanks: "99",
      },
    };
    const next = replacePfsInstanceData([a, b], b.id, {
      ...b.data,
      header: { names: "B Updated" },
    });
    assert.equal(findPfsInstance(next, a.id)?.data.header.names, "A");
    assert.equal(findPfsInstance(next, b.id)?.data.header.names, "B Updated");
    const patch = pfsDealPatchFromInstances(next);
    assert.equal(patch.pfs.header.names, "A");
    assert.equal(patch.pfsInstances.length, 2);
  });

  await test("copy clones selected PFS with new ids and assigned contacts", () => {
    const source = [
      {
        ...createEmptyPfsInstance({
          name: "Guarantor 1",
          assignedContactIds: ["c1", "c2"],
        }),
        vaultFileTaskId: "task-old",
      },
      createEmptyPfsInstance({ name: "Guarantor 2" }),
    ];
    const plan = planPfsCopy({
      mode: "rows",
      sourceInstances: source,
      instanceIndexes: [0],
    });
    assert.equal(plan.rows.length, 1);
    assert.notEqual(plan.rows[0]!.id, source[0]!.id);
    assert.equal(plan.rows[0]!.name, "Guarantor 1");
    assert.deepEqual(plan.rows[0]!.assignedContactIds, ["c1", "c2"]);
    assert.equal(plan.rows[0]!.vaultFileTaskId, undefined);
    const merged = applyPfsCopyPlan({
      targetInstances: [createEmptyPfsInstance({ name: "Existing" })],
      plan,
    });
    assert.equal(merged.length, 2);
    assert.equal(pfsInstanceDisplayName(merged[1]!), "Guarantor 1");
  });

  await test("clonePfsInstanceForCopy drops vault task id", () => {
    const cloned = clonePfsInstanceForCopy({
      id: "old",
      name: "Keep label",
      vaultFileTaskId: "vault-1",
      intakeFormId: "form-old",
      assignedContactIds: ["c9"],
      data: createEmptyPersonalFinancialStatement(),
    });
    assert.notEqual(cloned.id, "old");
    assert.equal(cloned.vaultFileTaskId, undefined);
    assert.equal(cloned.intakeFormId, undefined);
    assert.deepEqual(cloned.assignedContactIds, ["c9"]);
  });

  await test("each PFS plans a distinct titled form and vault task", () => {
    const a = createEmptyPfsInstance({ name: "Borrower A" });
    const b = createEmptyPfsInstance({ name: "Borrower B" });
    const plan = planPfsAssociations({
      instances: [a, b],
      forms: [
        {
          id: "form-generic",
          name: "Personal Financial Statement",
        },
      ],
      vaultTasks: [
        {
          id: "task-generic",
          title: "Complete: Personal financial statement",
          assignedBlockIds: ["pfs_statement"],
          taskType: "block_assignment",
          status: "incomplete",
        },
      ],
    });
    assert.equal(plan.length, 2);
    assert.equal(plan[0]!.title, "PFS: Borrower A");
    assert.equal(plan[1]!.title, "PFS: Borrower B");
    assert.equal(plan[0]!.formId, "form-generic");
    assert.equal(plan[0]!.renameForm, true);
    assert.equal(plan[0]!.vaultFileTaskId, "task-generic");
    assert.equal(plan[0]!.renameVaultTask, true);
    assert.equal(plan[1]!.createForm, true);
    assert.equal(plan[1]!.createVaultTask, true);
    assert.notEqual(plan[0]!.formId, plan[1]!.formId);
    assert.notEqual(plan[0]!.vaultFileTaskId, plan[1]!.vaultFileTaskId);
  });

  await test("sourceInstanceId and titles stay matched without sharing", () => {
    const a = {
      ...createEmptyPfsInstance({ name: "Alex" }),
      vaultFileTaskId: "task-a",
      intakeFormId: "form-a",
    };
    const b = createEmptyPfsInstance({ name: "Blair" });
    const plan = planPfsAssociations({
      instances: [a, b],
      forms: [
        {
          id: "form-a",
          name: "PFS: Alex",
          sourceKind: "pfs_instance",
          sourceInstanceId: a.id,
        },
        {
          id: "form-b",
          name: "PFS: Blair",
          sourceKind: "pfs_instance",
          sourceInstanceId: b.id,
        },
      ],
      vaultTasks: [
        {
          id: "task-a",
          title: "PFS: Alex",
          sourceKind: "pfs_instance",
          sourceInstanceId: a.id,
          assignedBlockIds: ["pfs_statement"],
          taskType: "block_assignment",
        },
        {
          id: "task-b",
          title: "PFS: Blair",
          sourceKind: "pfs_instance",
          sourceInstanceId: b.id,
          assignedBlockIds: ["pfs_statement"],
          taskType: "block_assignment",
        },
      ],
    });
    assert.equal(plan[0]!.formId, "form-a");
    assert.equal(plan[0]!.vaultFileTaskId, "task-a");
    assert.equal(plan[0]!.createForm, false);
    assert.equal(plan[1]!.formId, "form-b");
    assert.equal(plan[1]!.vaultFileTaskId, "task-b");
    assert.equal(pfsAssociatedFormTitle(b), "PFS: Blair");
  });

  await test("remove last PFS leaves an empty instance", () => {
    const only = createEmptyPfsInstance({ name: "Only" });
    const next = removePfsInstance([only], only.id);
    assert.equal(next.length, 1);
    assert.notEqual(next[0]!.id, only.id);
  });

  await test("portal snapshot exposes only the unlocked PFS instance", () => {
    const a = createEmptyPfsInstance({ name: "A" });
    a.data = {
      ...createEmptyPersonalFinancialStatement(),
      header: { names: "Secret A", residencePhone: "111" },
    };
    const b = createEmptyPfsInstance({ name: "B" });
    b.data = {
      ...createEmptyPersonalFinancialStatement(),
      header: { names: "Secret B", residencePhone: "222" },
    };
    b.vaultFileTaskId = "task-b";
    const unlocked =
      findPfsInstance([a, b], b.id) ??
      findPfsInstanceByVaultTask([a, b], "task-b");
    assert.equal(unlocked?.data.header.names, "Secret B");
    assert.notEqual(unlocked?.id, a.id);
    assert.equal(findPfsInstanceByVaultTask([a, b], "task-b")?.id, b.id);
  });

  await test("all_outstanding bundles include new PFS vault tasks", () => {
    const snapshotId = "task_old" as never;
    const newPfsId = "task_pfs_new" as never;
    const row = {
      fileTaskIds: [snapshotId],
      mode: "all_outstanding" as const,
    };
    const allTasks = [
      {
        _id: snapshotId,
        isArchived: false,
        isPortalVisible: true,
        status: "incomplete",
      },
      {
        _id: newPfsId,
        isArchived: false,
        isPortalVisible: true,
        status: "incomplete",
        sourceKind: "pfs_instance",
      },
    ];
    const ids = resolveBundleFileTaskIds(row as never, allTasks as never);
    assert.equal(ids.length, 2);
    assert.ok(bundleIncludesFileTask(row as never, allTasks as never, newPfsId));
  });

  await test(
    "PBKDF2 password verify is case-sensitive and never stores plaintext",
    async () => {
      const salt = randomHex(16);
      const hash = await hashPassword("123-45-6789", salt);
      assert.notEqual(hash.toLowerCase(), "123-45-6789");
      assert.equal(await verifyPassword("123-45-6789", salt, hash), true);
      assert.equal(await verifyPassword("123-45-6780", salt, hash), false);
      assert.equal(await verifyPassword("123-45-6789 ", salt, hash), false);
    },
  );

  console.log("\nAll PFS instance tests passed.");
}

void main();
