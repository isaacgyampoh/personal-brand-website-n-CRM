import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import nodemailer, { type Transporter } from "nodemailer";
import { env } from "@/lib/config/env";
import { getIntegration } from "@/lib/integrations/store";
import { assertPublicHost, UnsafeHostError } from "@/lib/security/network";

export type OutgoingEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  fromName?: string;
  replyTo?: string;
  headers?: Record<string, string>;
  attachments?: { filename: string; content: Buffer; contentType: string }[];
};

export type SendResult = { provider: string; messageId: string | null };

export interface EmailTransport {
  send(msg: OutgoingEmail): Promise<SendResult>;
}

export type SmtpConfig = {
  host: string; port: number; security: "starttls" | "tls" | "none"; username: string; password: string;
  fromEmail: string; fromName: string; replyTo: string;
};

export function smtpConfigFrom(values: Record<string, string>): SmtpConfig {
  const port = Number.parseInt(values.port, 10);
  return {
    host: values.host, port: Number.isFinite(port) ? port : 587,
    security: (["starttls", "tls", "none"].includes(values.security) ? values.security : "starttls") as SmtpConfig["security"],
    username: values.username, password: values.password, fromEmail: values.fromEmail, fromName: values.fromName, replyTo: values.replyTo,
  };
}

/**
 * Builds an SMTP transport after checking the host is a public address
 * (SSRF protection: the host is client-configurable). Port 25 is refused.
 */
export async function createSmtpTransport(c: SmtpConfig): Promise<{ transporter: Transporter; transport: EmailTransport }> {
  if (![465, 587, 2525].includes(c.port)) throw new UnsafeHostError("Use SMTP port 587 (STARTTLS), 465 (TLS) or 2525.");
  await assertPublicHost(c.host);
  const transporter = nodemailer.createTransport({
    host: c.host,
    port: c.port,
    secure: c.security === "tls",
    requireTLS: c.security === "starttls",
    auth: c.username ? { user: c.username, pass: c.password } : undefined,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
  const transport: EmailTransport = {
    async send(msg) {
      const name = (msg.fromName || c.fromName || "").replace(/["<>\r\n]/g, "");
      const from = name ? `"${name}" <${c.fromEmail}>` : c.fromEmail;
      const info = await transporter.sendMail({
        from,
        to: msg.to,
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        replyTo: msg.replyTo || c.replyTo || undefined,
        headers: msg.headers,
        attachments: msg.attachments,
      });
      return { provider: "smtp", messageId: info.messageId ?? null };
    },
  };
  return { transporter, transport };
}

let smtp: { key: string; at: number; transport: EmailTransport } | undefined;

/**
 * Development-only transport: writes messages to disk (MAIL_DEV_DIR) so flows
 * can be exercised without an SMTP account. Refused in production.
 */
function devFileTransport(): EmailTransport {
  return {
    async send(msg) {
      const dir = env().MAIL_DEV_DIR ?? ".data/mail";
      await mkdir(dir, { recursive: true });
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await writeFile(
        join(dir, `${id}.json`),
        JSON.stringify({ to: msg.to, subject: msg.subject, text: msg.text, html: msg.html }, null, 2),
      );
      return { provider: "dev-file", messageId: id };
    },
  };
}

/** Active email transport: SMTP from the Integration Centre, or (outside production) a dev file sink. */
export async function emailTransport(): Promise<EmailTransport> {
  const cfg = await getIntegration("smtp");
  if (cfg.usable) {
    const key = JSON.stringify(cfg.values);
    // Re-validate the host periodically (DNS can change after it was checked).
    if (!smtp || smtp.key !== key || Date.now() - smtp.at > 10 * 60_000) {
      smtp = { key, at: Date.now(), transport: (await createSmtpTransport(smtpConfigFrom(cfg.values))).transport };
    }
    return smtp.transport;
  }
  if (env().NODE_ENV === "production") {
    throw new Error("Email is not configured. Set up SMTP in Settings → Integrations.");
  }
  return devFileTransport();
}
