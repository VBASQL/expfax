import nodemailer, { type Transporter } from "nodemailer";

let cachedTransporter: Transporter | null = null;

interface SmtpEnv {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  secure: boolean;
}

function readSmtpEnv(): SmtpEnv | null {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || user;
  if (!host || !user || !pass || !from) return null;

  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const secure = (process.env.SMTP_SECURE || "").toLowerCase() === "true" || port === 465;

  return { host, port, user, pass, from, secure };
}

function getTransporter(): Transporter | null {
  if (cachedTransporter) return cachedTransporter;
  const env = readSmtpEnv();
  if (!env) return null;
  cachedTransporter = nodemailer.createTransport({
    host: env.host,
    port: env.port,
    secure: env.secure,
    auth: { user: env.user, pass: env.pass },
  });
  return cachedTransporter;
}

export function isMailerConfigured(): boolean {
  return readSmtpEnv() !== null;
}

export interface SendMailOptions {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Send an email. Returns true if sent, false if mailer is not configured. Throws on send failure. */
export async function sendMail(opts: SendMailOptions): Promise<boolean> {
  const env = readSmtpEnv();
  const transporter = getTransporter();
  if (!env || !transporter) return false;

  await transporter.sendMail({
    from: env.from,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
  });
  return true;
}

export interface InvitationEmailParams {
  to: string;
  displayName: string;
  signupUrl: string;
  expiresAt: string;
  inviterName?: string;
}

export async function sendInvitationEmail(p: InvitationEmailParams): Promise<boolean> {
  const expires = new Date(p.expiresAt).toLocaleString();
  const inviter = p.inviterName ? ` by ${p.inviterName}` : "";
  const subject = "You're invited to ExpFax";
  const text = `Hi ${p.displayName},

You've been invited${inviter} to set up an ExpFax account.

Click the link below to complete signup (link expires ${expires}):
${p.signupUrl}

If you weren't expecting this, you can ignore this message.`;
  const html = `<!doctype html>
<html><body style="font-family:system-ui,Segoe UI,Arial,sans-serif;color:#0f172a;line-height:1.5;max-width:560px;margin:0 auto;padding:24px">
  <h2 style="margin:0 0 16px">You're invited to ExpFax</h2>
  <p>Hi ${escapeHtml(p.displayName)},</p>
  <p>You've been invited${escapeHtml(inviter)} to set up an ExpFax account.</p>
  <p style="margin:24px 0">
    <a href="${p.signupUrl}" style="display:inline-block;background:#0f172a;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Complete signup</a>
  </p>
  <p style="color:#475569;font-size:14px">Or copy this link:<br><span style="word-break:break-all">${escapeHtml(p.signupUrl)}</span></p>
  <p style="color:#475569;font-size:13px;margin-top:24px">This link expires ${escapeHtml(expires)}. If you weren't expecting this email, you can ignore it.</p>
</body></html>`;

  return sendMail({ to: p.to, subject, text, html });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
