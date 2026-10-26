import {
  CONFIG_MARKDOWN_SUMMARIES,
  CONFIG_PROVIDER_ENDPOINT_TRUST_VALUES,
  CONFIG_PROVIDER_THINKING_VALUES,
  CONFIG_PROVIDERS,
} from "@clarissimi/schemas";

export const SUPPORTED_COMPLETION_SHELLS = ["bash", "zsh", "fish", "powershell"] as const;

export type CompletionShell = (typeof SUPPORTED_COMPLETION_SHELLS)[number];

export interface CliFlagSpec {
  readonly name: string;
  readonly description: string;
  readonly valueLabel?: string;
  readonly values?: readonly string[];
}

export interface CliPositionalSpec {
  readonly name: string;
  readonly description: string;
  readonly values: readonly string[];
}

export interface CliCommandSpec {
  readonly name: string;
  readonly description: string;
  readonly usage: string;
  readonly flags: readonly CliFlagSpec[];
  readonly positionals?: readonly CliPositionalSpec[];
}

const HELP_FLAG = {
  name: "help",
  description: "Show CLI help.",
} as const satisfies CliFlagSpec;

const JSON_FLAG = {
  name: "json",
  description: "Write machine-readable JSON.",
} as const satisfies CliFlagSpec;

const CONFIG_FLAG = {
  name: "config",
  description: "Use an explicit config file.",
  valueLabel: "path",
} as const satisfies CliFlagSpec;

const LEDGER_FLAG = {
  name: "ledger",
  description: "Use an explicit contribution ledger.",
  valueLabel: "path",
} as const satisfies CliFlagSpec;

const MARKDOWN_SUMMARY_FLAG = {
  name: "markdown-summary",
  description: "Select the contributor Markdown summary.",
  valueLabel: "format",
  values: CONFIG_MARKDOWN_SUMMARIES,
} as const satisfies CliFlagSpec;

const EXCLUDE_AUTOMATION_FLAG = {
  name: "exclude-automation-contributors",
  description: "Hide bot and AI-agent contributors from display outputs.",
} as const satisfies CliFlagSpec;

export const CLI_GLOBAL_FLAGS = [HELP_FLAG] as const satisfies readonly CliFlagSpec[];

