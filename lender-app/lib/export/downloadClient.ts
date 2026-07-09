/**
 * Reliable client-side file download (blob trigger + URL revoke).
 */

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 500);
}

export function downloadTextFile(
  filename: string,
  body: string,
  mime = "text/plain;charset=utf-8",
  options?: { utf8Bom?: boolean }
): void {
  const payload = options?.utf8Bom ? `\uFEFF${body}` : body;
  const blob = new Blob([payload], { type: mime });
  downloadBlob(blob, filename);
}
