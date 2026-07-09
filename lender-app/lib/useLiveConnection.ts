/**
 * Re-exports so imports stay `@/lib/useLiveConnection`. Implementation:
 * `lib/liveConnection.tsx` (provider + context).
 */
export {
  formatLiveConnectionDebug,
  LiveConnectionProvider,
  useLiveConnection,
  useLiveConnectionOptional,
  liveActionTitle,
  livePhaseLabel,
  type UseLiveConnectionResult,
} from "./liveConnection";
