export type EventListSort = "upcoming" | "recent" | "alphabetical" | "custom";

export type EventListRow = {
  _id: string;
  title: string;
  status: string;
  startsAt?: number;
  pinnedAt?: number;
  listSortKey: number;
  calendarSortAt: number;
  updatedAt: number;
  location?: string;
  ownerDisplayUsername: string;
  viewer: {
    isOwner: boolean;
    access: { collaboratorRole: string | null };
  };
};

export function sortEventRows(rows: EventListRow[], sort: EventListSort): EventListRow[] {
  const copy = [...rows];
  const pinned = copy.filter((r) => r.pinnedAt != null);
  const rest = copy.filter((r) => r.pinnedAt == null);
  const sortPinned = [...pinned].sort((a, b) => (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0));

  const sortRest = (list: EventListRow[]) => {
    switch (sort) {
      case "upcoming":
        return [...list].sort((a, b) => {
          const aKey = a.startsAt ?? a.calendarSortAt;
          const bKey = b.startsAt ?? b.calendarSortAt;
          return aKey - bKey;
        });
      case "recent":
        return [...list].sort((a, b) => b.updatedAt - a.updatedAt);
      case "alphabetical":
        return [...list].sort((a, b) =>
          a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
        );
      case "custom":
      default:
        return [...list].sort((a, b) => a.listSortKey - b.listSortKey);
    }
  };

  return [...sortPinned, ...sortRest(rest)];
}
