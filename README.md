# pi-extensions

Personal extensions for the [Pi coding agent](https://github.com/badlogic/pi-mono).

## Extensions

| Extension | Description |
|-----------|-------------|
| [/readfiles](files-widget/) | In-terminal file browser and viewer widget. Navigate files, view diffs, select code, send comments to agent - without leaving Pi, and without interrupting your agent |
| [tab-status](tab-status/) | Manage as many parallel sessions as your mind can handle. Terminal tab indicators for <br>✅ done / 🚧 stuck / 🛑 timed out |
| [agent-guidance](agent-guidance/) | Switch between Claude/Codex/Gemini with model-specific guidance (CLAUDE.md, CODEX.md, GEMINI.md) |
| [/usage](usage-extension/) | 📊 Usage statistics dashboard. See cost, tokens, and messages by provider/model across Today, This Week, Last Week, and All Time — with a compact view for narrow terminals |
| [/paste](raw-paste/) | Paste editable text, not [paste #1 +21 lines]. Running `/paste` with optional keybinding |
| [/code](code-actions/) | Pick code blocks or inline snippets from assistant messages to copy, insert, or run with `/code` |
| [session-recap](session-recap/) | While-you-were-away recap above the editor when you return to a session. Keeps you in flow while multi-clauding |

## Agent Skills

| Agent Skill | Description |
|-------------|-------------|
| [extending-pi](extending-pi/) | Guide for extending Pi — decide between Agent Skills, extensions, prompt templates, themes, models/providers, or packages. |
| ↳ [skill-creator](extending-pi/skill-creator/) | Detailed guidance for creating Agent Skills. |

## Install (pi package manager)

```bash
pi install git:github.com/mikalv/pi-extensions
```

To enable only a subset, replace the package entry in `~/.pi/agent/settings.json` with a filtered one:

```json
{
  "packages": [
    {
      "source": "git:github.com/mikalv/pi-extensions",
      "extensions": ["extensions/files-widget/index.ts"]
    }
  ]
}
```

## Quick Setup

If you keep a local clone, add extensions to your `~/.pi/agent/settings.json`:

```json
{
  "extensions": [
    "~/pi-extensions/extensions/files-widget",
    "~/pi-extensions/extensions/tab-status/tab-status.ts",
    "~/pi-extensions/extensions/agent-guidance/agent-guidance.ts",
    "~/pi-extensions/extensions/raw-paste",
    "~/pi-extensions/extensions/code-actions",
    "~/pi-extensions/extensions/session-recap",
    "~/pi-extensions/extensions/usage-extension"
  ]
}
```

For agent-guidance, also run the setup script:
```bash
cd ~/pi-extensions/extensions/agent-guidance && ./setup.sh
```

See each extension's README for details.
