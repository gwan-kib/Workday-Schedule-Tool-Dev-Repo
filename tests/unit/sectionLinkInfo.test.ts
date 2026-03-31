import { describe, expect, it } from "vitest";

import { parseSectionLinkString } from "../../src/domain/extraction/parsers/sectionLinkInfo";

describe("parseSectionLinkString", () => {
  it("parses a section link into code, section, and title", () => {
    expect(parseSectionLinkString("CPSC 110 - 101 - Computation, Programs, and Programming")).toEqual({
      code: "CPSC 110",
      section_number: "101",
      title: "Computation, Programs, and Programming",
      full: "CPSC 110 - 101 - Computation, Programs, and Programming",
    });
  });

  it("returns null for invalid inputs", () => {
    expect(parseSectionLinkString("")).toBeNull();
    expect(parseSectionLinkString("not a course")).toBeNull();
  });
});
