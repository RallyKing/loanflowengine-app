import { Metadata } from "next";
import AnalyticsPageClient from "./AnalyticsPageClient";

export const metadata: Metadata = {
  title: "Analytics",
  description: "Pipeline value, conversion, revenue trends, and referral sources.",
};

export default function AnalyticsPage() {
  return <AnalyticsPageClient />;
}
