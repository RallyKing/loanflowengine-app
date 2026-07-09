/** Build fingerprint exposed to the browser as `window.__DLC_BUILD_INFO__`. */

export type DlcBuildInfo = {
  gitSha: string;
  buildTime: string;
  vercelDeploymentId: string;
  vercelEnv: string;
  vercelUrl: string;
};

export function readDlcBuildInfo(): DlcBuildInfo {
  return {
    gitSha: process.env.NEXT_PUBLIC_DLC_GIT_SHA ?? "unknown",
    buildTime: process.env.NEXT_PUBLIC_DLC_BUILD_TIME ?? "unknown",
    vercelDeploymentId:
      process.env.NEXT_PUBLIC_DLC_VERCEL_DEPLOYMENT_ID ?? "unknown",
    vercelEnv: process.env.VERCEL_ENV ?? "unknown",
    vercelUrl: process.env.VERCEL_URL ?? "unknown",
  };
}

export function dlcBuildInfoInlineScript(info: DlcBuildInfo): string {
  return `window.__DLC_BUILD_INFO__=${JSON.stringify(info)};`;
}
