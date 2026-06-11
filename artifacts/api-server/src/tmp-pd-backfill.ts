import { prisma } from "@workspace/db";
import { runFullSync } from "./lib/pipedrive.js";
import { APP_SETTINGS_ID } from "./lib/app-settings.js";

const SALES_OWNER = "cmo42trdk000213t7ajrgp9ki"; // Budi Santoso (SALES)

// Sensible starting map for the real "Sales" pipeline (pipeline 1).
const MAPPINGS = [
  { pl: 1, stage: 12, lead: "NEW", label: "Prospecting - 10%" },
  { pl: 1, stage: 1, lead: "QUALIFIED", label: "Discovery - 20%" },
  { pl: 1, stage: 2, lead: "QUALIFIED", label: "Qualification - 35%" },
  { pl: 1, stage: 3, lead: "PROPOSAL", label: "Proposal Submission - 50%" },
  { pl: 1, stage: 4, lead: "NEGOTIATION", label: "Risk Mitigation - 75%" },
  { pl: 1, stage: 5, lead: "WON", label: "Closed - 100%" },
];

async function main() {
  await prisma.appSetting.upsert({
    where: { id: APP_SETTINGS_ID },
    create: { id: APP_SETTINGS_ID, pipedriveDefaultOwnerId: SALES_OWNER },
    update: { pipedriveDefaultOwnerId: SALES_OWNER },
  });
  for (const m of MAPPINGS) {
    await prisma.pipedriveStageMapping.upsert({
      where: { pipedriveStageId: m.stage },
      create: {
        pipedrivePipelineId: m.pl,
        pipedriveStageId: m.stage,
        leadStage: m.lead as never,
        label: m.label,
      },
      update: { pipedrivePipelineId: m.pl, leadStage: m.lead as never, label: m.label },
    });
  }

  const res = await runFullSync();
  console.log("SYNC RESULT:", JSON.stringify(res, null, 2));

  const leads = await prisma.lead.findMany({
    where: { pipedriveDealId: { not: null } },
    select: {
      pipedriveDealId: true,
      title: true,
      stage: true,
      estimatedValue: true,
      probability: true,
      contactName: true,
      contactEmail: true,
      source: true,
      clientId: true,
    },
    orderBy: { pipedriveDealId: "asc" },
  });
  console.log("IMPORTED LEADS (" + leads.length + "):", JSON.stringify(leads, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("BACKFILL FAILED:", e);
  process.exit(1);
});
