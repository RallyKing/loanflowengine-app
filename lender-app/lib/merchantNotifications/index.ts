import type {
  BuildMerchantNotificationArgs,
  DeliveryMethod,
  MerchantChannelResult,
  MerchantNotificationOrg,
  MerchantNotificationPerson,
  NotificationCompanionPayload,
} from "./types";
import { buildMerchantNotificationPayload, splitName } from "./buildPayload";

export type {
  BuildMerchantNotificationArgs,
  DeliveryMethod,
  MerchantChannelResult,
  MerchantNotificationOrg,
  MerchantNotificationPerson,
  NotificationCompanionPayload,
};

export { buildMerchantNotificationPayload, splitName };
