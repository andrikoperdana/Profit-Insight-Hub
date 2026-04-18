export const PROJECT_TYPES = [
  "Pentest",
  "GRC",
  "SOC",
  "Threat Hunting",
  "Fraud Investigation",
  "VAPT",
  "Audit",
  "Forensics",
  "Red Team",
  "Training",
  "Other",
] as const;

export type ProjectType = (typeof PROJECT_TYPES)[number];

const RULES: { type: ProjectType; patterns: RegExp[] }[] = [
  { type: "Pentest", patterns: [/pen[\s-]?test/i, /penetration/i] },
  { type: "VAPT", patterns: [/\bvapt\b/i, /vulnerability assessment/i] },
  { type: "GRC", patterns: [/\bgrc\b/i, /governance/i, /iso\s*27001/i, /compliance/i, /risk/i] },
  { type: "SOC", patterns: [/\bsoc\b/i, /security operations/i, /siem/i, /soar/i] },
  { type: "Threat Hunting", patterns: [/threat\s*hunt/i, /hunting/i] },
  { type: "Fraud Investigation", patterns: [/fraud/i] },
  { type: "Forensics", patterns: [/forensic/i, /incident response/i, /\bir\b/i] },
  { type: "Red Team", patterns: [/red\s*team/i, /adversary/i] },
  { type: "Audit", patterns: [/audit/i, /assessment/i] },
  { type: "Training", patterns: [/training/i, /workshop/i, /awareness/i] },
];

export function classifyProject(input: { name?: string | null; code?: string | null; description?: string | null }): ProjectType {
  const hay = `${input.name ?? ""} ${input.code ?? ""} ${input.description ?? ""}`;
  for (const r of RULES) {
    if (r.patterns.some((p) => p.test(hay))) return r.type;
  }
  return "Other";
}
