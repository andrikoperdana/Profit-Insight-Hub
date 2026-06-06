import { prisma } from "@workspace/db";

// Configurable business rules that used to be hard-coded. Stored as a single
// row (id "default"); reads are served from a short in-process cache so the
// hot paths (timesheet create, project create) don't hit the DB every request.
// A PUT invalidates this instance's cache immediately; other autoscale
// instances pick up the change within CACHE_TTL_MS.

export const APP_SETTINGS_ID = "default";

export interface AppSettings {
  defaultVatPercent: number;
  timesheetBackdateDays: number;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  defaultVatPercent: 11,
  timesheetBackdateDays: 5,
};

const CACHE_TTL_MS = 60_000;
let cache: { value: AppSettings; expiresAt: number } | null = null;

export function invalidateAppSettingsCache(): void {
  cache = null;
}

export async function getAppSettings(): Promise<AppSettings> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.value;
  const row = await prisma.appSetting.findUnique({ where: { id: APP_SETTINGS_ID } });
  const value: AppSettings = {
    defaultVatPercent:
      typeof row?.defaultVatPercent === "number"
        ? row.defaultVatPercent
        : DEFAULT_APP_SETTINGS.defaultVatPercent,
    timesheetBackdateDays:
      typeof row?.timesheetBackdateDays === "number"
        ? row.timesheetBackdateDays
        : DEFAULT_APP_SETTINGS.timesheetBackdateDays,
  };
  cache = { value, expiresAt: now + CACHE_TTL_MS };
  return value;
}
