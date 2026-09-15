import type { Metadata } from "next";
import { DcAwardRadarClient } from "./DcAwardRadarClient";

export const metadata: Metadata = {
  title: "DC award radar · Operations",
  description:
    "Nationwide DLC public data-center award signals with Hermes/ops contact enrichment. HighLevel push is tag/create only.",
};

export default function DcAwardRadarPage() {
  return <DcAwardRadarClient />;
}
