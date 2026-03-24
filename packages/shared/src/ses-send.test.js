import { describe, it, expect, vi } from "vitest";

vi.mock("@aws-sdk/client-ses", () => ({
  SESClient: class {
    send() {
      return Promise.resolve({ MessageId: "msg-123" });
    }
  },
  SendEmailCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));

vi.mock("./config.js", () => ({
  config: {
    ses: { region: "us-east-1", accessKeyId: "AKIA", secretAccessKey: "secret" },
    outreach: { senderEmail: "from@example.com" },
  },
}));

describe("ses-send", () => {
  it("stripHtml removes tags", async () => {
    const { stripHtml } = await import("./ses-send.js");
    expect(stripHtml("<p>Hello <b>world</b></p>")).toBe("Hello world");
  });

  it("sendOutreachEmail returns message id", async () => {
    const { sendOutreachEmail } = await import("./ses-send.js");
    const r = await sendOutreachEmail({
      to: "to@example.com",
      subject: "Hi",
      bodyHtml: "<p>Test</p>",
      bodyText: "Test",
    });
    expect(r.messageId).toBe("msg-123");
  });
});
