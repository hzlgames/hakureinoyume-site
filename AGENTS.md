# Agent Instructions

These instructions apply to AI coding agents working in this repository, including Codex, Claude Code, Antigravity, and other tools that read project-level agent guidance.

## Project Context

`hakureinoyume-site` is a Next.js application with a visual system built around background imagery, glass panels, global CSS theme tokens, and light/dark theme behavior.

## Skills

The canonical project skills directory is `.agents/skills/`.

Each skill follows the Agent Skills format:

```text
.agents/skills/<skill-name>/
├── SKILL.md
├── scripts/      optional
├── references/   optional
└── assets/       optional
```

`SKILL.md` must contain YAML frontmatter with `name` and `description`, followed by Markdown instructions.

Compatibility directories such as `.claude/skills`, `.agent/skills`, and `.codex/skills` should point to `.agents/skills` so skills are maintained once and discovered by multiple agents.

When adding, removing, or updating project skills, change `.agents/skills/` only unless a tool-specific compatibility issue requires otherwise.

## Development Workflow

1. Inspect the existing component, route, or nearby CSS before editing.
2. Prefer existing project patterns over new abstractions.
3. Use the relevant skill when a task matches its `description`.
4. Run the project lint or the narrowest available check after code edits.
5. For visual UI work, inspect desktop and mobile when a local browser is available, and verify both light and dark themes when colors or surfaces change.
