import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import nodemailer, { type Transporter } from "nodemailer";
import { env, integrations } from "@/lib/config/env";

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

let smtp: Transporter | undefined;

function smtpTransport(): EmailTransport {
  const e = env();
  smtp ??= nodemailer.createTransport({
    host: e.SMTP_HOST,
    port: e.SMTP_PORT,
    secure: e.SMTP_SECURE,
    auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASS } : undefined,
  });
  return {
    async send(msg) {
      const from = msg.fromName ? `"${msg.fromName.replace(/"/g, "")}" <${e.SMTP_FROM}>` : e.SMTP_FROM!;
      const info = await smtp!.sendMail({
        from,
        to: msg.to,
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        replyTo: msg.replyTo || undefined,
        headers: msg.headers,
        attachments: msg.attachments,
      });
      return { provider: "smtp", messageId: info.messageId ?? null };
    },
  };
}

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

export function emailTransport(): EmailTransport {
  if (integrations().smtp) return smtpTransport();
  if (env().NODE_ENV === "production") {
    throw new Error("SMTP is not configured (SMTP_HOST / SMTP_FROM). Email cannot be sent.");
  }
  return devFileTransport();
}
