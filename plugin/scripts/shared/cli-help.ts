import { parseArgs } from "node:util";

export interface CliOption {
  name: string;
  type: "boolean" | "string";
  description: string;
  value?: string;
  multiple?: boolean;
  default?: boolean | string | boolean[] | string[];
  required?: boolean;
  choices?: readonly string[];
}

export interface CliPositional {
  name: string;
  description?: string;
  required?: boolean;
  variadic?: boolean;
}

export interface CliConfig {
  command: string;
  description: string;
  notes?: readonly string[];
  examples?: readonly string[];
  positionals?: readonly (string | CliPositional)[];
  options: readonly CliOption[];
}

type ParsedScalar<Option extends CliOption> = Option["type"] extends "boolean"
  ? boolean
  : Option extends { choices: readonly (infer Choice extends string)[] }
    ? Choice
    : string;

type ParsedOptionValue<Option extends CliOption> = Option["multiple"] extends true
  ? ParsedScalar<Option>[]
  : ParsedScalar<Option>;

type IsRequired<Option extends CliOption> = Option extends { required: true } | { default: unknown }
  ? true
  : false;

export type CliValues<Config extends CliConfig> = {
  [Option in Config["options"][number] as IsRequired<Option> extends true
    ? Option["name"]
    : never]-?: ParsedOptionValue<Option>;
} & {
  [Option in Config["options"][number] as IsRequired<Option> extends false
    ? Option["name"]
    : never]?: ParsedOptionValue<Option>;
} & { help?: boolean };

function positionalLabel(positional: string | CliPositional): string {
  if (typeof positional === "string") return positional;
  const suffix = positional.variadic ? "..." : "";
  return positional.required ? `<${positional.name}${suffix}>` : `[${positional.name}${suffix}]`;
}

export function cliError(config: CliConfig, message: string): never {
  console.error(`Error: ${message}\n`);
  console.error(renderCliHelp(config));
  process.exit(2);
}

export function parseCliArgs<const Config extends CliConfig>(args: string[], config: Config) {
  const options = Object.fromEntries(
    config.options.map(({ name, type, multiple, default: defaultValue }) => {
      const option: {
        type: "boolean" | "string";
        multiple?: boolean;
        default?: boolean | string | boolean[] | string[];
      } = { type };
      if (multiple !== undefined) option.multiple = multiple;
      if (defaultValue !== undefined) {
        option.default = defaultValue;
      }
      return [name, option];
    }),
  );
  options.help = { type: "boolean" };

  const result = parseArgs({
    args,
    options,
    allowPositionals: true,
    strict: false,
  });

  if (result.values.help) {
    console.log(renderCliHelp(config));
    process.exit(0);
  }

  for (const option of config.options) {
    const value = result.values[option.name];
    const hasExpectedType = option.multiple
      ? Array.isArray(value) &&
        value.length > 0 &&
        value.every((item) => typeof item === option.type)
      : typeof value === option.type;
    if (option.required && !hasExpectedType) {
      cliError(config, `--${option.name} is required.`);
    }
    const choiceValues = Array.isArray(value) ? value : [value];
    const choices = option.choices;
    const invalidChoice = choices
      ? choiceValues.find(
          (item): item is string => typeof item === "string" && !choices.includes(item),
        )
      : undefined;
    if (invalidChoice !== undefined) {
      cliError(config, `--${option.name} must be one of: ${choices?.join(", ")}.`);
    }
  }

  const positionalDefinitions = (config.positionals ?? []).filter(
    (positional): positional is CliPositional => typeof positional !== "string",
  );
  for (const [index, positional] of positionalDefinitions.entries()) {
    if (positional.required && result.positionals[index] === undefined) {
      cliError(config, `${positional.name} is required.`);
    }
  }

  return result as { values: CliValues<Config>; positionals: string[] };
}

export function renderCliHelp(config: CliConfig): string {
  const optionLabels = config.options.map(({ name, value }) =>
    value ? `    --${name} <${value}>` : `    --${name}`,
  );
  const helpLabel = "    --help";
  const width = Math.max(helpLabel.length, ...optionLabels.map((label) => label.length));
  const usageParts = [
    config.command,
    ...(config.positionals ?? []).map(positionalLabel),
    config.options.length > 0 ? "[options]" : undefined,
  ].filter((part): part is string => part !== undefined);

  const optionLines = config.options.map((option, index) => {
    const details = [
      option.required ? "required" : undefined,
      option.choices ? `choices: ${option.choices.join(", ")}` : undefined,
      option.default !== undefined ? `default: ${String(option.default)}` : undefined,
    ].filter(Boolean);
    const description = details.length
      ? `${option.description} (${details.join("; ")})`
      : option.description;
    return `  ${optionLabels[index].padEnd(width)}  ${description}`;
  });

  const notes = config.notes?.length
    ? ["", "Notes:", ...config.notes.map((note) => `  ${note}`)]
    : [];
  const examples = config.examples?.length
    ? ["", "Examples:", ...config.examples.map((example) => `  ${example}`)]
    : [];

  return [
    config.description,
    "",
    `Usage: ${usageParts.join(" ")}`,
    "",
    "Options:",
    ...optionLines,
    `  ${helpLabel.padEnd(width)}  Show this help.`,
    ...notes,
    ...examples,
  ].join("\n");
}
