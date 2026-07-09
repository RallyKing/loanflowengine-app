/** Mask SSN for display — shows last 4 digits only. */
export function maskSsn(ssn: string | undefined | null): string {
  const digits = (ssn ?? "").replace(/\D/g, "");
  if (digits.length < 4) return "•••-••-••••";
  const last4 = digits.slice(-4);
  return `•••-••-${last4}`;
}

export function formatSsnDisplay(ssn: string | undefined | null): string {
  const digits = (ssn ?? "").replace(/\D/g, "");
  if (digits.length === 9) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
  }
  return (ssn ?? "").trim();
}
