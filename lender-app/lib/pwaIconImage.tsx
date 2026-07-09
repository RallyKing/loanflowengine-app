import type { CSSProperties } from "react";

type PwaIconProps = {
  size: number;
  monogram?: string;
};

/** Shared mark for favicon, apple-touch, and manifest icon routes. */
export function PwaIconMark({
  size,
  monogram = "LFE",
}: PwaIconProps) {
  const fontSize = Math.round(size * 0.28);
  const style: CSSProperties = {
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#034f35",
    color: "#ffffff",
    fontSize,
    fontWeight: 700,
    letterSpacing: "-0.04em",
    fontFamily: "system-ui, sans-serif",
  };
  return <div style={style}>{monogram}</div>;
}
