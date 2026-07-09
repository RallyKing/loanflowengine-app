"use client";

import nextDynamic from "next/dynamic";

const Dashboard = nextDynamic(
  () => import("@/components/intake/Dashboard").then((m) => m.Dashboard),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[30dvh] items-center justify-center py-12 text-sm text-muted-foreground">
        Loading deal library…
      </div>
    ),
  }
);

export function LibraryDashboardClient() {
  return <Dashboard />;
}
