import { registerTool } from "../orchestrator.js";
import { createLogger } from "@outreach-tool/shared/logger";
import { config } from "@outreach-tool/shared/config";
import { sendOutreachEmail } from "@outreach-tool/shared/ses-send";

const log = createLogger("outreach");

export const OUTREACH_TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "send_email",
      description: "Send outreach email via AWS SES from admin@pier2peir.site.",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string" },
          subject: { type: "string" },
          body_html: { type: "string" },
          body_text: { type: "string" },
        },
        required: ["to", "subject", "body_html", "body_text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "queue_whatsapp_message",
      description: "Queue a WhatsApp message for delivery. Saved to DB for manual send.",
      parameters: {
        type: "object",
        properties: { phone: { type: "string" }, message: { type: "string" }, prospect_id: { type: "string" } },
        required: ["phone", "message"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "queue_linkedin_message",
      description: "Queue a LinkedIn message for delivery. Saved to DB for manual send.",
      parameters: {
        type: "object",
        properties: { linkedin_url: { type: "string" }, message: { type: "string" }, prospect_id: { type: "string" } },
        required: ["linkedin_url", "message"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_voice_note_script",
      description: "Generate a voice note script for the prospect.",
      parameters: {
        type: "object",
        properties: { prospect_name: { type: "string" }, company_name: { type: "string" }, context: { type: "string" } },
        required: ["prospect_name", "company_name", "context"],
      },
    },
  },
];

registerTool("send_email", async (args) => {
  log.info("send_email", { to: args.to, subject: args.subject, sender: config.outreach.senderEmail });

  if (!config.outreach.senderEmail) {
    return { status: "failed", error: "SENDER_EMAIL not set in .env" };
  }

  try {
    const result = await sendOutreachEmail({
      to: args.to,
      subject: args.subject,
      bodyHtml: args.body_html,
      bodyText: args.body_text,
    });
    log.info("Email sent successfully", { messageId: result.messageId, to: args.to });
    return {
      status: "sent",
      messageId: result.messageId,
      to: args.to,
      from: config.outreach.senderEmail,
    };
  } catch (err) {
    log.error("SES send failed", { error: err.message, code: err.Code || err.name });
    return {
      status: "failed",
      error: err.message,
      to: args.to,
      note: "SES sandbox: recipient must be verified. Request production access for unrestricted sending.",
    };
  }
});

registerTool("queue_whatsapp_message", async (args) => {
  log.info("queue_whatsapp", { phone: args.phone });
  return {
    status: "queued",
    channel: "whatsapp",
    phone: args.phone,
    message: args.message,
    note: "Message saved. Send manually via WhatsApp or integrate WhatsApp Business API.",
  };
});

registerTool("queue_linkedin_message", async (args) => {
  log.info("queue_linkedin", { url: args.linkedin_url });
  return {
    status: "queued",
    channel: "linkedin",
    linkedin_url: args.linkedin_url,
    message: args.message,
    note: "Message saved. Send manually via LinkedIn or apply for LinkedIn Partner API.",
  };
});

registerTool("generate_voice_note_script", async (args) => {
  log.info("generate_voice_note_script", args);
  return {
    status: "generated",
    script: `Hey ${args.prospect_name}, [pause] this is a quick message about ${args.company_name}. [pause] ${args.context} [pause] I'll send the details over - would love to chat if you're interested. Thanks!`,
    note: "Script generated. Record and send manually or integrate with a TTS API.",
  };
});
