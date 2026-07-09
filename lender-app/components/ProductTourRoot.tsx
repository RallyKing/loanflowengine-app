"use client";

import { ReactNode } from "react";
import { ProductTourProvider } from "@/lib/productTourContext";
import { ProductTourOverlay } from "@/components/ProductTourOverlay";

export function ProductTourRoot({ children }: { children: ReactNode }) {
  return (
    <ProductTourProvider>
      {children}
      <ProductTourOverlay />
    </ProductTourProvider>
  );
}
