"use client";



import {

  createContext,

  useCallback,

  useContext,

  useEffect,

  useId,

  useLayoutEffect,

  useRef,

  useState,

  type ReactNode,

  type RefObject,

} from "react";

import { createPortal } from "react-dom";

import { cn } from "@/lib/cn";

import { layerZIndexStyle } from "@/lib/ui/layering";

import { OP_MENU_PANEL } from "@/lib/ui/operationalElegance";



const DropdownCloseContext = createContext<() => void>(() => {});



/** Matches `min-w-[11rem]` on the menu panel. */

const MENU_MIN_WIDTH_PX = 11 * 16;



type DropdownMenuProps = {

  trigger: ReactNode;

  children: ReactNode;

  align?: "start" | "end";

  className?: string;

  "aria-label"?: string;

};



function useDropdownMenuPosition(

  open: boolean,

  anchorRef: RefObject<HTMLDivElement | null>,

  align: "start" | "end",

): { top: number; left: number } {

  const [pos, setPos] = useState({ top: 0, left: 0 });



  const update = useCallback(() => {

    const el = anchorRef.current;

    if (!el) return;

    const r = el.getBoundingClientRect();

    if (align === "end") {

      setPos({

        top: r.bottom + 4,

        left: Math.max(8, r.right - MENU_MIN_WIDTH_PX),

      });

    } else {

      setPos({ top: r.bottom + 4, left: Math.max(8, r.left) });

    }

  }, [align, anchorRef]);



  useLayoutEffect(() => {

    if (!open) return;

    update();

  }, [open, update]);



  useEffect(() => {

    if (!open) return;

    window.addEventListener("scroll", update, true);

    window.addEventListener("resize", update);

    return () => {

      window.removeEventListener("scroll", update, true);

      window.removeEventListener("resize", update);

    };

  }, [open, update]);



  return pos;

}



export function DropdownMenu({

  trigger,

  children,

  align = "end",

  className,

  "aria-label": ariaLabel = "More actions",

}: DropdownMenuProps) {

  const [open, setOpen] = useState(false);

  const [mounted, setMounted] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);

  const menuId = useId();

  const menuPos = useDropdownMenuPosition(open, rootRef, align);



  const close = useCallback(() => setOpen(false), []);



  useEffect(() => {

    setMounted(true);

  }, []);



  useEffect(() => {

    if (!open) return;

    const onPointer = (e: MouseEvent) => {

      const target = e.target as Node;

      if (rootRef.current?.contains(target)) return;

      if (

        (e.target as HTMLElement | null)?.closest?.("[data-dropdown-menu-panel]")

      ) {

        return;

      }

      close();

    };

    const onKey = (e: KeyboardEvent) => {

      if (e.key === "Escape") close();

    };

    document.addEventListener("mousedown", onPointer);

    document.addEventListener("keydown", onKey);

    return () => {

      document.removeEventListener("mousedown", onPointer);

      document.removeEventListener("keydown", onKey);

    };

  }, [open, close]);



  const menuPanel =

    open && mounted ? (

      <DropdownCloseContext.Provider value={close}>

        <div

          id={menuId}

          role="menu"

          data-dropdown-menu-panel

          className={cn(

            "fixed min-w-[11rem]",

            OP_MENU_PANEL,

          )}

          style={{

            top: menuPos.top,

            left: menuPos.left,

            ...layerZIndexStyle("DROPDOWN"),

          }}

          onClick={(e) => e.stopPropagation()}

        >

          {children}

        </div>

      </DropdownCloseContext.Provider>

    ) : null;



  return (

    <div ref={rootRef} className={cn("relative shrink-0", className)}>

      <div

        role="button"

        tabIndex={0}

        aria-haspopup="menu"

        aria-expanded={open}

        aria-controls={open ? menuId : undefined}

        aria-label={ariaLabel}

        onClick={() => setOpen((v) => !v)}

        onKeyDown={(e) => {

          if (e.key === "Enter" || e.key === " ") {

            e.preventDefault();

            setOpen((v) => !v);

          }

        }}

      >

        {trigger}

      </div>

      {menuPanel && mounted ? createPortal(menuPanel, document.body) : null}

    </div>

  );

}



export function DropdownMenuItem({

  children,

  onClick,

  disabled,

  destructive,

  className,

}: {

  children: ReactNode;

  onClick?: () => void;

  disabled?: boolean;

  destructive?: boolean;

  className?: string;

}) {

  const closeMenu = useContext(DropdownCloseContext);

  return (

    <button

      type="button"

      role="menuitem"

      disabled={disabled}

      className={cn(

        "flex w-full min-h-10 items-center gap-2 px-3 py-2 text-left text-sm text-foreground",

        "transition-colors duration-[140ms] ease-out hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none",

        disabled && "pointer-events-none opacity-40",

        destructive && "text-destructive/90 hover:bg-destructive/10",

        className,

      )}

      onClick={() => {

        onClick?.();

        closeMenu();

      }}

    >

      {children}

    </button>

  );

}



export function DropdownMenuSeparator() {

  return <div className="my-1 border-t border-border/35" role="separator" />;

}


