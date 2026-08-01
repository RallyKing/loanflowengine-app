"use client";

import { createContext, useContext, type RefObject } from "react";

export const ContactsScrollContext =
  createContext<RefObject<HTMLDivElement | null> | null>(null);

export function useContactsScrollElement(): HTMLDivElement | null {
  const ref = useContext(ContactsScrollContext);
  return ref?.current ?? null;
}
