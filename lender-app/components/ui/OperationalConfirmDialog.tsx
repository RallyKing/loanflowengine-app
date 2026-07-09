"use client";



import {

  createContext,

  useCallback,

  useContext,

  useEffect,

  useId,

  useMemo,

  useRef,

  useState,

  type ReactNode,

} from "react";

import { AlertTriangle, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/Button";

import { Input } from "@/components/ui/Input";

import { DestructiveConfirmShell } from "@/components/ui/DestructiveConfirmShell";
import { OperationalConfirmOverlayHost } from "@/components/ui/OperationalConfirmOverlayHost";
import { useDestructiveConfirmPresentation } from "@/lib/ui/useDestructiveConfirmPresentation";

import { OperationalDisclosurePanel, OperationalDisclosureToggle } from "@/components/ui/OperationalDisclosure";

import { cn } from "@/lib/cn";

import { traceDeleteExecution } from "@/lib/ui/deleteExecutionTrace";

import { focusOperationalContainer } from "@/lib/ui/operationalFocus";

import { useOperationalMutationState } from "@/lib/ui/operationalMutationState";

import {

  OP_CONFIRM_ACTIONS,

  OP_CONFIRM_BODY,

  OP_CONFIRM_CANCEL_ZONE,

  OP_CONFIRM_CASCADE_SURFACE,

  OP_CONFIRM_DANGER_ZONE,

  OP_CONFIRM_ENTITY,

  OP_CONFIRM_ERROR,
  OP_CONFIRM_ERROR_SLOT,

  OP_CONFIRM_FOOTER,

  OP_CONFIRM_HEADER,

  OP_CONFIRM_IMPACT,

  OP_CONFIRM_PANEL,

  OP_CONFIRM_PREVIEW_LABEL,

  OP_CONFIRM_PREVIEW_SURFACE,

  OP_CONFIRM_PREVIEW_VALUE,

  OP_CONFIRM_TERTIARY,

  OP_CONFIRM_TITLE,

  OP_CONFIRM_TYPED_INPUT,

  operationalConfirmLabelForVariant,

  type OperationalConfirmCascadeItem,

  type OperationalConfirmPreview,

  type OperationalConfirmVariant,

} from "@/lib/ui/operationalConfirm";



export type OperationalConfirmDialogProps = {

  open: boolean;

  onOpenChange: (open: boolean) => void;

  variant?: OperationalConfirmVariant;

  /** Primary — action framing */

  title: string;

  /** Primary — entity being affected */

  entityName: string;

  /** Secondary — calm impact explanation */

  impact?: string;

  preview?: OperationalConfirmPreview;

  cascade?: OperationalConfirmCascadeItem[];

  tertiary?: ReactNode;

  confirmLabel?: string;

  cancelLabel?: string;

  requireTypedConfirm?: string;

  pending?: boolean;

  error?: string | null;

  onConfirm: () => void | Promise<void>;

  onCancel?: () => void;

  testId?: string;

};



function EntityPreviewBlock({ preview }: { preview: OperationalConfirmPreview }) {

  return (

    <div className={OP_CONFIRM_PREVIEW_SURFACE} data-testid="confirm-entity-preview">

      {preview.hierarchy ? (

        <div>

          <p className={OP_CONFIRM_PREVIEW_LABEL}>Context</p>

          <p className={OP_CONFIRM_PREVIEW_VALUE}>{preview.hierarchy}</p>

        </div>

      ) : null}

      {preview.ownership ? (

        <div>

          <p className={OP_CONFIRM_PREVIEW_LABEL}>Ownership</p>

          <p className={OP_CONFIRM_PREVIEW_VALUE}>{preview.ownership}</p>

        </div>

      ) : null}

      {preview.relationshipCounts?.length ? (

        <ul className="grid gap-1.5 sm:grid-cols-2">

          {preview.relationshipCounts.map((row) => (

            <li

              key={row.label}

              className="flex items-baseline justify-between gap-2 text-sm"

            >

              <span className="text-muted-foreground">{row.label}</span>

              <span className="font-medium tabular-nums text-foreground">

                {row.count}

              </span>

            </li>

          ))}

        </ul>

      ) : null}

      {preview.rows?.map((row) => (

        <div key={`${row.label}-${row.value}`}>

          <p className={OP_CONFIRM_PREVIEW_LABEL}>{row.label}</p>

          <p className={OP_CONFIRM_PREVIEW_VALUE}>{row.value}</p>

        </div>

      ))}

    </div>

  );

}



/**

 * Phase 18.8E — destructive confirmation (isolated shell + scroll-owned body).

 */

export function OperationalConfirmDialog({

  open,

  onOpenChange,

  variant = "delete",

  title,

  entityName,

  impact,

  preview,

  cascade,

  tertiary,

  confirmLabel,

  cancelLabel = "Cancel",

  requireTypedConfirm,

  pending = false,

  error,

  onConfirm,

  onCancel,

  testId = "operational-confirm-dialog",

}: OperationalConfirmDialogProps) {

  const titleId = useId();

  const panelRef = useRef<HTMLDivElement>(null);

  const presentation = useDestructiveConfirmPresentation();

  const [typed, setTyped] = useState("");

  const [cascadeOpen, setCascadeOpen] = useState(false);

  const confirmDisabled =

    pending ||

    (requireTypedConfirm ? typed.trim() !== requireTypedConfirm : false);



  useEffect(() => {

    if (!open) {

      setTyped("");

      setCascadeOpen(false);

      return;

    }

    traceDeleteExecution("operational_confirm_dialog", "modal_open", { testId });

    const t = window.setTimeout(() => {

      focusOperationalContainer(panelRef.current);

    }, 40);

    return () => window.clearTimeout(t);

  }, [open, testId]);



  const handleClose = useCallback(() => {

    traceDeleteExecution("operational_confirm_dialog", "cancel_pressed", {

      testId,

      pending,

    });

    traceDeleteExecution("operational_confirm_dialog", "overlay_dismissed", {

      testId,

    });

    onCancel?.();

    onOpenChange(false);

  }, [onCancel, onOpenChange, pending, testId]);



  const handleConfirm = useCallback(async () => {

    if (confirmDisabled) return;

    traceDeleteExecution("operational_confirm_dialog", "delete_confirm_accepted", {

      testId,

      variant,

    });

    traceDeleteExecution("operational_confirm_dialog", "mutation_start", { testId });

    await onConfirm();

  }, [confirmDisabled, onConfirm, testId, variant]);



  const resolvedConfirmLabel =

    confirmLabel ?? operationalConfirmLabelForVariant(variant);



  return (

    <DestructiveConfirmShell

      open={open}

      onClose={handleClose}

      presentation={presentation}

      data-testid={testId}

    >

      <div

        ref={panelRef}

        className={OP_CONFIRM_PANEL}

        role="alertdialog"

        aria-modal="true"

        aria-labelledby={titleId}

        data-testid="destructive-confirm-panel"

      >

        <header className={OP_CONFIRM_HEADER}>

          <div className="flex items-start gap-3">

            <span

              className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-dlc-md bg-destructive/8 text-destructive/75"

              aria-hidden

            >

              <AlertTriangle className="h-4 w-4" strokeWidth={2} />

            </span>

            <div className="min-w-0 flex-1 space-y-1">

              <h2 id={titleId} className={OP_CONFIRM_TITLE}>

                {title}

              </h2>

              <p className={OP_CONFIRM_ENTITY}>{entityName}</p>

            </div>

          </div>

        </header>



        <div className={OP_CONFIRM_BODY}>

          {impact ? <p className={OP_CONFIRM_IMPACT}>{impact}</p> : null}

          {preview ? <EntityPreviewBlock preview={preview} /> : null}

          {cascade?.length ? (

            <div>

              <div className="flex items-center gap-2">

                <OperationalDisclosureToggle

                  expanded={cascadeOpen}

                  onToggle={() => setCascadeOpen((v) => !v)}

                  labelCollapsed="What will happen?"

                  labelExpanded="Hide impact details"

                  testId="confirm-cascade-disclosure"

                />

                <span className="text-sm font-medium text-foreground">

                  What will happen?

                </span>

              </div>

              <OperationalDisclosurePanel open={cascadeOpen}>

                <ul className={cn(OP_CONFIRM_CASCADE_SURFACE, "mt-2 space-y-2")}>

                  {cascade.map((item) => (

                    <li

                      key={item.text}

                      className={cn(

                        "text-sm leading-relaxed",

                        item.tone === "attention"

                          ? "text-foreground/90"

                          : "text-muted-foreground",

                      )}

                    >

                      {item.text}

                    </li>

                  ))}

                </ul>

              </OperationalDisclosurePanel>

            </div>

          ) : null}

          {tertiary ? (

            <div className={OP_CONFIRM_TERTIARY} data-testid="confirm-tertiary">

              {tertiary}

            </div>

          ) : null}

        </div>



        <footer className={OP_CONFIRM_FOOTER} data-testid="confirm-footer">

          <div className={cn(OP_CONFIRM_ERROR_SLOT, "mb-3 flex items-center")}>

            {error ? (

              <p className={OP_CONFIRM_ERROR} role="alert">

                {error}

              </p>

            ) : null}

          </div>

          <div className={OP_CONFIRM_ACTIONS}>

            <div className={OP_CONFIRM_CANCEL_ZONE}>

              <Button

                type="button"

                variant="outline"

                size="lg"

                className="min-h-[var(--dlc-touch-target-min)] w-full min-w-[9.5rem] shrink-0 md:w-auto"

                onClick={handleClose}

                data-testid="confirm-cancel"

              >

                {cancelLabel}

              </Button>

            </div>

            <div className={OP_CONFIRM_DANGER_ZONE} data-testid="confirm-danger-zone">

              {requireTypedConfirm ? (

                <label className="block w-full shrink-0 text-left text-xs text-muted-foreground md:max-w-[14rem]">

                  Type{" "}

                  <span className="font-mono font-semibold text-foreground">

                    {requireTypedConfirm}

                  </span>{" "}

                  to confirm

                  <Input

                    className={OP_CONFIRM_TYPED_INPUT}

                    value={typed}

                    onChange={(e) => setTyped(e.target.value)}

                    placeholder={requireTypedConfirm}

                    autoComplete="off"

                    spellCheck={false}

                    disabled={pending}

                    aria-label={`Type ${requireTypedConfirm} to confirm`}

                    data-testid="confirm-type-input"

                  />

                </label>

              ) : null}

              <Button

                type="button"

                variant="danger"

                size="lg"

                className="min-h-[var(--dlc-touch-target-min)] w-full min-w-[10rem] shrink-0 md:w-auto"

                disabled={confirmDisabled}

                onClick={() => void handleConfirm()}

                data-testid="confirm-destructive"

              >

                {pending ? (

                  <span className="inline-flex items-center justify-center gap-2">

                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />

                    Working…

                  </span>

                ) : (

                  resolvedConfirmLabel

                )}

              </Button>

            </div>

          </div>

        </footer>

      </div>

    </DestructiveConfirmShell>

  );

}



/** Imperative confirm request (returns true when user confirms). */

export type OperationalConfirmRequest = Omit<

  OperationalConfirmDialogProps,

  "open" | "onOpenChange" | "onConfirm"

> & {

  onConfirm?: () => void | Promise<void>;

};



type PendingConfirm = OperationalConfirmRequest & {

  resolve: (confirmed: boolean) => void;

};



type OperationalConfirmContextValue = {

  confirm: (request: OperationalConfirmRequest) => Promise<boolean>;

};



const OperationalConfirmContext =

  createContext<OperationalConfirmContextValue | null>(null);



export function OperationalConfirmProvider({ children }: { children: ReactNode }) {

  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const exec = useOperationalMutationState();



  const confirm = useCallback((request: OperationalConfirmRequest) => {

    return new Promise<boolean>((resolve) => {

      exec.reset();

      traceDeleteExecution("operational_confirm_provider", "modal_open", {

        testId: request.testId,

      });

      setPending({ ...request, resolve });

    });

  }, [exec]);



  const close = useCallback(

    (confirmed: boolean) => {

      traceDeleteExecution("operational_confirm_provider", "overlay_close", {

        confirmed,

        busy: exec.busy,

      });

      traceDeleteExecution("operational_confirm_provider", "overlay_dismissed", {

        confirmed,

      });

      if (!confirmed) {

        traceDeleteExecution("operational_confirm_provider", "cancel_pressed");

        exec.cancel();

      }

      pending?.resolve(confirmed);

      setPending(null);

      exec.reset();

    },

    [exec, pending],

  );



  const ctx = useMemo(() => ({ confirm }), [confirm]);



  return (

    <OperationalConfirmContext.Provider value={ctx}>

      {children}

      {pending ? (

        <OperationalConfirmOverlayHost>

        <OperationalConfirmDialog

          open

          onOpenChange={(open) => {

            if (!open) close(false);

          }}

          variant={pending.variant}

          title={pending.title}

          entityName={pending.entityName}

          impact={pending.impact}

          preview={pending.preview}

          cascade={pending.cascade}

          tertiary={pending.tertiary}

          confirmLabel={pending.confirmLabel}

          cancelLabel={pending.cancelLabel}

          requireTypedConfirm={pending.requireTypedConfirm}

          pending={exec.busy}

          error={exec.error?.message ?? null}

          testId={pending.testId}

          onCancel={() => close(false)}

          onConfirm={async () => {

            traceDeleteExecution(

              "operational_confirm_provider",

              "delete_confirm_accepted",

            );

            traceDeleteExecution(

              "operational_confirm_provider",

              "mutation_start",

            );

            traceDeleteExecution(

              "operational_confirm_provider",

              "mutation_dispatched",

            );

            const res = await exec.execute(() => pending.onConfirm?.());

            if (res.ok) {

              traceDeleteExecution(

                "operational_confirm_provider",

                "mutation_resolved",

              );

              traceDeleteExecution(

                "operational_confirm_provider",

                "mutation_success",

              );

              close(true);

            } else if (exec.error?.kind === "timeout") {

              traceDeleteExecution(

                "operational_confirm_provider",

                "timeout_triggered",

                { message: exec.error.message },

              );

            } else if (exec.error) {

              traceDeleteExecution(

                "operational_confirm_provider",

                "mutation_rejected",

                { message: exec.error.message },

              );

              traceDeleteExecution(

                "operational_confirm_provider",

                "mutation_failure",

                { message: exec.error.message },

              );

            }

          }}

        />

        </OperationalConfirmOverlayHost>

      ) : null}

    </OperationalConfirmContext.Provider>

  );

}



export function useOperationalConfirm(): OperationalConfirmContextValue {

  const ctx = useContext(OperationalConfirmContext);

  if (!ctx) {

    throw new Error(

      "useOperationalConfirm must be used within OperationalConfirmProvider",

    );

  }

  return ctx;

}



/** Safe hook — returns null confirm when provider absent (e.g. tests). */

export function useOperationalConfirmOptional():

  | OperationalConfirmContextValue

  | null {

  return useContext(OperationalConfirmContext);

}


