/**
 * AWS SES — shared by API worker, HTTP app, and agents CLI.
 * In Lambda, uses the execution role when explicit SES keys are omitted.
 */
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { config } from "./config.js";

export function stripHtml(html) {
  if (!html) return "";
  return String(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function createSesClient() {
  return new SESClient({
    region: config.ses.region,
    credentials:
      config.ses.accessKeyId && config.ses.secretAccessKey
        ? { accessKeyId: config.ses.accessKeyId, secretAccessKey: config.ses.secretAccessKey }
        : undefined,
  });
}

/** True when we have a From address (required for SendEmail). */
export function hasSenderIdentity() {
  return !!config.outreach.senderEmail?.trim();
}

/**
 * Send a single outreach email.
 * @param {{ to: string; subject: string; bodyHtml: string; bodyText?: string }} opts
 */
export async function sendOutreachEmail({ to, subject, bodyHtml, bodyText }) {
  const sender = config.outreach.senderEmail?.trim();
  if (!sender) throw new Error("SENDER_EMAIL not configured");
  const dest = String(to || "").trim();
  if (!dest) throw new Error("Recipient email required");

  const ses = createSesClient();
  const text = bodyText || stripHtml(bodyHtml) || "";
  const html = bodyHtml || `<pre>${text}</pre>`;

  const result = await ses.send(
    new SendEmailCommand({
      Source: sender,
      Destination: { ToAddresses: [dest] },
      Message: {
        Subject: { Data: subject },
        Body: {
          Html: { Data: html },
          Text: { Data: text },
        },
      },
    }),
  );
  return { messageId: result.MessageId };
}
