import type { Id } from "@/convex/_generated/dataModel";

const USER_PREFIX = "user:";

export function decodeFileCreationTemplateSelect(value: string): {
  catalogFileTemplateId?: string;
  userPipelineFileTemplateId?: Id<"pipelineFileUserTemplates">;
} {
  const v = value.trim();
  if (!v) return {};
  if (v.startsWith(USER_PREFIX)) {
    return {
      userPipelineFileTemplateId: v.slice(
        USER_PREFIX.length,
      ) as Id<"pipelineFileUserTemplates">,
    };
  }
  return { catalogFileTemplateId: v };
}
