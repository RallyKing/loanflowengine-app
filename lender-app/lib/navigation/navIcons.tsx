"use client";

import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart3,
  Building2,
  FileText,
  Home,
  LayoutGrid,
  LayoutPanelTop,
  Settings,
  Share2,
  Users,
  Wallet,
} from "lucide-react";
import type { NavIconKey } from "./navigationCatalog";

const ICONS: Record<NavIconKey, LucideIcon> = {
  layoutGrid: LayoutGrid,
  home: Home,
  activity: Activity,
  settings: Settings,
  users: Users,
  wallet: Wallet,
  barChart: BarChart3,
  fileText: FileText,
  panelTop: LayoutPanelTop,
  building: Building2,
  share: Share2,
};

export function navIconForKey(key: NavIconKey): LucideIcon {
  return ICONS[key];
}
