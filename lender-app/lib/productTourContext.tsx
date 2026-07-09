"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  PRODUCT_TOUR_STEP_COUNT,
  PRODUCT_TOUR_STEPS,
  type ProductTourStepId,
} from "./productTour";

export type ProductTourContextValue = {
  isActive: boolean;
  stepIndex: number;
  currentStepId: ProductTourStepId | null;
  startTour: () => void;
  stopTour: () => void;
  nextStep: () => void;
  prevStep: () => void;
};

const ProductTourContext = createContext<ProductTourContextValue | null>(null);

export function ProductTourProvider({ children }: { children: ReactNode }) {
  const [isActive, setIsActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  const startTour = useCallback(() => {
    setStepIndex(0);
    setIsActive(true);
  }, []);

  const stopTour = useCallback(() => {
    setIsActive(false);
    setStepIndex(0);
  }, []);

  const nextStep = useCallback(() => {
    setStepIndex((i) => Math.min(i + 1, PRODUCT_TOUR_STEP_COUNT - 1));
  }, []);

  const prevStep = useCallback(() => {
    setStepIndex((i) => Math.max(0, i - 1));
  }, []);

  const currentStepId = useMemo(() => {
    if (!isActive) return null;
    return PRODUCT_TOUR_STEPS[stepIndex]?.id ?? null;
  }, [isActive, stepIndex]);

  const value = useMemo(
    (): ProductTourContextValue => ({
      isActive,
      stepIndex,
      currentStepId,
      startTour,
      stopTour,
      nextStep,
      prevStep,
    }),
    [
      isActive,
      stepIndex,
      currentStepId,
      startTour,
      stopTour,
      nextStep,
      prevStep,
    ],
  );

  return (
    <ProductTourContext.Provider value={value}>
      {children}
    </ProductTourContext.Provider>
  );
}

export function useProductTour(): ProductTourContextValue {
  const ctx = useContext(ProductTourContext);
  if (!ctx) {
    throw new Error("useProductTour must be used within ProductTourProvider");
  }
  return ctx;
}
