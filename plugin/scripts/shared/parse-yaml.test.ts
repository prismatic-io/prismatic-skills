import { describe, expect, test } from "bun:test";
import { parseYaml } from "./parse-yaml.ts";

/**
 * parse-yaml is a hand-rolled subset parser for the requirements specs. These tests pin
 * the behaviours the specs rely on that a naive line-splitter gets wrong: block scalars,
 * flow collections, colons inside quotes/URLs, and inline comment stripping.
 */

describe("parseYaml", () => {
  test("literal block scalar (|) preserves internal newlines", () => {
    const doc = ["key: |", "  line1", "  line2"].join("\n");
    // Folded (>) would collapse the newline to a space — this must NOT.
    expect(parseYaml(doc)).toEqual({ key: "line1\nline2\n" });
  });

  test("folded block scalar (>) joins lines with spaces", () => {
    const doc = ["key: >", "  line1", "  line2"].join("\n");
    expect(parseYaml(doc)).toEqual({ key: "line1 line2\n" });
  });

  test("flow sequence and flow mapping parse inline, with number coercion", () => {
    expect(parseYaml("items: [a, b, c]")).toEqual({ items: ["a", "b", "c"] });
    // `1` coerces to a number; `two` stays a string.
    expect(parseYaml("obj: {a: 1, b: two}")).toEqual({ obj: { a: 1, b: "two" } });
  });

  test("colons inside quoted values and URLs do not split the key/value", () => {
    // Two colons (scheme + port): only the key/value colon splits; the URL survives intact.
    expect(parseYaml('url: "https://example.com:8080/path"')).toEqual({
      url: "https://example.com:8080/path",
    });
    expect(parseYaml("url: https://example.com/x")).toEqual({ url: "https://example.com/x" });
  });

  test("strips trailing inline comments but not '#' inside quotes", () => {
    expect(parseYaml("key: value  # trailing comment")).toEqual({ key: "value" });
    expect(parseYaml('key: "a # b"')).toEqual({ key: "a # b" });
  });

  test("nested maps are keyed by indentation", () => {
    const doc = ["parent:", "  child: 1", "  other: two"].join("\n");
    expect(parseYaml(doc)).toEqual({ parent: { child: 1, other: "two" } });
  });
});
