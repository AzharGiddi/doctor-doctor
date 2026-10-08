import "server-only";
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { z } from "zod";

export type EmailMessage = { to: string; subject: string; text: string; actionUrl: string };
export interface EmailProvider { send(message: EmailMessage): Promise<void> }

class LocalConsoleEmailProvider implements EmailProvider {
  async send(message: EmailMessage): Promise<void> {
    console.info("[local email preview]", JSON.stringify(message));
  }
}

class SmtpEmailProvider implements EmailProvider {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor() {
    const config = z.object({
      host: z.string().trim().min(1),
      port: z.coerce.number().int().min(1).max(65535),
      secure: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
      user: z.string().optional(),
      password: z.string().optional(),
      from: z.string().trim().email(),
    }).parse({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: process.env.SMTP_SECURE ?? "false",
      user: process.env.SMTP_USER,
      password: process.env.SMTP_PASSWORD,
      from: process.env.SMTP_FROM,
    });
    if (Boolean(config.user) !== Boolean(config.password)) throw new Error("SMTP_USER and SMTP_PASSWORD must be set together.");
    this.from = config.from;
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      requireTLS: !config.secure,
      auth: config.user ? { user: config.user, pass: config.password } : undefined,
      tls: { minVersion: "TLSv1.2" },
    });
  }

  async send(message: EmailMessage): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: `${message.text}\n\n${message.actionUrl}`,
      headers: { "X-Auto-Response-Suppress": "All" },
    });
  }
}

export function getEmailProvider(): EmailProvider {
  if ((process.env.EMAIL_DRIVER ?? "console") === "console" && process.env.NODE_ENV !== "production") return new LocalConsoleEmailProvider();
  if (process.env.EMAIL_DRIVER === "smtp") return new SmtpEmailProvider();
  throw new Error("Set EMAIL_DRIVER=smtp and configure the SMTP environment variables to send account email.");
}

export function buildActionUrl(path: string, token: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!baseUrl) throw new Error("NEXT_PUBLIC_APP_URL must be configured to send account links.");
  const url = new URL(path, baseUrl);
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") throw new Error("Account links require HTTPS in production.");
  url.searchParams.set("token", token);
  return url.toString();
}
