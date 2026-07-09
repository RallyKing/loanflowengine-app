import { v } from "convex/values";

export const contactEmailLabelV = v.union(
  v.literal("Work"),
  v.literal("Personal"),
  v.literal("Billing"),
  v.literal("Assistant"),
  v.literal("Other"),
);

export const contactPhoneLabelV = v.union(
  v.literal("Mobile"),
  v.literal("Work"),
  v.literal("Home"),
  v.literal("Direct"),
  v.literal("Office"),
  v.literal("Fax"),
  v.literal("Assistant"),
  v.literal("Emergency"),
  v.literal("Other"),
);

export const contactEmailEntryV = v.object({
  id: v.string(),
  label: contactEmailLabelV,
  email: v.string(),
  isPrimary: v.boolean(),
});

export const contactPhoneEntryV = v.object({
  id: v.string(),
  label: contactPhoneLabelV,
  number: v.string(),
  isPrimary: v.boolean(),
});

export const contactEmailsArgV = v.optional(v.array(contactEmailEntryV));
export const contactPhonesArgV = v.optional(v.array(contactPhoneEntryV));

export const preferredContactMethodV = v.union(
  v.literal("email"),
  v.literal("phone"),
  v.literal("sms"),
);
