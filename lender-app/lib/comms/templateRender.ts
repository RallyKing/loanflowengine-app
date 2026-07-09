type TemplatePrimitive = string | number | boolean | null | undefined;

export type TemplateVariableMap = Record<string, TemplatePrimitive>;

const TEMPLATE_TOKEN_RE = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

export function renderTemplateString(
  template: string | undefined,
  variables: TemplateVariableMap,
): string {
  if (!template) return "";
  return template.replace(TEMPLATE_TOKEN_RE, (_raw, key: string) => {
    const value = variables[key];
    if (value == null) return "";
    return String(value);
  });
}

export function extractTemplateVariables(template: string | undefined): string[] {
  if (!template) return [];
  const keys = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = TEMPLATE_TOKEN_RE.exec(template))) {
    if (match[1]) keys.add(match[1]);
  }
  TEMPLATE_TOKEN_RE.lastIndex = 0;
  return Array.from(keys).sort();
}

export function buildCommunicationPreview(args: {
  subjectTemplate?: string;
  bodyTemplate: string;
  variables: TemplateVariableMap;
}) {
  return {
    subject: renderTemplateString(args.subjectTemplate, args.variables),
    bodyText: renderTemplateString(args.bodyTemplate, args.variables),
    variablesUsed: Array.from(
      new Set([
        ...extractTemplateVariables(args.subjectTemplate),
        ...extractTemplateVariables(args.bodyTemplate),
      ]),
    ).sort(),
  };
}
