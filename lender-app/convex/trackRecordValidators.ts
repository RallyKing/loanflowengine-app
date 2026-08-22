import { v } from "convex/values";

export const trackRecordGuarantorSlotV = v.object({
  name: v.optional(v.string()),
  contactId: v.optional(v.string()),
});

export const trackRecordRowV = v.object({
  rowId: v.optional(v.string()),
  address: v.optional(v.string()),
  city: v.optional(v.string()),
  state: v.optional(v.string()),
  zip: v.optional(v.string()),
  propertyType: v.optional(v.string()),
  ownedByGuarantor1: v.optional(v.string()),
  ownedByGuarantor2: v.optional(v.string()),
  ownedByGuarantor3: v.optional(v.string()),
  ownedByGuarantor4: v.optional(v.string()),
  titleHeldInName: v.optional(v.string()),
  acquisitionDate: v.optional(v.string()),
  acquisitionPrice: v.optional(v.string()),
  projectType: v.optional(v.string()),
  rehabOrConstructionAmount: v.optional(v.string()),
  exitType: v.optional(v.string()),
  dateSoldOrLeased: v.optional(v.string()),
  salePriceOrRentAmount: v.optional(v.string()),
  assignedContactIds: v.optional(v.array(v.string())),
});

export const trackRecordBlockMetaV = v.object({
  assignedContactIds: v.optional(v.array(v.string())),
  guarantors: v.optional(v.array(trackRecordGuarantorSlotV)),
});

export const contactTrackRecordPropertyFieldsV = {
  propertyAddress: v.optional(v.string()),
  city: v.optional(v.string()),
  state: v.optional(v.string()),
  zip: v.optional(v.string()),
  propertyType: v.optional(v.string()),
  titleHeldInName: v.optional(v.string()),
  acquisitionDate: v.optional(v.string()),
  acquisitionPrice: v.optional(v.string()),
  projectType: v.optional(v.string()),
  rehabOrConstructionAmount: v.optional(v.string()),
  exitType: v.optional(v.string()),
  dateSoldOrLeased: v.optional(v.string()),
  salePriceOrRentAmount: v.optional(v.string()),
};
