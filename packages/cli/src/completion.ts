import {
  CLI_COMMAND_SPECS,
  type CliCommandSpec,
  type CliFlagSpec,
  type CompletionShell,
} from "./command-spec.js";

export function renderShellCompletion(shell: CompletionShell): string {
  switch (shell) {
    case "bash":
      return renderBashCompletion();
    case "zsh":
      return renderZshCompletion();
    case "fish":
      return renderFishCompletion();
    case "powershell":
      return renderPowerShellCompletion();
  }
}

function renderBashCompletion(): string {
  const commandNames = CLI_COMMAND_SPECS.map((spec) => spec.name).join(" ");
  const lines = [
    "# Clarissimi static completion for Bash",
    "_clarissimi_completion() {",
    "  local cur prev command",
    "  COMPREPLY=()",
    '  cur="${COMP_WORDS[COMP_CWORD]}"',
    '  prev="${COMP_WORDS[COMP_CWORD-1]}"',
    '  command="${COMP_WORDS[1]}"',
    "",
    '  if [[ "$COMP_CWORD" -eq 1 ]]; then',
    `    COMPREPLY=( $(compgen -W "${commandNames}" -- "$cur") )`,
    "    return",
    "  fi",
    "",
    '  case "$command:$prev" in',
  ];

  for (const { command, flag } of enumFlags()) {
    lines.push(
      `    "${command.name}:--${flag.name}") COMPREPLY=( $(compgen -W "${flag.values?.join(" ") ?? ""}" -- "$cur") ); return ;;`,
    );
  }

  lines.push("  esac", "", '  if [[ "$COMP_CWORD" -eq 2 && "$cur" != --* ]]; then');
  lines.push('    case "$command" in');
  for (const command of CLI_COMMAND_SPECS) {
    const values = command.positionals?.[0]?.values;
    if (values !== undefined) {
      lines.push(
        `      "${command.name}") COMPREPLY=( $(compgen -W "${values.join(" ")}" -- "$cur") ); return ;;`,
      );
    }
  }
  lines.push("    esac", "  fi", "", '  case "$command" in');

  for (const command of CLI_COMMAND_SPECS) {
    lines.push(
      `    "${command.name}") COMPREPLY=( $(compgen -W "${formatFlagNames(command)}" -- "$cur") ) ;;`,
    );
  }

  lines.push("  esac", "}", "complete -F _clarissimi_completion clarissimi", "");
  return lines.join("\n");
}

function renderZshCompletion(): string {
  const lines = [
    "#compdef clarissimi",
    "# Clarissimi static completion for Zsh",
    "_clarissimi() {",
    "  local context state line",
    "  typeset -A opt_args",
    "  _arguments -C '1:command:->command' '*::argument:->arguments'",
    "",
    "  case $state in",
    "    command)",
    "      local -a commands",
    "      commands=(",
    ...CLI_COMMAND_SPECS.map(
      (command) => `        ${quoteShellWord(`${command.name}:${command.description}`)}`,
    ),
    "      )",
    "      _describe 'command' commands",
    "      ;;",
    "    arguments)",
    "      case $words[2] in",
  ];

  for (const command of CLI_COMMAND_SPECS) {
    const argumentsForCommand = [
      ...(command.positionals ?? []).map(
        (positional, index) => `${index + 1}:${positional.name}:(${positional.values.join(" ")})`,
      ),
      ...command.flags.map(renderZshFlag),
    ];
    lines.push(
      `        ${quoteShellWord(command.name)})`,
      "          _arguments \\",
      ...argumentsForCommand.map(
        (argument, index) =>
          `            ${quoteShellWord(argument)}${index === argumentsForCommand.length - 1 ? "" : " \\"}`,
      ),
      "          ;;",
    );
  }

  lines.push("      esac", "      ;;", "  esac", "}", "_clarissimi", "");
  return lines.join("\n");
}

function renderFishCompletion(): string {
  const commandNames = CLI_COMMAND_SPECS.map((command) => command.name).join(" ");
  const lines = ["# Clarissimi static completion for fish", "complete -c clarissimi -f"];

  for (const command of CLI_COMMAND_SPECS) {
    lines.push(
      `complete -c clarissimi -f -n ${quoteShellWord(`not __fish_seen_subcommand_from ${commandNames}`)} -a ${quoteShellWord(command.name)} -d ${quoteShellWord(command.description)}`,
    );

    for (const positional of command.positionals ?? []) {
      lines.push(
        `complete -c clarissimi -f -n ${quoteShellWord(`__fish_seen_subcommand_from ${command.name}`)} -a ${quoteShellWord(positional.values.join(" "))} -d ${quoteShellWord(positional.description)}`,
      );
    }

    for (const flag of command.flags) {
      const requiresValue = flag.valueLabel === undefined ? "" : " -r";
      const values =
        flag.values === undefined ? "" : ` -a ${quoteShellWord(flag.values.join(" "))}`;
      lines.push(
        `complete -c clarissimi -f -n ${quoteShellWord(`__fish_seen_subcommand_from ${command.name}`)} -l ${flag.name}${requiresValue}${values} -d ${quoteShellWord(flag.description)}`,
      );
    }
  }

  lines.push("");
  return lines.join("\n");
}

