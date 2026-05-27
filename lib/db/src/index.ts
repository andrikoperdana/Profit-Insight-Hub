import { PrismaClient } from "./generated/client/index.js";
type PrismaClientType = InstanceType<typeof PrismaClient>;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClientType };

export const prisma: PrismaClientType =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["error", "warn"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export { runSeed, ensureCoreAccountsAndTaxonomy } from "./seed.js";
export { ensureSampleReportData } from "./sample-report-data.js";
export { ensureSampleTaskTemplates } from "./sample-task-templates.js";
export { ensureSampleProjectTemplates } from "./sample-project-templates.js";
export { ensureSampleWorkstreamProjects } from "./sample-workstream-projects.js";

export type {
  User,
  Client,
  Project,
  ProjectResource,
  Timesheet,
  Document,
  Activity,
  AuditLog,
  UserRole,
  ProjectStatus,
  TimesheetStatus,
  DocumentType,
  ProjectReportType,
  Prisma,
} from "./generated/client/index.js";
