import { describe, expect, test } from "bun:test";
import { parseCliArgs, renderCliHelp } from "./cli-help.js";

const config = {
  command: "example",
  description: "An example command.",
  positionals: ["<name>"],
  options: [
    { name: "output", type: "string" as const, value: "path", description: "Output path." },
    { name: "verbose", type: "boolean" as const, description: "Print more information." },
  ],
};

describe("CLI help", () => {
  test("generates usage and long-form options from config", () => {
    expect(renderCliHelp(config)).toBe(`An example command.

Usage: example <name> [options]

Options:
      --output <path>  Output path.
      --verbose        Print more information.
      --help           Show this help.`);
  });

  test("parses configured flags and positionals", () => {
    expect(parseCliArgs(["name", "--output", "dist", "--verbose"], config)).toEqual({
      values: {
        output: "dist",
        verbose: true,
      },
      positionals: ["name"],
    });
  });

  test("does not map -h to --help", () => {
    expect(parseCliArgs(["-h"], config).values).toEqual({ h: true });
  });

  test("applies defaults and collects repeated typed options", () => {
    const typedConfig = {
      command: "typed",
      description: "Typed options.",
      options: [
        {
          name: "mode",
          type: "string" as const,
          description: "Execution mode.",
          choices: ["safe", "fast"],
          default: "safe",
        },
        {
          name: "tag",
          type: "string" as const,
          description: "Tag.",
          multiple: true,
        },
      ],
    };

    const parsed = parseCliArgs(["--tag", "one", "--tag", "two"], typedConfig);
    const mode: "safe" | "fast" = parsed.values.mode;
    const tags: string[] | undefined = parsed.values.tag;

    expect({ ...parsed.values, mode, tag: tags }).toEqual({
      mode: "safe",
      tag: ["one", "two"],
    });
  });

  test("renders notes and examples from the CLI config", () => {
    expect(
      renderCliHelp({
        ...config,
        notes: ["Values may be read from stdin."],
        examples: ["example alice --verbose"],
      }),
    ).toContain(`Notes:
  Values may be read from stdin.

Examples:
  example alice --verbose`);
  });
});
