---
mustflow_doc: skills.index
locale: en
canonical: true
revision: 1
authority: router
lifecycle: user-editable
---

# Clarissimi Skill Index

Use [`.agents/context-map.md`](../../.agents/context-map.md) as the repository-local skill router.
The closest matching procedures are:

| Trigger                                                        | Procedure                                                      |
| -------------------------------------------------------------- | -------------------------------------------------------------- |
| Monorepo package or ownership change                           | [monorepo](../../.agents/skills/monorepo/SKILL.md)             |
| CLI behavior, flags, config, or output                         | [cli-tool](../../.agents/skills/cli-tool/SKILL.md)             |
| GitHub Action inputs, outputs, permissions, or runner behavior | [github-action](../../.agents/skills/github-action/SKILL.md)   |
| Tests, fixtures, regression guards, or contract coverage       | [test-hardening](../../.agents/skills/test-hardening/SKILL.md) |

For mustflow command contracts, public-contract synchronization, structured configuration, and
completion evidence, use the shared workspace skill registry selected by the parent `AGENTS.md`.
Skill procedures guide work but never authorize commands outside
`.mustflow/config/commands.toml`.
