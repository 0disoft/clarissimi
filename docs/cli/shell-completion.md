# Shell Completion

- Status: Implemented
- Repository Type: cli-tool

## Decision

Clarissimi generates deterministic static completion for Bash, Zsh, fish, and PowerShell:

```text
clarissimi completion <bash|zsh|fish|powershell>
```

The command writes the shell program to stdout. It does not install or modify shell startup files.
Maintainers choose whether to source the result for one session or redirect it to a shell-owned
completion directory.

Session examples:

```bash
source <(clarissimi completion bash)
```

```zsh
source <(clarissimi completion zsh)
```

```fish
clarissimi completion fish | source
```

```powershell
clarissimi completion powershell | Out-String | Invoke-Expression
```

## Contract

- Supported targets are exactly `bash`, `zsh`, `fish`, and `powershell`.
- Output contains static command names, flags, subcommands, shell names, and bounded enum values.
- Help, flag validation, and completion use one typed CLI command descriptor.
- Provider and Markdown-summary values are imported from `packages/schemas` rather than duplicated.
- Path-valued options complete only the option name. Clarissimi does not enumerate files.
- Output uses LF line endings and ends with a newline.
- The command does not support `--json`; its successful stdout is already the generated program.

Completion does not read config, ledgers, `.clarissimi`, environment variables, provider tokens,
GitHub tokens, repository evidence, or generated output. It performs no provider, GitHub, or network
request.

## Review Blockers

- Help, supported flags, and completion use separate command lists.
- Completion reads repository files, environment values, or credentials.
- Completion invokes native path enumeration on behalf of Clarissimi.
- A supported shell or completion privacy boundary is not covered by focused and built-binary smoke
  validation.
