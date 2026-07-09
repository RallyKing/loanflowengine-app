import {
  Building2,
  CheckSquare,
  FolderKanban,
  Handshake,
  Landmark,
  ListTree,
  User,
  Users,
  CalendarDays,
} from "lucide-react";
import type { ProjectionModeOption } from "@/components/ui/ProjectionModeSwitcher";
import {
  HUB_PROJECTION_MODE_LABELS,
  type HubProjectionMode,
} from "@/lib/pipeline/graphProjection";

const MODE_DESCRIPTIONS: Record<HubProjectionMode, string> = {
  client: "Browse the graph grouped by client — same loans, client-first nesting.",
  project: "See capital stacks and loans organized under each project.",
  file: "Flat loan list — fastest path to open a deal file.",
  lender: "Files indexed by lender relationships on the graph.",
  referral: "Referral partner connections across your pipeline.",
  team: "Team member involvement across files and tasks.",
  task: "Open tasks linked to pipeline files — jump into work quickly.",
};

const MODE_ICONS = {
  client: User,
  project: FolderKanban,
  file: ListTree,
  lender: Landmark,
  referral: Handshake,
  team: Users,
  task: CheckSquare,
  building: Building2,
} as const;

const MODE_SHORT: Record<HubProjectionMode, string> = {
  client: "Clients",
  project: "Projects",
  file: "Loans",
  lender: "Lenders",
  referral: "Referrals",
  team: "Team",
  task: "Tasks",
};

export function buildHubProjectionOptions(input: {
  counts: Record<HubProjectionMode, number>;
  includeEventsLink?: boolean;
}): ProjectionModeOption[] {
  const modes: HubProjectionMode[] = [
    "client",
    "project",
    "file",
    "lender",
    "referral",
    "team",
    "task",
  ];
  const options: ProjectionModeOption[] = modes.map((mode) => ({
    id: mode,
    label: HUB_PROJECTION_MODE_LABELS[mode].replace(" Focus", ""),
    shortLabel: MODE_SHORT[mode],
    description: MODE_DESCRIPTIONS[mode],
    icon: MODE_ICONS[mode],
    count: input.counts[mode],
  }));
  if (input.includeEventsLink) {
    options.push({
      id: "events",
      label: "Events",
      shortLabel: "Events",
      description: "Private events and inbox — separate route, same org context.",
      icon: CalendarDays,
      href: "/events",
    });
  }
  return options;
}
