"use client";

import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import type {
  VaultHighlightAnnotation,
  VaultNoteAnnotation,
  VaultVersionAnnotations,
} from "@/lib/library/documentVaultAnnotations";

export type AnnotationToolMode = "view" | "highlight" | "note";

export type DocumentAnnotationLayerProps = {
  annotations: VaultVersionAnnotations;
  pageIndex: number;
  /** Rendered page width/height in px (matches PDF canvas). */
  pageWidth: number;
  pageHeight: number;
  mode: AnnotationToolMode;
  readOnly?: boolean;
  onChange: (next: VaultVersionAnnotations) => void;
  className?: string;
};

function newId() {
  return `ann_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function DocumentAnnotationLayer({
  annotations,
  pageIndex,
  pageWidth,
  pageHeight,
  mode,
  readOnly = false,
  onChange,
  className,
}: DocumentAnnotationLayerProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  const pageHighlights = annotations.highlights.filter(
    (h) => h.pageIndex === pageIndex,
  );
  const pageNotes = annotations.notes.filter((n) => n.pageIndex === pageIndex);

  const toNormalized = useCallback(
    (clientX: number, clientY: number) => {
      const el = layerRef.current;
      if (!el) return { x: 0, y: 0 };
      const rect = el.getBoundingClientRect();
      return {
        x: Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)),
        y: Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)),
      };
    },
    [],
  );

  const finishHighlight = useCallback(
    (x: number, y: number, width: number, height: number) => {
      if (width < 0.01 || height < 0.01) return;
      const highlight: VaultHighlightAnnotation = {
        id: newId(),
        type: "highlight",
        pageIndex,
        x,
        y,
        width,
        height,
        color: "rgba(250, 204, 21, 0.45)",
      };
      onChange({
        ...annotations,
        highlights: [...annotations.highlights, highlight],
      });
    },
    [annotations, onChange, pageIndex],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    if (readOnly || mode === "view") return;
    if (mode === "note") {
      const { x, y } = toNormalized(e.clientX, e.clientY);
      const text = window.prompt("Sticky note text");
      if (!text?.trim()) return;
      const note: VaultNoteAnnotation = {
        id: newId(),
        type: "note",
        pageIndex,
        x,
        y,
        text: text.trim(),
      };
      onChange({
        ...annotations,
        notes: [...annotations.notes, note],
      });
      return;
    }
    if (mode === "highlight") {
      e.currentTarget.setPointerCapture(e.pointerId);
      const pt = toNormalized(e.clientX, e.clientY);
      dragStart.current = pt;
      setDraft({ x: pt.x, y: pt.y, width: 0, height: 0 });
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragStart.current || mode !== "highlight") return;
    const pt = toNormalized(e.clientX, e.clientY);
    const x = Math.min(dragStart.current.x, pt.x);
    const y = Math.min(dragStart.current.y, pt.y);
    const width = Math.abs(pt.x - dragStart.current.x);
    const height = Math.abs(pt.y - dragStart.current.y);
    setDraft({ x, y, width, height });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragStart.current || mode !== "highlight") return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const pt = toNormalized(e.clientX, e.clientY);
    const x = Math.min(dragStart.current.x, pt.x);
    const y = Math.min(dragStart.current.y, pt.y);
    const width = Math.abs(pt.x - dragStart.current.x);
    const height = Math.abs(pt.y - dragStart.current.y);
    finishHighlight(x, y, width, height);
    dragStart.current = null;
    setDraft(null);
  };

  if (pageWidth <= 0 || pageHeight <= 0) return null;

  return (
    <div
      ref={layerRef}
      className={cn(
        "absolute left-1/2 top-0 -translate-x-1/2",
        mode !== "view" && !readOnly && "cursor-crosshair",
        className,
      )}
      style={{ width: pageWidth, height: pageHeight }}
      data-testid="document-annotation-layer"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {pageHighlights.map((h) => (
        <div
          key={h.id}
          className="pointer-events-none absolute rounded-sm"
          style={{
            left: `${h.x * 100}%`,
            top: `${h.y * 100}%`,
            width: `${h.width * 100}%`,
            height: `${h.height * 100}%`,
            backgroundColor: h.color ?? "rgba(250, 204, 21, 0.45)",
            mixBlendMode: "multiply",
          }}
        />
      ))}
      {draft ? (
        <div
          className="pointer-events-none absolute rounded-sm bg-amber-300/50"
          style={{
            left: `${draft.x * 100}%`,
            top: `${draft.y * 100}%`,
            width: `${draft.width * 100}%`,
            height: `${draft.height * 100}%`,
            mixBlendMode: "multiply",
          }}
        />
      ) : null}
      {pageNotes.map((n) => (
        <div
          key={n.id}
          className="absolute max-w-[10rem] rounded-dlc-sm border border-amber-400/60 bg-amber-50 px-2 py-1 text-[10px] leading-snug text-amber-950 shadow-dlc-1 dark:bg-amber-950 dark:text-amber-50"
          style={{
            left: `${n.x * 100}%`,
            top: `${n.y * 100}%`,
            transform: "translate(-4px, -4px)",
          }}
          title={n.text}
        >
          {n.text}
        </div>
      ))}
    </div>
  );
}
