---
name: hakureinoyume-maintenance
description: Maintain the Hakurei no Yume repository knowledge base. Use before any Git remote synchronization for this repo, including push, creating or updating a pull request, or any user-requested remote sync; use when the user asks to update project docs, knowledge, architecture notes, maintenance notes, or this skill; use after changes that affect architecture, features, APIs, deployment, environment variables, public components, theme behavior, or asset paths when preparing to sync those changes remotely.
---

# Hakureinoyume Maintenance

## Overview

Keep repository knowledge current before changes leave the local workspace. This skill does not replace code inspection; it tells the agent which project documents to read and update before remote sync.

## Required Workflow

1. Read `docs/README.md`.
2. Read `docs/knowledge-maintenance.md`.
3. Inspect the pending changes with `git status --short` and, when useful, `git diff --stat` plus targeted diffs.
4. Map the change to the affected knowledge area:
   - Routes, layouts, components, theme, or assets: update architecture and feature docs as needed.
   - API routes, authentication, storage, or environment variables: update architecture, operations, and ADRs as needed.
   - Build, deployment, service, Caddy, or scripts: update operations docs and ADRs as needed.
   - Documentation or skill behavior: update the relevant docs and this skill if the trigger or workflow changes.
5. If the change makes or reverses a long-lived technical decision, add or update an ADR in `docs/decisions/`.
6. Re-check that `docs/README.md` still points to the most useful entry points.
7. Continue with the remote sync only after the knowledge base is current or after explicitly reporting why no update is needed.

## Documentation Boundaries

- Keep project facts in `docs/`, not in this skill.
- Keep this skill short and procedural.
- Do not duplicate detailed architecture, endpoint, or deployment descriptions here.
- Prefer updating existing docs over creating new files unless a new knowledge category is genuinely needed.
- Do not create README, changelog, or installation notes inside the skill directory.

## Remote Sync Gate

Before `git push`, pull request creation, or any equivalent remote synchronization, state one of:

- "Knowledge base updated", with the files changed.
- "No knowledge update needed", with the reason.
- "Knowledge update blocked", with the missing information.

If documentation is updated, run the relevant lightweight validation available for the change. For this skill, run the skill-creator validator when the skill structure or `SKILL.md` changes.
