"use client";

/**
 * Simple operator-facing editor for a selected portal page section.
 * Writes into `PortalPageSectionInstance.props` (no parallel config store).
 */

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, Textarea } from "@/components/ui/Input";
import { getPortalPageSectionDef } from "@/lib/portalPageSections";
import type { PortalPageSectionInstance } from "@/lib/portalPageSections";
import {
  newPortalStatusStepId,
  type PortalSectionProps,
  type PortalStatusStep,
} from "@/lib/portalSectionConfig";
import { useOrganizationPipelineStages } from "@/hooks/useOrganizationPipelineStages";

export function PortalSectionConfigPanel({
  instance,
  onChange,
  disabled,
  allowMessaging,
  onAllowMessagingChange,
}: {
  instance: PortalPageSectionInstance;
  onChange: (props: PortalSectionProps) => void;
  disabled?: boolean;
  allowMessaging?: boolean;
  onAllowMessagingChange?: (next: boolean) => void;
}) {
  const def = getPortalPageSectionDef(instance.sectionId);
  const props = instance.props ?? {};
  const stages = useOrganizationPipelineStages();

  const patch = (partial: PortalSectionProps) => {
    onChange({ ...props, ...partial });
  };

  return (
    <div
      className="space-y-3 rounded-dlc-md border border-border bg-dlc-surface-high p-3"
      data-testid="portal-section-config"
      data-section-id={instance.sectionId}
    >
      <div>
        <p className="text-sm font-semibold text-foreground">
          {def?.label ?? instance.sectionId}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {def?.description ?? "Configure how this section works for viewers."}
        </p>
      </div>

      <div>
        <Label htmlFor="psc-title">Section title (optional)</Label>
        <Input
          id="psc-title"
          className="mt-1.5 min-h-10"
          value={props.titleOverride ?? ""}
          disabled={disabled}
          placeholder={def?.label}
          onChange={(e) =>
            patch({ titleOverride: e.currentTarget.value || undefined })
          }
        />
      </div>

      {instance.sectionId === "welcome" ? (
        <div>
          <Label htmlFor="psc-welcome">Welcome message</Label>
          <Textarea
            id="psc-welcome"
            className="mt-1.5 min-h-[5rem]"
            value={props.welcomeBody ?? ""}
            disabled={disabled}
            placeholder="Hi — welcome to {{workspaceName}}. You’re viewing {{fileLabel}}."
            onChange={(e) =>
              patch({ welcomeBody: e.currentTarget.value || undefined })
            }
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Tokens: {"{{workspaceName}}"}, {"{{fileLabel}}"}. Falls back to the
            template welcome message when empty.
          </p>
        </div>
      ) : null}

      {instance.sectionId === "status_pipeline_stage" ? (
        <div className="space-y-3">
          <div>
            <Label htmlFor="psc-status-mode">Status source</Label>
            <Select
              id="psc-status-mode"
              className="mt-1.5 min-h-10"
              value={props.statusMode ?? "pipeline"}
              disabled={disabled}
              onChange={(e) =>
                patch({
                  statusMode: e.currentTarget.value as
                    | "pipeline"
                    | "custom_checklist",
                })
              }
            >
              <option value="pipeline">Linked pipeline stages</option>
              <option value="custom_checklist">
                Custom steps (viewer checks off)
              </option>
            </Select>
          </div>
          {(props.statusMode ?? "pipeline") === "pipeline" ? (
            <div className="rounded-dlc-md border border-border/60 bg-background px-3 py-2 text-xs text-muted-foreground">
              Shows the file’s current org pipeline stage
              {stages.activeStages.length
                ? ` (${stages.activeStages.length} stages configured in Settings → Pipeline stages)`
                : " (uses your org’s pipeline stages)"}
              . Stage changes stay on the loan file — ready for automations later.
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-[11px] text-muted-foreground">
                Each step has a stable ID for future automations. Viewers check
                steps off; progress is stored per loan file.
              </p>
              {(props.statusSteps ?? []).map((step, idx) => (
                <div
                  key={step.id}
                  className="rounded-dlc-md border border-border/60 bg-background p-2"
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <Input
                        className="min-h-10"
                        value={step.label}
                        disabled={disabled}
                        placeholder="Step label"
                        onChange={(e) => {
                          const statusSteps = [...(props.statusSteps ?? [])];
                          statusSteps[idx] = {
                            ...step,
                            label: e.currentTarget.value,
                          };
                          patch({ statusSteps });
                        }}
                      />
                      <Input
                        className="min-h-10"
                        value={step.description ?? ""}
                        disabled={disabled}
                        placeholder="Optional description"
                        onChange={(e) => {
                          const statusSteps = [...(props.statusSteps ?? [])];
                          statusSteps[idx] = {
                            ...step,
                            description: e.currentTarget.value || undefined,
                          };
                          patch({ statusSteps });
                        }}
                      />
                      <p className="truncate font-mono text-[10px] text-muted-foreground">
                        id: {step.id}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      className="min-h-10 shrink-0 text-destructive"
                      disabled={disabled}
                      aria-label="Remove step"
                      onClick={() => {
                        const statusSteps = (props.statusSteps ?? []).filter(
                          (s) => s.id !== step.id,
                        );
                        patch({ statusSteps });
                      }}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                className="min-h-10 w-full"
                disabled={disabled || (props.statusSteps?.length ?? 0) >= 24}
                onClick={() => {
                  const next: PortalStatusStep = {
                    id: newPortalStatusStepId(),
                    label: "New step",
                    order: props.statusSteps?.length ?? 0,
                  };
                  patch({
                    statusSteps: [...(props.statusSteps ?? []), next],
                  });
                }}
              >
                <Plus className="mr-1.5 h-4 w-4" aria-hidden />
                Add step
              </Button>
            </div>
          )}
        </div>
      ) : null}

      {instance.sectionId === "company_primary_contact" ? (
        <div className="space-y-3">
          <div>
            <Label htmlFor="psc-contact-source">Contact source</Label>
            <Select
              id="psc-contact-source"
              className="mt-1.5 min-h-10"
              value={props.contactSource ?? "organization"}
              disabled={disabled}
              onChange={(e) =>
                patch({
                  contactSource: e.currentTarget.value as
                    | "organization"
                    | "file_owner"
                    | "custom",
                })
              }
            >
              <option value="organization">Organization name</option>
              <option value="file_owner">File owner (broker account)</option>
              <option value="custom">Custom name / email / phone</option>
            </Select>
          </div>
          {(props.contactSource ?? "organization") === "custom" ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="psc-cname">Name</Label>
                <Input
                  id="psc-cname"
                  className="mt-1.5 min-h-10"
                  value={props.customContact?.name ?? ""}
                  disabled={disabled}
                  onChange={(e) =>
                    patch({
                      customContact: {
                        ...props.customContact,
                        name: e.currentTarget.value || undefined,
                      },
                    })
                  }
                />
              </div>
              <div>
                <Label htmlFor="psc-ctitle">Title</Label>
                <Input
                  id="psc-ctitle"
                  className="mt-1.5 min-h-10"
                  value={props.customContact?.title ?? ""}
                  disabled={disabled}
                  onChange={(e) =>
                    patch({
                      customContact: {
                        ...props.customContact,
                        title: e.currentTarget.value || undefined,
                      },
                    })
                  }
                />
              </div>
              <div>
                <Label htmlFor="psc-cphone">Phone</Label>
                <Input
                  id="psc-cphone"
                  className="mt-1.5 min-h-10"
                  value={props.customContact?.phone ?? ""}
                  disabled={disabled}
                  onChange={(e) =>
                    patch({
                      customContact: {
                        ...props.customContact,
                        phone: e.currentTarget.value || undefined,
                      },
                    })
                  }
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="psc-cemail">Email</Label>
                <Input
                  id="psc-cemail"
                  className="mt-1.5 min-h-10"
                  type="email"
                  value={props.customContact?.email ?? ""}
                  disabled={disabled}
                  onChange={(e) =>
                    patch({
                      customContact: {
                        ...props.customContact,
                        email: e.currentTarget.value || undefined,
                      },
                    })
                  }
                />
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              {(props.contactSource ?? "organization") === "file_owner"
                ? "Live portals show the loan file owner’s account name and email when available."
                : "Live portals show your organization name as the brokerage contact."}
            </p>
          )}
        </div>
      ) : null}

      {instance.sectionId === "chat" ? (
        <div className="space-y-3">
          <label className="flex min-h-10 items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={props.chatEnabled !== false && allowMessaging !== false}
              disabled={disabled}
              onChange={(e) => {
                const on = e.currentTarget.checked;
                patch({ chatEnabled: on });
                onAllowMessagingChange?.(on);
              }}
            />
            Enable messaging (uses file Messages — same as pipeline)
          </label>
          <div>
            <Label htmlFor="psc-chat-intro">Intro text</Label>
            <Textarea
              id="psc-chat-intro"
              className="mt-1.5 min-h-[4rem]"
              value={props.chatIntro ?? ""}
              disabled={disabled}
              onChange={(e) =>
                patch({ chatIntro: e.currentTarget.value || undefined })
              }
            />
          </div>
          <p className="rounded-dlc-md border border-border/60 bg-background px-3 py-2 text-[11px] text-muted-foreground">
            Portal chat writes to the loan file’s portal message threads — the
            same conversation operators see under Communications / Messages. No
            separate chat inbox.
          </p>
        </div>
      ) : null}

      {instance.sectionId === "outstanding_documents" ? (
        <div>
          <Label htmlFor="psc-docs-empty">Empty-state message</Label>
          <Textarea
            id="psc-docs-empty"
            className="mt-1.5 min-h-[4rem]"
            value={props.docsEmptyMessage ?? ""}
            disabled={disabled}
            onChange={(e) =>
              patch({ docsEmptyMessage: e.currentTarget.value || undefined })
            }
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Live portals list Document Vault tasks from the client link (same
            outstanding requests operators manage on the file).
          </p>
        </div>
      ) : null}

      {instance.sectionId === "start_new_loan" ? (
        <div className="space-y-2">
          <div>
            <Label htmlFor="psc-cta-label">Button label</Label>
            <Input
              id="psc-cta-label"
              className="mt-1.5 min-h-10"
              value={props.ctaLabel ?? ""}
              disabled={disabled}
              onChange={(e) =>
                patch({ ctaLabel: e.currentTarget.value || undefined })
              }
            />
          </div>
          <div>
            <Label htmlFor="psc-cta-url">Link URL (optional)</Label>
            <Input
              id="psc-cta-url"
              className="mt-1.5 min-h-10"
              value={props.ctaUrl ?? ""}
              disabled={disabled}
              placeholder="https://… or /apply/…"
              onChange={(e) =>
                patch({ ctaUrl: e.currentTarget.value || undefined })
              }
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Paste an intake/apply share link from Intake. Leave blank to show
              contact-your-broker guidance only.
            </p>
          </div>
          <div>
            <Label htmlFor="psc-cta-help">Help text</Label>
            <Textarea
              id="psc-cta-help"
              className="mt-1.5 min-h-[4rem]"
              value={props.ctaHelpText ?? ""}
              disabled={disabled}
              onChange={(e) =>
                patch({ ctaHelpText: e.currentTarget.value || undefined })
              }
            />
          </div>
        </div>
      ) : null}

      {instance.sectionId === "notifications_banner" ? (
        <div>
          <Label htmlFor="psc-banner">Banner message</Label>
          <Textarea
            id="psc-banner"
            className="mt-1.5 min-h-[4rem]"
            value={props.bannerBody ?? ""}
            disabled={disabled}
            onChange={(e) =>
              patch({ bannerBody: e.currentTarget.value || undefined })
            }
          />
        </div>
      ) : null}

      {instance.sectionId === "search_bar" ? (
        <div>
          <Label htmlFor="psc-search-ph">Placeholder</Label>
          <Input
            id="psc-search-ph"
            className="mt-1.5 min-h-10"
            value={props.searchPlaceholder ?? ""}
            disabled={disabled}
            onChange={(e) =>
              patch({ searchPlaceholder: e.currentTarget.value || undefined })
            }
          />
        </div>
      ) : null}

      {instance.sectionId === "stat_cards" ? (
        <div className="space-y-2">
          <Label>Card labels (up to 4)</Label>
          {(props.statLabels ?? ["Open items", "Stage", "File", "Status"]).map(
            (label, idx) => (
              <Input
                key={idx}
                className="min-h-10"
                value={label}
                disabled={disabled}
                onChange={(e) => {
                  const statLabels = [
                    ...(props.statLabels ?? [
                      "Open items",
                      "Stage",
                      "File",
                      "Status",
                    ]),
                  ];
                  statLabels[idx] = e.currentTarget.value;
                  patch({ statLabels });
                }}
              />
            ),
          )}
          <p className="text-[11px] text-muted-foreground">
            Values still come from the live file (outstanding count, stage,
            file name).
          </p>
        </div>
      ) : null}

      {instance.sectionId === "deal_summary" ||
      instance.sectionId === "document_package" ||
      instance.sectionId === "activity_feed" ||
      instance.sectionId === "pipeline_cards" ? (
        <p className="rounded-dlc-md border border-border/60 bg-background px-3 py-2 text-[11px] text-muted-foreground">
          Uses live loan-file data when this portal is assigned. Title override
          above is the main customization for this section.
        </p>
      ) : null}
    </div>
  );
}
