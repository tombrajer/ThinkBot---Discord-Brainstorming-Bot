import { describe, expect, it } from "vitest";
import { parseModelJson } from "../src/analysis/modelJsonParser.js";

describe("parseModelJson", () => {
  it("parses raw JSON objects", () => {
    const result = parseModelJson('{"sessionGoal":"Goal"}');
    expect(result).toEqual({ sessionGoal: "Goal" });
  });

  it("parses JSON inside markdown fences", () => {
    const result = parseModelJson('```json\n{"sessionGoal":"Goal"}\n```');
    expect(result).toEqual({ sessionGoal: "Goal" });
  });

  it("parses JSON inside unlabeled markdown fences", () => {
    const result = parseModelJson('```\n{"sessionGoal":"Goal"}\n```');
    expect(result).toEqual({ sessionGoal: "Goal" });
  });

  it("extracts first valid JSON value from mixed text", () => {
    const result = parseModelJson('not-json {oops} preface [{"sessionGoal":"Goal"}] trailing');
    expect(result).toEqual([{ sessionGoal: "Goal" }]);
  });
});
