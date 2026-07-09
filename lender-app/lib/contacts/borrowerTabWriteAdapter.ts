"use client";



import { useMutation } from "convex/react";

import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "@/convex/_generated/api";

import type { DealWorkspaceSheet, DealWorkspaceUpdater } from "@/lib/file/dealSectionTypes";

import { useDealWorkspaceEditor } from "@/lib/file/useDealWorkspaceEditor";

import { useOfflineSync } from "@/lib/offline/OfflineSyncContext";

import { traceConvexMutation } from "@/lib/convexWriteStormGovernance";

import { isPatchDealConflictResult } from "@/lib/pipeline/patchDealResult";

import { useUserSettings } from "@/lib/userSettingsContext";

import { intakeAutosaveDelayMs } from "@/lib/userSettingsStorage";



type Sheet = DealWorkspaceSheet;



export type ContactFirstBorrowerUpdate = {

  /** Pass to BorrowersSection / GuarantorsSection — intercepts dual-write keys. */

  update: DealWorkspaceUpdater;

  /** Legacy deal patch path for sections not yet on contact-first dual-write. */
  updateLegacy: DealWorkspaceUpdater;
  borrowerSaving: boolean;
  borrowerSavedAt: number | null;
  guarantorSaving: boolean;
  guarantorSavedAt: number | null;
  incomeSaving: boolean;
  incomeSavedAt: number | null;
  assetsSaving: boolean;
  assetsSavedAt: number | null;
  reoSaving: boolean;
  reoSavedAt: number | null;
  businessDebtSaving: boolean;
  businessDebtSavedAt: number | null;
  householdSaving: boolean;
  householdSavedAt: number | null;
};



/**

 * Wraps deal editor `update` so borrower and guarantor identity edits dual-write

 * to contacts + dealData (debounced).

 */

