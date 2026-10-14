# Installed upstream design and game skills

The user requested existing internet-sourced skills. They are stored in this repository under `skills/`. Resolve these paths relative to the repository root. These are project-local files, not globally registered plugins. Upstream sources and pinned commits are recorded in `skills/SOURCES.json`. Skill contents and support files are preserved verbatim.

When a task matches a skill below, read its SKILL.md before applying it. Resolve references and scripts relative to that skill directory. Apply only relevant skills; installation itself does not invoke their design workflows. Existing user choices take precedence over skill defaults. Inspect support scripts before executing them.

- Frontend interface design: `skills/frontend-design/SKILL.md`.
- AI design taste / Taste Skill (upstream name: design-taste-frontend), intended for public web pages: `skills/taste-skill/SKILL.md`.
- Game development and platform routing: `skills/game-development/SKILL.md`.
- Mobile games including Android: `skills/game-development/mobile-games/SKILL.md`.
- Gameplay, progression, balancing: `skills/game-development/game-design/SKILL.md`.
- Game art direction, assets and animation: `skills/game-development/game-art/SKILL.md`.
- Mobile interface and touch design: `skills/mobile-design/SKILL.md`.
- Design systems, tokens and components: `skills/ui-design-system/SKILL.md`.
- Static artwork, posters, PNG/PDF composition: `skills/canvas-design/SKILL.md`.

Game development also includes the upstream 2D, 3D, audio, multiplayer, PC, web and VR/AR subskills. Read them when relevant.

# Project task tracking

Track current tasks, completion evidence, dependencies, and deferred work in `docs/roadmap.md`. Update the relevant task when starting and finishing implementation, and record new blockers or remaining work. Keep task IDs stable. Do not mark unverified work as complete or invent deadlines. Technical decisions remain in `docs/technical-decisions.md`.
