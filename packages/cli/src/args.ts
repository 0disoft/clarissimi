export interface ParsedArgs {
  readonly command?: string;
  readonly flags: ReadonlyMap<string, string | true>;
  readonly positionals: readonly string[];
}

export class CliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliUsageError";
  }
}

export function parseArgs(argv: readonly string[]): ParsedArgs {
  const [first, ...remaining] = argv;
  const hasCommand = first !== undefined && !first.startsWith("--");
  const command = hasCommand ? first : undefined;
  const tokens = hasCommand ? remaining : argv;
  const flags = new Map<string, string | true>();
  const positionals: string[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === undefined) {
      continue;
    }

    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }

    const flag = token.slice(2);
    if (flag.length === 0) {
      throw new CliUsageError("Flag name cannot be empty.");
    }

    const equalsIndex = flag.indexOf("=");
    if (equalsIndex >= 0) {
      flags.set(flag.slice(0, equalsIndex), flag.slice(equalsIndex + 1));
      continue;
    }

    const next = tokens[index + 1];
    if (next !== undefined && !next.startsWith("--")) {
      flags.set(flag, next);
      index += 1;
      continue;
    }

    flags.set(flag, true);
  }

  return {
    ...(command === undefined ? {} : { command }),
    flags,
    positionals,
  };
}

export function getStringFlag(
  args: ParsedArgs,
  name: string,
  fallback?: string,
): string | undefined {
  const value = args.flags.get(name);
  if (value === undefined) {
    return fallback;
  }

  if (value === true) {
    throw new CliUsageError(`--${name} requires a value.`);
  }

  if (value.trim().length === 0) {
    throw new CliUsageError(`--${name} cannot be empty.`);
  }

  return value;
}

export function getBooleanFlag(args: ParsedArgs, name: string): boolean {
  const value = args.flags.get(name);
  if (value === undefined) {
    return false;
  }

  if (value !== true) {
    throw new CliUsageError(`--${name} does not accept a value.`);
  }

  return true;
}
