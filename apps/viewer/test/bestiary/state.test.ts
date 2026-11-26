import { describe, expect, it } from "vitest";
import { deriveState } from "../../src/bestiary/state.js";

describe("deriveState", () => {
  it("4.4 maps Survived to survivor", () => {
    expect(deriveState({ reportStatus: "Survived" })).toBe("survivor");
  });

  it("4.5 maps Killed and Timeout to killed", () => {
    expect(deriveState({ reportStatus: "Killed" })).toBe("killed");
    expect(deriveState({ reportStatus: "Timeout" })).toBe("killed");
  });

  it("4.6 maps NoCoverage to in-the-dark", () => {
    expect(deriveState({ reportStatus: "NoCoverage" })).toBe("in-the-dark");
  });

  it("4.7 maps a Verdict_File Ghost status to ghost", () => {
    expect(deriveState({ reportStatus: "Ignored", verdictEntry: { status: "Ghost" } })).toBe(
      "ghost",
    );
  });

  it("4.8 draws nothing for other statuses", () => {
    expect(deriveState({ reportStatus: "CompileError" })).toBe("not-counted");
    expect(deriveState({ reportStatus: "Pending" })).toBe("not-counted");
    expect(
      deriveState({ reportStatus: "Ignored", verdictEntry: { status: "InvalidWitness" } }),
    ).toBe("not-counted");
  });

  it("4.9 takes the status from the Verdict_File entry when present", () => {
    expect(deriveState({ reportStatus: "Survived", verdictEntry: { status: "Killed" } })).toBe(
      "killed",
    );
  });

  it("4.10 falls back to the report status without a verdict entry", () => {
    expect(deriveState({ reportStatus: "Survived", verdictEntry: undefined })).toBe("survivor");
  });

  it("4.12 derives ghost from an Ignored statusReason when no Verdict_File exists", () => {
    const ignored = (statusReason?: string) =>
      deriveState({ reportStatus: "Ignored", statusReason });
    expect(ignored("Engine status: Ghost")).toBe("ghost");
    expect(ignored("Engine status: InvalidWitness")).toBe("not-counted");
    expect(ignored("Engine status: NotApplicable")).toBe("not-counted");
    expect(ignored("something else")).toBe("not-counted");
    expect(ignored(undefined)).toBe("not-counted");
  });
});
