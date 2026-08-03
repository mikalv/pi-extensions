# pi-adhd-tasks

Use this whenever the user mentions todos, tasks, backlog, priorities, "remember this", "put this on the list", "later today", "we need to do X", or refers to previously captured work items.

## Core model

There are two task scopes:

- `/todo` = session-local capture
- `/task` = project-shared capture across sessions

Interpretation rules:

- Use **`/todo`** for small, immediate, session-scoped items, interruptions, follow-ups, quick reminders, and "later in this session" work.
- Use **`/task`** for bigger project work, backlog items, work meant to survive session boundaries, and anything another Pi session should also be able to discover.
- If the user references "the list" ambiguously and the item sounds durable/project-wide, prefer **`/task`**.
- If the user references a personal/immediate reminder, prefer **`/todo`**.

## Important visibility rule

- **Session todos are not shared across sessions.**
- **Project tasks are shared across sessions.**

So if continuity across sessions matters, store it as a **project task**.

## What to do proactively

When the user says things like:
- "remember this"
- "add this"
- "put this on the list"
- "later"
- "todo"
- "task"
- "backlog"
- "don't let me forget"

then prefer to use the ADHD task system instead of leaving the item only in free-form chat.

## Operational habits

- Check the relevant list before claiming nothing is tracked.
- When a new thread of work starts, consider capturing the next concrete step as a `/todo`.
- When a decision creates durable project work, add or update a `/task`.
- Reorder tasks when priority changes.
- Mark items done when completed.
- Move items from `/todo` to `/task` when they become durable project work.

## Commands and tools

Human commands:
- `/todo ...`
- `/task ...`

Tool usage for agent-side updates:
- `adhd_tasks_list`
- `adhd_tasks_add`
- `adhd_tasks_update`

## Preferred behavior

Bias toward actually maintaining the lists, not merely talking about them.
