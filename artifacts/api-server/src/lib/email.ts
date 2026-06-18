import { prisma } from "@workspace/db";
import { logger } from "./logger.js";

/**
 * Best-effort transactional email delivery via the Resend REST API.
 *
 * Email is a downstream side effect of creating an in-app Notification row
 * (the source of truth). It must never block or break a business request:
 * every failure is caught and logged, and the send is fired without awaiting
 * from request handlers. Only "important" notification types are emailed.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const SEND_TIMEOUT_MS = 5000;

const EMAIL_FROM = process.env.EMAIL_FROM || "SecureProfit Hub <notifications@mail.psa4pmo.xyz>";
const APP_BASE_URL = (process.env.APP_BASE_URL || "https://psa4pmo.xyz").replace(/\/+$/, "");
const REPLY_TO = process.env.EMAIL_REPLY_TO || "";

/** Notification `type` values that should also be sent as email (important only). */
export const EMAIL_NOTIFICATION_TYPES = new Set<string>([
  "timesheet.submitted",
  "timesheet.approved",
  "timesheet.rejected",
  "expense.rejected",
  "INVOICE_DUE_SOON",
  "PROJECT_OVERRUN",
  "LOW_MARGIN",
]);

export function shouldEmailNotification(type: string): boolean {
  return EMAIL_NOTIFICATION_TYPES.has(type);
}

const PLACEHOLDER_DOMAINS = new Set([
  "example.com",
  "example.org",
  "example.net",
  "test.com",
  "test",
  "localhost",
  "invalid",
  "none.com",
  "email.com",
]);

function parseList(v: string | undefined): string[] {
  return (v || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

// Optional safety levers for rollout (comma-separated, case-insensitive):
//  - EMAIL_SEND_ALLOWLIST: if set, ONLY these exact addresses receive email.
//  - EMAIL_SEND_BLOCKLIST_DOMAINS: extra domains to never send to.
const ALLOWLIST = parseList(process.env.EMAIL_SEND_ALLOWLIST);
const BLOCKLIST_DOMAINS = new Set([
  ...PLACEHOLDER_DOMAINS,
  ...parseList(process.env.EMAIL_SEND_BLOCKLIST_DOMAINS),
]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmailEligible(email: string | null | undefined): email is string {
  if (!email) return false;
  const addr = email.trim().toLowerCase();
  if (!EMAIL_RE.test(addr)) return false;
  const domain = addr.split("@")[1];
  if (!domain || BLOCKLIST_DOMAINS.has(domain)) return false;
  if (ALLOWLIST.length > 0 && !ALLOWLIST.includes(addr)) return false;
  return true;
}

function emailDomain(email: string): string {
  return email.split("@")[1]?.toLowerCase() ?? "unknown";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Send a single email through Resend. Returns true on success, false otherwise (never throws). */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    logger.warn("RESEND_API_KEY not set; skipping email send");
    return false;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const body: Record<string, unknown> = {
      from: EMAIL_FROM,
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    };
    if (REPLY_TO) body.reply_to = REPLY_TO;

    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      // Parse only a safe error code; never log the raw provider body, which
      // may echo recipient addresses or message content (PII).
      let errorCode = "unknown";
      try {
        const parsed = (await res.json()) as { name?: string };
        if (parsed?.name) errorCode = parsed.name;
      } catch {
        // ignore
      }
      logger.warn(
        { status: res.status, domain: emailDomain(opts.to), errorCode },
        "Resend email send failed",
      );
      return false;
    }
    return true;
  } catch (err) {
    logger.warn(
      { err: (err as Error)?.message, domain: emailDomain(opts.to) },
      "Resend email send error",
    );
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function buildHtml(opts: { name: string; title: string; message: string; url: string | null }): string {
  const safeName = escapeHtml(opts.name || "there");
  const safeTitle = escapeHtml(opts.title);
  const safeMessage = escapeHtml(opts.message);
  const button = opts.url
    ? `<tr><td style="padding-top:24px;">
            <a href="${escapeHtml(opts.url)}" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:8px;">Open in SecureProfit Hub</a>
          </td></tr>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1f2933;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e7eb;">
        <tr><td style="background:#0f172a;padding:18px 28px;">
          <span style="color:#22c55e;font-weight:700;font-size:16px;letter-spacing:0.3px;">SecureProfit Hub</span>
        </td></tr>
        <tr><td style="padding:28px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="font-size:14px;color:#52606d;padding-bottom:8px;">Hi ${safeName},</td></tr>
            <tr><td style="font-size:18px;font-weight:700;color:#1f2933;padding-bottom:10px;">${safeTitle}</td></tr>
            <tr><td style="font-size:15px;line-height:1.55;color:#3e4c59;">${safeMessage}</td></tr>
            ${button}
          </table>
        </td></tr>
        <tr><td style="padding:18px 28px;background:#f9fafb;border-top:1px solid #eef1f4;font-size:12px;color:#9aa5b1;">
          You are receiving this because you have an account in SecureProfit Hub.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function buildText(opts: { name: string; title: string; message: string; url: string | null }): string {
  const lines = [`Hi ${opts.name || "there"},`, "", opts.title, "", opts.message];
  if (opts.url) lines.push("", `Open: ${opts.url}`);
  lines.push("", "— SecureProfit Hub");
  return lines.join("\n");
}

/**
 * Look up the recipient and, if eligible, send the notification as email.
 * Best-effort: catches everything, never throws. Intended to be called without
 * awaiting from request handlers (the in-app notification is the source of truth).
 */
export async function maybeSendNotificationEmail(opts: {
  userId: string;
  type: string;
  title: string;
  message: string;
  link?: string | null;
}): Promise<void> {
  try {
    if (!shouldEmailNotification(opts.type)) return;
    if (!process.env.RESEND_API_KEY) return;

    const user = await prisma.user.findUnique({
      where: { id: opts.userId },
      select: { email: true, name: true, deletedAt: true },
    });
    if (!user || user.deletedAt) return;
    if (!isEmailEligible(user.email)) {
      logger.debug(
        { type: opts.type, userId: opts.userId },
        "notification email skipped (ineligible recipient)",
      );
      return;
    }

    const to = user.email.trim();
    const url = opts.link
      ? `${APP_BASE_URL}${opts.link.startsWith("/") ? "" : "/"}${opts.link}`
      : null;
    const html = buildHtml({ name: user.name, title: opts.title, message: opts.message, url });
    const text = buildText({ name: user.name, title: opts.title, message: opts.message, url });

    const ok = await sendEmail({ to, subject: opts.title, html, text });
    const logData = { type: opts.type, userId: opts.userId, domain: emailDomain(to) };
    if (ok) logger.debug(logData, "notification email sent");
    else logger.warn(logData, "notification email not sent");
  } catch (err) {
    logger.warn(
      { err: (err as Error)?.message, type: opts.type, userId: opts.userId },
      "notification email error",
    );
  }
}
