export function pathOnly(href: string): string {
  const i = href.indexOf("#");
  return i === -1 ? href : href.slice(0, i);
}

export function isActivePath(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  const base = pathOnly(href);
  if (base === "/") return pathname === "/";
  return pathname === base || pathname.startsWith(`${base}/`);
}

export { isPipelineZonePath } from "./navigationCatalog";
