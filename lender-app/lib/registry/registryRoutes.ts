import type { RegistryItem } from "@/lib/registry/registryItem";

/** Command center (detail hub) href for a federated registry row. */
export function registryCommandCenterHref(item: RegistryItem): string {
  switch (item.registryType) {
    case "contact":
      return `/contacts/${item._id}`;
    case "entity":
      return `/contacts/entity/${item._id}`;
    case "lender":
      return `/lenders?lender=${encodeURIComponent(item._id)}`;
  }
}
