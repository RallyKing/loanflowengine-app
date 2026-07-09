import type { DlcBuildInfo } from "@/lib/buildInfo";

declare global {
  interface Window {
    __DLC_BUILD_INFO__?: DlcBuildInfo;
  }
}

export {};
