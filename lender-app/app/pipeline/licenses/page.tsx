import { StateLendingLicensesReference } from "@/components/pipeline/StateLendingLicensesReference";
import { PIPELINE_DEALS_PATH } from "@/lib/intake/routes";

export default function PipelineLicensesPage() {
  return (
    <StateLendingLicensesReference
      backHref={PIPELINE_DEALS_PATH}
      backLabel="Pipeline"
    />
  );
}
