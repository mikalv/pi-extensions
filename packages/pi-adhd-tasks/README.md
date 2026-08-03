# pi-adhd-tasks

Markdown-first shared task system for Pi, tuned for ADHD-friendly flow.

## Core model

Two levels, two commands:

- `/todo` → session-level items
- `/task` → project-level items

Both the user and Pi should be able to:
- add items
- reorder items
- mark items done/undone
- move items between session and project
- edit text without breaking the format

## Storage

Canonical storage is markdown files:

- `.pi/tasks/project.md`
- `.pi/tasks/sessions/<session-id>.md`

Initial line format:

- `- [ ]` pending
- `- [*]` done

Canonical lines also carry a hidden stable id comment so manual reordering stays safe, e.g.:

- `- [ ] Port Codex login <!-- pi-task:project-a1b2c3d4 -->`

Priority is determined by order in the file.

## MVP

1. Read/write markdown task files
2. `/todo` command for the current session list
3. `/task` command for the shared project list
4. Shared widget showing both lists
5. Safe edits from both Pi and the user
6. Promote / demote between session and project
7. Gentle reminder injection nudging the agent to keep using todos/tasks during longer work

## Agent usage

This package also ships a skill so Pi is more likely to:
- capture reminders into `/todo`
- promote durable work into `/task`
- understand that only project tasks are shared across sessions

## Notes

This is intentionally not a direct 1:1 port of `pi-tasks`.
It borrows ideas from it, but the product is:

- markdown-first
- human-editable
- dual-level
- session-isolated for concurrent Pi sessions in the same repo
- lightweight enough for constant daily capture
