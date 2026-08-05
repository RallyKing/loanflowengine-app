"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {

  OP_INLINE_DISPLAY_CLASS,

  OP_INLINE_DISPLAY_EMPTY_CLASS,

  OP_INLINE_EDIT_CLASS,

  OP_INLINE_ERROR_RING_CLASS,

  OP_INLINE_ERROR_TEXT_CLASS,

  OP_INLINE_SAVED_CLASS,

  OP_INLINE_TEXTAREA_CLASS,

  OP_INLINE_TEXTAREA_DISPLAY_CLASS,

} from "@/lib/ui/operationalInputs";
import { convexClientErrorMessage } from "@/lib/ui/convexErrorMessage";



/**

 * Shared commit / loading / error state for inline editors.

 */

export type InlineCommitState = {

  loading: boolean;

  error: string | null;

  justSaved: boolean;

  commit: <T>(

    next: T,

    fn: (next: T) => Promise<unknown> | unknown

  ) => Promise<boolean>;

  clearError: () => void;

};



export function useInlineCommit(): InlineCommitState {

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [justSaved, setJustSaved] = useState(false);

  const pulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);



  useEffect(

    () => () => {

      if (pulseTimer.current) clearTimeout(pulseTimer.current);

    },

    []

  );



  const commit = useCallback(

    async <T,>(

      next: T,

      fn: (next: T) => Promise<unknown> | unknown

    ): Promise<boolean> => {

      setLoading(true);

      setError(null);

      try {

        await Promise.resolve(fn(next));

        setJustSaved(true);

        if (pulseTimer.current) clearTimeout(pulseTimer.current);

        pulseTimer.current = setTimeout(() => setJustSaved(false), 600);

        return true;

      } catch (e) {

        setError(convexClientErrorMessage(e) || "Couldn't save");

        return false;

      } finally {

        setLoading(false);

      }

    },

    []

  );



  return {

    loading,

    error,

    justSaved,

    commit,

    clearError: () => setError(null),

  };

}



/** Phase 18.5 — locked-height inline display/edit classes. */

export const inlineClasses = {

  display: OP_INLINE_DISPLAY_CLASS,

  displayEmpty: OP_INLINE_DISPLAY_EMPTY_CLASS,

  edit: OP_INLINE_EDIT_CLASS,

  editTextarea: OP_INLINE_TEXTAREA_CLASS,

  displayTextarea: OP_INLINE_TEXTAREA_DISPLAY_CLASS,

  saved: OP_INLINE_SAVED_CLASS,

  errored: OP_INLINE_ERROR_RING_CLASS,

  errorText: OP_INLINE_ERROR_TEXT_CLASS,

};