export const CLI_COMMAND_SPECS: readonly CliCommandSpec[] = [
  {
    name: "help",
    description: "Show CLI help.",
    usage: "clarissimi help",
    flags: [HELP_FLAG],
  },
  {
    name: "validate-config",
    description: "Validate configuration discovery and values.",
    usage: "clarissimi validate-config [--config <path>] [--json]",
    flags: [CONFIG_FLAG, JSON_FLAG, HELP_FLAG],
  },
  {
    name: "validate-ledger",
    description: "Validate the public contribution ledger.",
    usage: "clarissimi validate-ledger [--ledger <path>] [--json]",
    flags: [LEDGER_FLAG, JSON_FLAG, HELP_FLAG],
  },
  {
    name: "recognize",
    description: "Create recognition drafts from fixtures or selected merged GitHub PRs.",
    usage:
      "clarissimi recognize (--fixture <path> | --github-fixture <path>) --mode dry-run [--config <path>] [--markdown-summary none|table|gallery] [--exclude-automation-contributors] [--provider <id>] [--provider-model <model>] [--provider-endpoint <url>] [--provider-endpoint-trust public|private-network] [--provider-thinking disabled] [--json]",
    flags: [
      {
        name: "pr",
        description: "Collect one merged github.com pull request URL.",
        valueLabel: "url",
      },
      {
        name: "repo",
        description: "Select a GitHub repository for --prs.",
        valueLabel: "owner/name",
      },
      {
        name: "prs",
        description: "Collect up to 25 comma-separated merged PR numbers.",
        valueLabel: "numbers",
      },
      { name: "drafts-dir", description: "Select the live stage-draft inbox.", valueLabel: "path" },
      { name: "allow-partial", description: "Allow bounded file collection and report omissions." },
      {
        name: "fixture",
        description: "Read a Clarissimi evidence fixture.",
        valueLabel: "path",
      },
      {
        name: "github-fixture",
        description: "Read a GitHub merged pull request fixture.",
        valueLabel: "path",
      },
      {
        name: "mode",
        description: "Use dry-run or explicitly stage live PR drafts.",
        valueLabel: "mode",
        values: ["dry-run", "stage-draft"],
      },
      CONFIG_FLAG,
      MARKDOWN_SUMMARY_FLAG,
      EXCLUDE_AUTOMATION_FLAG,
      {
        name: "provider",
        description: "Select the contribution draft provider.",
        valueLabel: "provider",
        values: CONFIG_PROVIDERS,
      },
      {
        name: "provider-model",
        description: "Select an explicit provider model.",
        valueLabel: "model",
      },
      {
        name: "provider-endpoint",
        description: "Use an explicit provider endpoint.",
        valueLabel: "url",
      },
      {
        name: "provider-endpoint-trust",
        description: "Select the provider endpoint trust policy.",
        valueLabel: "trust",
        values: CONFIG_PROVIDER_ENDPOINT_TRUST_VALUES,
      },
      {
        name: "provider-thinking",
        description: "Select the supported provider thinking mode.",
        valueLabel: "mode",
        values: CONFIG_PROVIDER_THINKING_VALUES,
      },
      JSON_FLAG,
      HELP_FLAG,
    ],
  },
  {
    name: "stage-draft",
    description: "Stage a draft for maintainer review.",
    usage: "clarissimi stage-draft --draft <path> [--drafts-dir <path>] [--json]",
    flags: [
      {
        name: "draft",
        description: "Read an assessment draft.",
        valueLabel: "path",
      },
      {
        name: "drafts-dir",
        description: "Write to an explicit draft inbox directory.",
        valueLabel: "path",
      },
      JSON_FLAG,
      HELP_FLAG,
    ],
  },
  {
    name: "review-drafts",
    description: "Review a hash-bound batch, then explicitly approve and import it together.",
    usage:
      "clarissimi review-drafts --review <path> [--drafts-dir <path> | --approve] [--ledger <path>] [--out-dir <path>] [--config <path>] [--json]",
    flags: [
      {
        name: "review",
        description: "Save or approve an exact review manifest.",
        valueLabel: "path",
      },
      {
        name: "drafts-dir",
        description: "Select an inbox when generating the review.",
        valueLabel: "path",
      },
      { name: "approve", description: "Approve the reviewed hashes and import this batch." },
      {
        name: "out-dir",
        description: "Select derived output directory for approval.",
        valueLabel: "path",
      },
      LEDGER_FLAG,
      CONFIG_FLAG,
      MARKDOWN_SUMMARY_FLAG,
      EXCLUDE_AUTOMATION_FLAG,
      JSON_FLAG,
      HELP_FLAG,
    ],
  },
  {
    name: "approve-draft",
    description: "Approve a staged draft without importing it.",
    usage: "clarissimi approve-draft --draft <path> [--json]",
    flags: [
      {
        name: "draft",
        description: "Read and update a staged draft.",
        valueLabel: "path",
      },
      JSON_FLAG,
      HELP_FLAG,
    ],
  },
  {
    name: "import-draft",
    description: "Import an approved draft and rebuild outputs.",
    usage:
      "clarissimi import-draft --draft <path> [--ledger <path>] [--out-dir <path>] [--config <path>] [--markdown-summary none|table|gallery] [--exclude-automation-contributors] [--allow-legacy-approval] [--json]",
    flags: [
      {
        name: "draft",
        description: "Read an approved assessment draft.",
        valueLabel: "path",
      },
      LEDGER_FLAG,
      {
        name: "out-dir",
        description: "Write derived outputs to an explicit directory.",
        valueLabel: "path",
      },
      CONFIG_FLAG,
      MARKDOWN_SUMMARY_FLAG,
      EXCLUDE_AUTOMATION_FLAG,
      {
        name: "allow-legacy-approval",
        description: "Import an approved legacy draft without an approval snapshot.",
      },
      JSON_FLAG,
      HELP_FLAG,
    ],
  },
  {
    name: "rebuild",
    description: "Rebuild or check derived outputs against the public ledger.",
    usage:
      "clarissimi rebuild [--ledger <path>] [--out-dir <path>] [--check] [--config <path>] [--markdown-summary none|table|gallery] [--exclude-automation-contributors] [--json]",
    flags: [
      LEDGER_FLAG,
      {
        name: "out-dir",
        description: "Write derived outputs to an explicit directory.",
        valueLabel: "path",
      },
      {
        name: "check",
        description:
          "Compare existing outputs with the ledger without rewriting them; requires --out-dir.",
      },
      CONFIG_FLAG,
      MARKDOWN_SUMMARY_FLAG,
      EXCLUDE_AUTOMATION_FLAG,
      JSON_FLAG,
      HELP_FLAG,
    ],
  },
  {
    name: "render-page",
    description: "Render a self-contained contributor page from the public ledger.",
    usage:
      "clarissimi render-page --out-dir <path> [--ledger <path>] [--config <path>] [--exclude-automation-contributors] [--json]",
    flags: [
      LEDGER_FLAG,
      {
        name: "out-dir",
        description: "Write the contributor page to an explicit directory.",
        valueLabel: "path",
      },
      CONFIG_FLAG,
      EXCLUDE_AUTOMATION_FLAG,
      JSON_FLAG,
      HELP_FLAG,
    ],
  },
  {
    name: "analytics",
    description: "Run maintainer-only ledger analytics.",
    usage:
      "clarissimi analytics recent-share [--ledger <path>] [--window-days <days>] [--as-of <iso-date>] [--json]",
    flags: [
      LEDGER_FLAG,
      {
        name: "window-days",
        description: "Set the positive recent-share window.",
        valueLabel: "days",
      },
      {
        name: "as-of",
        description: "Set the analytics cutoff date.",
        valueLabel: "iso-date",
      },
      JSON_FLAG,
      HELP_FLAG,
    ],
    positionals: [
      {
        name: "subcommand",
        description: "Select the analytics report.",
        values: ["recent-share"],
      },
    ],
  },
  {
    name: "completion",
    description: "Print a static shell completion script.",
    usage: "clarissimi completion <bash|zsh|fish|powershell>",
    flags: [HELP_FLAG],
    positionals: [
      {
        name: "shell",
        description: "Select the target shell.",
        values: SUPPORTED_COMPLETION_SHELLS,
      },
    ],
  },
];