function renderPowerShellCompletion(): string {
  const commands = CLI_COMMAND_SPECS.map((command) => command.name);
  const flags = Object.fromEntries(
    CLI_COMMAND_SPECS.map((command) => [
      command.name,
      command.flags.map((flag) => `--${flag.name}`),
    ]),
  );
  const positionals = Object.fromEntries(
    CLI_COMMAND_SPECS.filter((command) => command.positionals !== undefined).map((command) => [
      command.name,
      command.positionals?.[0]?.values ?? [],
    ]),
  );
  const values = Object.fromEntries(
    enumFlags().map(({ command, flag }) => [`${command.name}|--${flag.name}`, flag.values ?? []]),
  );

  return [
    "# Clarissimi static completion for PowerShell",
    "Register-ArgumentCompleter -Native -CommandName clarissimi -ScriptBlock {",
    "  param($wordToComplete, $commandAst, $cursorPosition)",
    `  $commands = ${renderPowerShellArray(commands)}`,
    `  $flags = ${renderPowerShellHashtable(flags)}`,
    `  $positionals = ${renderPowerShellHashtable(positionals)}`,
    `  $values = ${renderPowerShellHashtable(values)}`,
    "  $elements = @($commandAst.CommandElements | ForEach-Object { $_.Extent.Text })",
    "  $command = if ($elements.Count -ge 2) { $elements[1] } else { '' }",
    "  $endsWithSpace = $commandAst.ToString().EndsWith(' ')",
    "  $previous = if ($endsWithSpace -and $elements.Count -ge 1) { $elements[-1] } elseif ($elements.Count -ge 2) { $elements[-2] } else { '' }",
    "  $candidates = @()",
    "  $valueKey = $command + '|' + $previous",
    "  if ($values.ContainsKey($valueKey)) {",
    "    $candidates = $values[$valueKey]",
    "  } elseif ([string]::IsNullOrEmpty($command)) {",
    "    $candidates = $commands",
    "  } elseif ($positionals.ContainsKey($command) -and $previous -eq $command -and -not $wordToComplete.StartsWith('-')) {",
    "    $candidates = $positionals[$command]",
    "  } elseif ($flags.ContainsKey($command)) {",
    "    $candidates = $flags[$command]",
    "  }",
    "  $candidates | Where-Object { $_.StartsWith($wordToComplete, [System.StringComparison]::OrdinalIgnoreCase) } | ForEach-Object {",
    "    [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)",
    "  }",
    "}",
    "",
  ].join("\n");
}

function enumFlags(): readonly { readonly command: CliCommandSpec; readonly flag: CliFlagSpec }[] {
  return CLI_COMMAND_SPECS.flatMap((command) =>
    command.flags.filter((flag) => flag.values !== undefined).map((flag) => ({ command, flag })),
  );
}

function formatFlagNames(command: CliCommandSpec): string {
  return command.flags.map((flag) => `--${flag.name}`).join(" ");
}

function renderZshFlag(flag: CliFlagSpec): string {
  const prefix = `--${flag.name}[${flag.description}]`;
  if (flag.values !== undefined) {
    return `${prefix}:${flag.valueLabel ?? "value"}:(${flag.values.join(" ")})`;
  }
  if (flag.valueLabel !== undefined) {
    return `${prefix}:${flag.valueLabel}:_message '${flag.valueLabel}'`;
  }
  return prefix;
}

function quoteShellWord(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function renderPowerShellArray(values: readonly string[]): string {
  return `@(${values.map(quotePowerShellString).join(", ")})`;
}

function renderPowerShellHashtable(values: Readonly<Record<string, readonly string[]>>): string {
  const entries = Object.entries(values).map(
    ([key, entryValues]) => `${quotePowerShellString(key)} = ${renderPowerShellArray(entryValues)}`,
  );
  return `@{ ${entries.join("; ")} }`;
}

function quotePowerShellString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}
