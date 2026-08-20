import { describe, expect, it } from "vitest";
import { deviceLinkCode } from "../lib/deviceLink";

describe("device link comparison code", () => {
  it("is stable, numeric, and six digits", () => {
    const code = deviceLinkCode("request-a", "candidate-key-a");
    expect(code).toMatch(/^\d{6}$/);
    expect(deviceLinkCode("request-a", "candidate-key-a")).toBe(code);
  });

  it("changes when the request or candidate key changes", () => {
    expect(deviceLinkCode("request-a", "candidate-key-a")).not.toBe(
      deviceLinkCode("request-b", "candidate-key-a")
    );
    expect(deviceLinkCode("request-a", "candidate-key-a")).not.toBe(
      deviceLinkCode("request-a", "candidate-key-b")
    );
  });
});
