import { describe, expect, it } from "vitest";
import { decodeMessage, encodeMessage } from "../lib/envelope";
import type { AttachmentMeta, ReplyRef } from "../lib/types";

describe("message envelope compatibility", () => {
  it("keeps ordinary messages unchanged", () => {
    expect(encodeMessage("legacy plain message")).toBe("legacy plain message");
    expect(decodeMessage("legacy plain message")).toEqual({ text: "legacy plain message" });
  });

  it("round-trips reply and attachment metadata", () => {
    const reply: ReplyRef = { id: "message-1", preview: "earlier text", mine: false };
    const attachment: AttachmentMeta = {
      name: "notes.txt",
      mime: "text/plain",
      size: 12,
      ref: { path: "conversation/file" },
    };

    expect(decodeMessage(encodeMessage("caption", reply, attachment))).toEqual({
      text: "caption",
      replyTo: reply,
      attachment,
    });
  });

  it("treats malformed and unknown envelopes as plain text", () => {
    const malformed = '{"_sl":1,"t":';
    const future = '{"_sl":2,"t":"future"}';

    expect(decodeMessage(malformed)).toEqual({ text: malformed });
    expect(decodeMessage(future)).toEqual({ text: future });
  });
});
