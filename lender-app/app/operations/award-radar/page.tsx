import type { Metadata } from "next";
import { DcAwardRadarClient } from "./DcAwardRadarClient";

export const metadata: Metadata = {
  title: "Award Radar · Operations",
  description:
    "Nationwide DLC public award signals with Hermes/ops contact enrichment. HighLevel push is tag/create only.",
};

export default function DcAwardRadarPage() {
  return <DcAwardRadarClient />;
}
