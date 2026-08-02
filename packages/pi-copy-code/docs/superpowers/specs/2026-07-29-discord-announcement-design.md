# Pi Discord Announcement Design

**Date:** 2026-07-29
**Project:** `Vangalle/pi-copy-code`
**Channel:** Pi Discord packages channel

## Goal

Introduce `pi-copy-code` to Pi users as a small, useful personal project rather than as an advertisement. The post should explain the workflow benefit quickly, provide a copyable installation command, and invite feedback without making exaggerated claims.

## Tone

- Natural, concise English
- Problem-first and personal
- Friendly rather than promotional
- No comparisons with competing tools
- No repeated posting or unsolicited mentions

## Final Post

```text
Hey! I often wanted a quicker way to copy code from Pi’s responses, so I made a small extension called pi-copy-code.

It adds a `/copy-code` command:

- One code block → copies it immediately
- Multiple code blocks → opens a selector
- `/copy-code 2` → copies a specific block directly
- Supports backtick and tilde fences, including interrupted responses

Install:

`pi install git:github.com/Vangalle/pi-copy-code`

Repo: https://github.com/Vangalle/pi-copy-code

It’s a small personal project, but I hope it saves others a few clicks too. Feedback and suggestions are very welcome!
```

## GIF Storyboard

Create a silent, automatically looping terminal GIF lasting 10–15 seconds:

1. Begin with a Pi conversation whose latest assistant response contains two fenced code blocks.
2. Enter `/copy-code`.
3. Show the code-block selector.
4. Select the second block.
5. Show the `Copied code block 2.` notification.
6. Run `!pbpaste` to display the copied content and confirm the result.

## Recording Requirements

- Terminal width: approximately 90–100 columns
- Font large enough to read in Discord without opening the attachment
- No API keys, personal usernames, private paths, or unrelated notifications
- Maximum duration: 15 seconds
- Target file size: below 5 MB
- Crop to the terminal content
- Let the final clipboard output remain visible briefly before the loop restarts

## Publishing Checklist

1. Verify the repository and installation command are publicly accessible.
2. Preview the message for formatting and link correctness.
3. Attach the GIF before posting.
4. Post once in the Pi Discord packages channel.
5. Respond politely to questions and disclose limitations when relevant.
6. Avoid reposting unless announcing a meaningful future release.

## Success Criteria

- A reader understands the extension within a few seconds.
- The installation command can be copied directly.
- The GIF visibly proves the selector and clipboard workflow.
- The post feels like a useful community contribution, not unsolicited marketing.
