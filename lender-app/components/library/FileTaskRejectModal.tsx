"use client";



import { useState } from "react";

import { Button } from "@/components/ui/Button";

import { OverlayShell } from "@/components/ui/OverlayShell";



export type FileTaskRejectModalProps = {

  open: boolean;

  taskTitle: string;

  onClose: () => void;

  onConfirm: (note: string) => Promise<void>;

};



export function FileTaskRejectModal({

  open,

  taskTitle,

  onClose,

  onConfirm,

}: FileTaskRejectModalProps) {

  const [note, setNote] = useState("");

  const [busy, setBusy] = useState(false);



  if (!open) return null;



  return (

    <OverlayShell

      open

      onClose={onClose}

      aria-label="Request revision"

      panelClassName="w-full max-w-md p-5"

    >

      <h3 className="text-sm font-semibold">Request revision</h3>

      <p className="mt-1 text-xs text-muted-foreground">

        &ldquo;{taskTitle}&rdquo; will return to the client for another

        submission. Explain what needs to change — this note is shown directly

        in the client portal.

      </p>

      <textarea

        className="mt-3 min-h-[6rem] w-full rounded-dlc-md border border-border bg-background px-3 py-2 text-sm"

        placeholder="e.g. Please sign page 2, or income numbers don't match the pay stubs."

        value={note}

        onChange={(e) => setNote(e.target.value)}

        data-testid="file-task-revision-note"

      />

      <div className="mt-5 flex justify-end gap-2">

        <Button type="button" variant="ghost" size="sm" onClick={onClose}>

          Cancel

        </Button>

        <Button

          type="button"

          variant="primary"

          size="sm"

          disabled={busy || !note.trim()}

          data-testid="file-task-revision-confirm"

          onClick={() => {

            void (async () => {

              setBusy(true);

              try {

                await onConfirm(note.trim());

                setNote("");

                onClose();

              } finally {

                setBusy(false);

              }

            })();

          }}

        >

          Request revision

        </Button>

      </div>

    </OverlayShell>

  );

}