const CLI_COMMAND_BY_NAME = new Map<string, CliCommandSpec>(
  CLI_COMMAND_SPECS.map((spec) => [spec.name, spec]),
);
const CLI_GLOBAL_FLAG_NAMES = new Set(CLI_GLOBAL_FLAGS.map((flag) => flag.name));

export function findCliCommandSpec(command: string): CliCommandSpec | undefined {
  return CLI_COMMAND_BY_NAME.get(command);
}

export function getSupportedCliFlagNames(command?: string): ReadonlySet<string> | undefined {
  if (command === undefined) {
    return CLI_GLOBAL_FLAG_NAMES;
  }

  const spec = findCliCommandSpec(command);
  return spec === undefined ? undefined : new Set(spec.flags.map((flag) => flag.name));
}

export function isSupportedCompletionShell(value: string): value is CompletionShell {
  return (SUPPORTED_COMPLETION_SHELLS as readonly string[]).includes(value);
}

export function renderCliHelp(): string {
  return [
    "Clarissimi CLI",
    "",
    "Commands:",
    "  clarissimi --help",
    ...CLI_COMMAND_SPECS.map((spec) => `  ${spec.usage}`),
    "",
  ].join("\n");
}

export function renderCliCommandHelp(spec: CliCommandSpec): string {
  const options = spec.flags.map((flag) => ({
    label: `--${flag.name}${flag.valueLabel === undefined ? "" : ` <${flag.valueLabel}>`}`,
    description: flag.description,
    values: flag.values,
  }));
  const arguments_ = (spec.positionals ?? []).map((positional) => ({
    label: `<${positional.name}>`,
    description: positional.description,
    values: positional.values,
  }));
  return [
    `Clarissimi CLI: ${spec.name}`,
    "",
    spec.description,
    "",
    "Usage:",
    `  ${spec.usage}`,
    ...(arguments_.length === 0 ? [] : ["", "Arguments:", ...renderHelpEntries(arguments_)]),
    "",
    "Options:",
    ...renderHelpEntries(options),
    "",
  ].join("\n");
}

function renderHelpEntries(
  entries: readonly {
    readonly label: string;
    readonly description: string;
    readonly values: readonly string[] | undefined;
  }[],
): string[] {
  const width = Math.max(0, ...entries.map((entry) => entry.label.length));
  return entries.flatMap((entry) => [
    `  ${entry.label.padEnd(width)}  ${entry.description}`,
    ...(entry.values === undefined
      ? []
      : [`  ${"".padEnd(width)}  Choices: ${entry.values.join(", ")}.`]),
  ]);
}
