/**
 * Email-ready paste block after Generate Client Link.
 * Bullets match tasks included in the issued portal bundle.
 */
export function buildClientLinkEmailCopy(
  taskTitles: readonly string[],
  portalUrl: string,
): string {
  const titles = taskTitles
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  const bullets =
    titles.length > 0
      ? titles.map((t) => `• ${t}`).join("\n")
      : "• (document requests)";
  const url = portalUrl.trim();
  return `${bullets}\n\nPlease upload the documents securely using the link below:\n\n${url}`;
}