export function useContactFirstBorrowerUpdate(): ContactFirstBorrowerUpdate {

  const offline = useOfflineSync();

  const { settings } = useUserSettings();

  const {

    fileId,

    dealBundle,

    draft,

    update,

    updateDraftOnly,

    preferencesAccountId,

  } = useDealWorkspaceEditor();



  const saveBorrowerDualWrite = useMutation(

    api.pipelineContacts.saveBorrowerIdentityDualWrite,

  );

  const saveGuarantorDualWrite = useMutation(

    api.pipelineContacts.saveGuarantorIdentityDualWrite,

  );

  const saveIncomeDualWrite = useMutation(

    api.pipelineContacts.saveIncomeDualWrite,

  );

  const saveAssetsAndLiabilitiesDualWrite = useMutation(

    api.pipelineContacts.saveAssetsAndLiabilitiesDualWrite,

  );

  const saveReoDualWrite = useMutation(

    api.pipelineContacts.saveReoDualWrite,

  );

  const saveBusinessDebtDualWrite = useMutation(

    api.pipelineContacts.saveBusinessDebtDualWrite,

  );

  const saveHouseholdDualWrite = useMutation(

    api.pipelineContacts.saveHouseholdDualWrite,

  );



  const borrowerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const guarantorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const incomeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pfsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const businessDebtTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const householdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pendingBorrowersRef = useRef<Sheet["borrowers"] | null>(null);

  const pendingGuarantorsRef = useRef<Sheet["guarantors"] | null>(null);

  const pendingIncomeRowsRef = useRef<Sheet["incomeRows"] | null>(null);

  type PendingPfsPatch = {
    assets?: Sheet["assets"];
    liabilities?: Sheet["liabilities"];
  };

  const pendingPfsRef = useRef<PendingPfsPatch | null>(null);

  const pendingReoRef = useRef<Sheet["reo"] | null>(null);

  const pendingBusinessDebtRef = useRef<Sheet["weightedInterest"] | null>(null);

  type PendingHouseholdPatch = {
    dependentsCount?: string;
    dependentsAges?: string;
  };

  const pendingHouseholdRef = useRef<PendingHouseholdPatch | null>(null);

  const [borrowerSaving, setBorrowerSaving] = useState(false);

  const [borrowerSavedAt, setBorrowerSavedAt] = useState<number | null>(null);

  const [guarantorSaving, setGuarantorSaving] = useState(false);

  const [guarantorSavedAt, setGuarantorSavedAt] = useState<number | null>(null);

  const [incomeSaving, setIncomeSaving] = useState(false);

  const [incomeSavedAt, setIncomeSavedAt] = useState<number | null>(null);

  const [assetsSaving, setAssetsSaving] = useState(false);

  const [assetsSavedAt, setAssetsSavedAt] = useState<number | null>(null);

  const [reoSaving, setReoSaving] = useState(false);

  const [reoSavedAt, setReoSavedAt] = useState<number | null>(null);

  const [businessDebtSaving, setBusinessDebtSaving] = useState(false);

  const [businessDebtSavedAt, setBusinessDebtSavedAt] = useState<number | null>(
    null,
  );

  const [householdSaving, setHouseholdSaving] = useState(false);

  const [householdSavedAt, setHouseholdSavedAt] = useState<number | null>(null);



  const flushBorrowers = useCallback(async () => {

    const borrowers = pendingBorrowersRef.current;

    if (!borrowers) return;

    pendingBorrowersRef.current = null;

    setBorrowerSaving(true);

    try {

      const expectedUpdatedAt = dealBundle?.pipeline?.updatedAt;

      const res = await saveBorrowerDualWrite({

        fileId,

        borrowers,

        ...(expectedUpdatedAt !== undefined ? { expectedUpdatedAt } : {}),

        ...(preferencesAccountId ? { preferencesAccountId } : {}),

      });

      traceConvexMutation(

        "useContactFirstBorrowerUpdate",

        "pipelineContacts.saveBorrowerIdentityDualWrite",

      );

      if (isPatchDealConflictResult(res)) {

        offline.surfaceSyncConflict(

          "File changed elsewhere. Refreshing latest version.",

        );

        pendingBorrowersRef.current = borrowers;

        return;

      }

      setBorrowerSavedAt(Date.now());

    } catch {

      pendingBorrowersRef.current = borrowers;

    } finally {

      setBorrowerSaving(false);

    }

  }, [

    dealBundle?.pipeline?.updatedAt,

    fileId,

    offline,

    preferencesAccountId,

    saveBorrowerDualWrite,

  ]);



  const flushGuarantors = useCallback(async () => {

    const guarantors = pendingGuarantorsRef.current;

    if (!guarantors) return;

    pendingGuarantorsRef.current = null;

    setGuarantorSaving(true);

    try {

      const expectedUpdatedAt = dealBundle?.pipeline?.updatedAt;

      const res = await saveGuarantorDualWrite({

        fileId,

        guarantors,

        ...(expectedUpdatedAt !== undefined ? { expectedUpdatedAt } : {}),

        ...(preferencesAccountId ? { preferencesAccountId } : {}),

      });

      traceConvexMutation(

        "useContactFirstBorrowerUpdate",

        "pipelineContacts.saveGuarantorIdentityDualWrite",

      );

      if (isPatchDealConflictResult(res)) {

        offline.surfaceSyncConflict(

          "File changed elsewhere. Refreshing latest version.",

        );

        pendingGuarantorsRef.current = guarantors;

        return;

      }

      setGuarantorSavedAt(Date.now());

    } catch {

      pendingGuarantorsRef.current = guarantors;

    } finally {

      setGuarantorSaving(false);

    }

  }, [

    dealBundle?.pipeline?.updatedAt,

    fileId,

    offline,

    preferencesAccountId,

    saveGuarantorDualWrite,

  ]);



  const flushIncome = useCallback(async () => {

    const incomeRows = pendingIncomeRowsRef.current;

    if (!incomeRows) return;

    pendingIncomeRowsRef.current = null;

    setIncomeSaving(true);

    try {

      const expectedUpdatedAt = dealBundle?.pipeline?.updatedAt;

      const res = await saveIncomeDualWrite({

        fileId,

        incomeRows,

        ...(expectedUpdatedAt !== undefined ? { expectedUpdatedAt } : {}),

        ...(preferencesAccountId ? { preferencesAccountId } : {}),

      });

      traceConvexMutation(

        "useContactFirstBorrowerUpdate",

        "pipelineContacts.saveIncomeDualWrite",

      );

      if (isPatchDealConflictResult(res)) {

        offline.surfaceSyncConflict(

          "File changed elsewhere. Refreshing latest version.",

        );

        pendingIncomeRowsRef.current = incomeRows;

        return;

      }

      setIncomeSavedAt(Date.now());

    } catch {

      pendingIncomeRowsRef.current = incomeRows;

    } finally {

      setIncomeSaving(false);

    }

  }, [

    dealBundle?.pipeline?.updatedAt,

    fileId,

    offline,

    preferencesAccountId,

    saveIncomeDualWrite,

  ]);



  const flushPfs = useCallback(async () => {

    const pending = pendingPfsRef.current;

    if (!pending) return;

    if (pending.assets === undefined && pending.liabilities === undefined) {

      return;

    }

    pendingPfsRef.current = null;

    setAssetsSaving(true);

    try {

      const expectedUpdatedAt = dealBundle?.pipeline?.updatedAt;

      const res = await saveAssetsAndLiabilitiesDualWrite({

        fileId,

        ...(pending.assets !== undefined ? { assets: pending.assets } : {}),

        ...(pending.liabilities !== undefined

          ? { liabilities: pending.liabilities }

          : {}),

        ...(expectedUpdatedAt !== undefined ? { expectedUpdatedAt } : {}),

        ...(preferencesAccountId ? { preferencesAccountId } : {}),

      });

      traceConvexMutation(

        "useContactFirstBorrowerUpdate",

        "pipelineContacts.saveAssetsAndLiabilitiesDualWrite",

      );

      if (isPatchDealConflictResult(res)) {

        offline.surfaceSyncConflict(

          "File changed elsewhere. Refreshing latest version.",

        );

        pendingPfsRef.current = {

          ...(pendingPfsRef.current ?? {}),

          ...pending,

        };

        return;

      }

      setAssetsSavedAt(Date.now());

    } catch {

      pendingPfsRef.current = {

        ...(pendingPfsRef.current ?? {}),

        ...pending,

      };

    } finally {

      setAssetsSaving(false);

    }

  }, [

    dealBundle?.pipeline?.updatedAt,

    fileId,

    offline,

    preferencesAccountId,

    saveAssetsAndLiabilitiesDualWrite,

  ]);



  const flushReo = useCallback(async () => {

    const reo = pendingReoRef.current;

    if (!reo) return;

    pendingReoRef.current = null;

    setReoSaving(true);

    try {

      const expectedUpdatedAt = dealBundle?.pipeline?.updatedAt;

      const res = await saveReoDualWrite({

        fileId,

        reo,

        ...(expectedUpdatedAt !== undefined ? { expectedUpdatedAt } : {}),

        ...(preferencesAccountId ? { preferencesAccountId } : {}),

      });

      traceConvexMutation(

        "useContactFirstBorrowerUpdate",

        "pipelineContacts.saveReoDualWrite",

      );

      if (isPatchDealConflictResult(res)) {

        offline.surfaceSyncConflict(

          "File changed elsewhere. Refreshing latest version.",

        );

        pendingReoRef.current = reo;

        return;

      }

      setReoSavedAt(Date.now());

    } catch {

      pendingReoRef.current = reo;

    } finally {

      setReoSaving(false);

    }

  }, [

    dealBundle?.pipeline?.updatedAt,

    fileId,

    offline,

    preferencesAccountId,

    saveReoDualWrite,

  ]);



  const flushBusinessDebt = useCallback(async () => {

    const weightedInterest = pendingBusinessDebtRef.current;

    if (!weightedInterest) return;

    pendingBusinessDebtRef.current = null;

    setBusinessDebtSaving(true);

    try {

      const expectedUpdatedAt = dealBundle?.pipeline?.updatedAt;

      const res = await saveBusinessDebtDualWrite({

        fileId,

        weightedInterest,

        ...(expectedUpdatedAt !== undefined ? { expectedUpdatedAt } : {}),

        ...(preferencesAccountId ? { preferencesAccountId } : {}),

      });

      traceConvexMutation(

        "useContactFirstBorrowerUpdate",

        "pipelineContacts.saveBusinessDebtDualWrite",

      );

      if (isPatchDealConflictResult(res)) {

        offline.surfaceSyncConflict(

          "File changed elsewhere. Refreshing latest version.",

        );

        pendingBusinessDebtRef.current = weightedInterest;

        return;

      }

      setBusinessDebtSavedAt(Date.now());

    } catch {

      pendingBusinessDebtRef.current = weightedInterest;

    } finally {

      setBusinessDebtSaving(false);

    }

  }, [

    dealBundle?.pipeline?.updatedAt,

    fileId,

    offline,

    preferencesAccountId,

    saveBusinessDebtDualWrite,

  ]);



  const flushHousehold = useCallback(async () => {

    const pending = pendingHouseholdRef.current;

    if (!pending) return;

    if (

      pending.dependentsCount === undefined &&

      pending.dependentsAges === undefined

    ) {

      return;

    }

    pendingHouseholdRef.current = null;

    setHouseholdSaving(true);

    try {

      const expectedUpdatedAt = dealBundle?.pipeline?.updatedAt;

      const res = await saveHouseholdDualWrite({

        fileId,

        ...(pending.dependentsCount !== undefined

          ? { dependentsCount: pending.dependentsCount }

          : {}),

        ...(pending.dependentsAges !== undefined

          ? { dependentsAges: pending.dependentsAges }

          : {}),

        ...(expectedUpdatedAt !== undefined ? { expectedUpdatedAt } : {}),

        ...(preferencesAccountId ? { preferencesAccountId } : {}),

      });

      traceConvexMutation(

        "useContactFirstBorrowerUpdate",

        "pipelineContacts.saveHouseholdDualWrite",

      );

      if (isPatchDealConflictResult(res)) {

        offline.surfaceSyncConflict(

          "File changed elsewhere. Refreshing latest version.",

        );

        pendingHouseholdRef.current = pending;

        return;

      }

      setHouseholdSavedAt(Date.now());

    } catch {

      pendingHouseholdRef.current = pending;

    } finally {

      setHouseholdSaving(false);

    }

  }, [

    dealBundle?.pipeline?.updatedAt,

    fileId,

    offline,

    preferencesAccountId,

    saveHouseholdDualWrite,

  ]);



  const queueBorrowerDualWrite = useCallback(

    (borrowers: Sheet["borrowers"]) => {

      pendingBorrowersRef.current = borrowers;

      if (borrowerTimerRef.current) clearTimeout(borrowerTimerRef.current);

      borrowerTimerRef.current = setTimeout(

        () => {

          void flushBorrowers();

        },

        intakeAutosaveDelayMs(settings.intakeAutosaveCadence),

      );

    },

    [flushBorrowers, settings.intakeAutosaveCadence],

  );



  const queueGuarantorDualWrite = useCallback(

    (guarantors: Sheet["guarantors"]) => {

      pendingGuarantorsRef.current = guarantors;

      if (guarantorTimerRef.current) clearTimeout(guarantorTimerRef.current);

      guarantorTimerRef.current = setTimeout(

        () => {

          void flushGuarantors();

        },

        intakeAutosaveDelayMs(settings.intakeAutosaveCadence),

      );

    },

    [flushGuarantors, settings.intakeAutosaveCadence],

  );



  const queueIncomeDualWrite = useCallback(

    (incomeRows: Sheet["incomeRows"]) => {

      pendingIncomeRowsRef.current = incomeRows;

      if (incomeTimerRef.current) clearTimeout(incomeTimerRef.current);

      incomeTimerRef.current = setTimeout(

        () => {

          void flushIncome();

        },

        intakeAutosaveDelayMs(settings.intakeAutosaveCadence),

      );

    },

    [flushIncome, settings.intakeAutosaveCadence],

  );



  const queuePfsDualWrite = useCallback(

    (patch: PendingPfsPatch) => {

      pendingPfsRef.current = {

        ...(pendingPfsRef.current ?? {}),

        ...patch,

      };

      if (pfsTimerRef.current) clearTimeout(pfsTimerRef.current);

      pfsTimerRef.current = setTimeout(

        () => {

          void flushPfs();

        },

        intakeAutosaveDelayMs(settings.intakeAutosaveCadence),

      );

    },

    [flushPfs, settings.intakeAutosaveCadence],

  );



  const queueReoDualWrite = useCallback(

    (reo: NonNullable<Sheet["reo"]>) => {

      pendingReoRef.current = reo;

      if (reoTimerRef.current) clearTimeout(reoTimerRef.current);

      reoTimerRef.current = setTimeout(

        () => {

          void flushReo();

        },

        intakeAutosaveDelayMs(settings.intakeAutosaveCadence),

      );

    },

    [flushReo, settings.intakeAutosaveCadence],

  );



  const queueBusinessDebtDualWrite = useCallback(

    (weightedInterest: NonNullable<Sheet["weightedInterest"]>) => {

      pendingBusinessDebtRef.current = weightedInterest;

      if (businessDebtTimerRef.current) {

        clearTimeout(businessDebtTimerRef.current);

      }

      businessDebtTimerRef.current = setTimeout(

        () => {

          void flushBusinessDebt();

        },

        intakeAutosaveDelayMs(settings.intakeAutosaveCadence),

      );

    },

    [flushBusinessDebt, settings.intakeAutosaveCadence],

  );



  const queueHouseholdDualWrite = useCallback(

    (patch: PendingHouseholdPatch) => {

      pendingHouseholdRef.current = patch;

      if (householdTimerRef.current) clearTimeout(householdTimerRef.current);

      householdTimerRef.current = setTimeout(

        () => {

          void flushHousehold();

        },

        intakeAutosaveDelayMs(settings.intakeAutosaveCadence),

      );

    },

    [flushHousehold, settings.intakeAutosaveCadence],

  );



  useEffect(() => {

    return () => {

      if (borrowerTimerRef.current) clearTimeout(borrowerTimerRef.current);

      if (guarantorTimerRef.current) clearTimeout(guarantorTimerRef.current);

      if (incomeTimerRef.current) clearTimeout(incomeTimerRef.current);

      if (pfsTimerRef.current) clearTimeout(pfsTimerRef.current);

      if (reoTimerRef.current) clearTimeout(reoTimerRef.current);

      if (businessDebtTimerRef.current) {

        clearTimeout(businessDebtTimerRef.current);

      }

      if (householdTimerRef.current) clearTimeout(householdTimerRef.current);

      void flushBorrowers();

      void flushGuarantors();

      void flushIncome();

      void flushPfs();

      void flushReo();

      void flushBusinessDebt();

      void flushHousehold();

    };

  }, [

    flushBorrowers,

    flushGuarantors,

    flushIncome,

    flushPfs,

    flushReo,

    flushBusinessDebt,

    flushHousehold,

  ]);



  const wrappedUpdate = useCallback<DealWorkspaceUpdater>(

    (key, value) => {

      if (key === "borrowers") {

        updateDraftOnly("borrowers", value as Sheet["borrowers"]);

        queueBorrowerDualWrite(value as Sheet["borrowers"]);

        return;

      }

      if (key === "guarantors") {

        updateDraftOnly("guarantors", value as Sheet["guarantors"]);

        queueGuarantorDualWrite(value as Sheet["guarantors"]);

        return;

      }

      if (key === "incomeRows") {

        updateDraftOnly("incomeRows", value as Sheet["incomeRows"]);

        queueIncomeDualWrite(value as Sheet["incomeRows"]);

        return;

      }

      if (key === "assets") {

        updateDraftOnly("assets", value as Sheet["assets"]);

        queuePfsDualWrite({ assets: value as Sheet["assets"] });

        return;

      }

      if (key === "liabilities") {

        updateDraftOnly("liabilities", value as Sheet["liabilities"]);

        queuePfsDualWrite({ liabilities: value as Sheet["liabilities"] });

        return;

      }

      if (key === "reo") {

        updateDraftOnly("reo", value as Sheet["reo"]);

        queueReoDualWrite(value as NonNullable<Sheet["reo"]>);

        return;

      }

      if (key === "weightedInterest") {

        updateDraftOnly(

          "weightedInterest",

          value as NonNullable<Sheet["weightedInterest"]>,

        );

        queueBusinessDebtDualWrite(

          value as NonNullable<Sheet["weightedInterest"]>,

        );

        return;

      }

      if (key === "dependentsCount") {
        updateDraftOnly("dependentsCount", value as string);
        queueHouseholdDualWrite({
          dependentsCount: value as string,
          dependentsAges: draft?.dependentsAges ?? "",
        });
        return;
      }

      if (key === "dependentsAges") {
        updateDraftOnly("dependentsAges", value as string);
        queueHouseholdDualWrite({
          dependentsCount: draft?.dependentsCount ?? "",
          dependentsAges: value as string,
        });
        return;
      }

      update(key, value);

    },

    [

      queueBorrowerDualWrite,

      queueGuarantorDualWrite,

      queueIncomeDualWrite,

      queuePfsDualWrite,

      queueReoDualWrite,

      queueBusinessDebtDualWrite,

      queueHouseholdDualWrite,

      update,

      updateDraftOnly,

      draft?.dependentsCount,

      draft?.dependentsAges,

    ],

  );



  return {

    update: wrappedUpdate,

    updateLegacy: update,

    borrowerSaving,

    borrowerSavedAt,

    guarantorSaving,

    guarantorSavedAt,

    incomeSaving,

    incomeSavedAt,

    assetsSaving,

    assetsSavedAt,

    reoSaving,

    reoSavedAt,

    businessDebtSaving,

    businessDebtSavedAt,

    householdSaving,

    householdSavedAt,

  };

}

