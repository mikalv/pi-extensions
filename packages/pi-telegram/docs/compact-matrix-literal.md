# Compact Matrix Literal

> Status: Portable v1 standard implemented by the `pi-telegram` 0.35.0 release candidate.

Compact Matrix Literal (CML) is a bounded-depth text format for ordered key-value cells arranged as singleton or compact rows. It optimizes repeated interactive controls where JSON field names, quotes, and commas dominate the payload.

CML is transport-neutral. An embedding maps each decoded cell's `key` and `value` to its own domain. The `pi-telegram` profile maps `key` to button label and `value` to button prompt.

## Goals

- Encode common key-value matrices with minimal punctuation.
- Preserve ordered singleton and compact rows.
- Preserve non-structural Unicode text literally.
- Admit deterministic linear-time parsing without evaluation or recovery.
- Remain deterministic beside an existing JSON form.
- Fail closed on malformed or deeper structures.

## Non-Goals

- Replacing JSON for arbitrary objects, metadata, styles, or extensible schemas.
- Defining callback ownership, application state, rendering policy, or transport behavior.
- Recovering partial intent from malformed input.
- Defining one universal visual row-width limit for every renderer.

## Data Model

A decoded payload is an ordered non-empty list of non-empty rows:

```text
Cell = { key: string, value: string }
Rows = Cell[][]
```

A top-level cell normalizes to a singleton row. A nested row preserves its compact grouping.

A cell with one atom copies its key into its value:

```text
{7} == { key: "7", value: "7" }
```

A cell with two atoms separates key and value with one unescaped vertical bar:

```text
{🟥|2,5} == { key: "🟥", value: "2,5" }
```

## Grammar

The normative structural grammar is:

```text
payload  := cell | matrix
matrix   := "[" ws element (ws element)* ws "]"
element  := cell | row
row      := "[" ws cell (ws cell)* ws "]"
cell     := "{" atom "}"
          | "{" atom "|" atom "}"
atom     := atom-unit+
atom-unit := ordinary | "\\|" | "\\}" | "\\\\"
ws       := *(SP | HTAB | CR | LF)
```

`ordinary` is any printable Unicode scalar other than unescaped `|`, unescaped `}`, or `\`. No commas separate elements. A matrix and every nested row must contain at least one element. A row cannot contain another row.

Examples:

```text
{Continue}
{Open|/tmp}
[{Up|/}[{Prev|page-1}{Next|page-3}]{etc|/etc}]
[[{1}{2}{3}{4}{5}{6}{7}{8}]]
{A \| B|C:\\Games\}}
```

These normalize respectively to one copied singleton cell, one key-value singleton cell, a mixed singleton/compact matrix, one eight-cell row, and `{ key: "A | B", value: "C:\\Games}" }`.

## Atoms, Whitespace, And Escapes

Leading and trailing whitespace in each decoded key and value is trimmed. Internal ordinary spaces are preserved. CR, LF, HTAB, C0 controls, DEL, and C1 controls that remain inside an atom after trimming are invalid.

Only three escape sequences exist:

```text
\|  → literal |
\}  → literal }
\\  → literal \
```

Unknown escapes and a trailing backslash are invalid. No character is silently dropped.

Every other printable character is literal inside a cell, including:

```text
{ [ ] " : , / emoji and ordinary spaces
```

An opening `{` has no structural meaning after a cell has begun. Square brackets are structural only outside a cell. A second unescaped vertical bar is invalid. When multiline text or additional metadata is needed, the producer uses the embedding's JSON or other full-fidelity form.

## Width Policy

CML Core does not impose a visual row-width maximum. Width is a renderer and interaction-policy concern, not a property of the key-value matrix wire format.

An embedding may enforce a documented host limit. The `pi-telegram` parser does not add an artificial per-row width cap because Telegram Bot API does not document one and existing top-level matrices already admit host-bounded action counts. Its bundled Generated Control Surface Skill owns UX policy: five columns are the proven default for short position-bearing labels, six to eight may be used only when labels remain compact and readable, and wider surfaces should normally be regrouped.

## Parsing Contract

A conforming parser:

1. Consumes Unicode text without executing, interpolating, or evaluating it.
2. Parses exactly one `payload` and rejects trailing non-whitespace input.
3. Rejects empty atoms, empty matrices, empty rows, and nesting deeper than one row inside the top-level matrix.
4. Rejects missing, extra, crossed, or mismatched delimiters.
5. Rejects a second unescaped vertical bar in a cell.
6. Decodes only `\|`, `\}`, and `\\`; unknown or trailing escapes fail.
7. Trims atom boundaries, then rejects empty values and remaining control characters.
8. Returns no partial rows or cells after any failure.
9. Runs in linear time over a host-bounded payload and does not recurse beyond the fixed grammar depth.

Implementations may report diagnostics internally, but an invalid payload must not register or execute any action.

## JSON Coexistence

An embedding that already accepts JSON uses deterministic routing:

1. Attempt strict JSON parsing first for payloads beginning with `{` or `[`.
2. If JSON parsing succeeds, validate only against the embedding's JSON schema. A JSON shape failure must not fall back to CML.
3. If JSON parsing fails, attempt CML from the original source.
4. Accept CML only after complete grammar and embedding validation.

Valid JSON behavior therefore remains unchanged. A malformed JSON-looking source receives no tolerant recovery: it is accepted only when it independently forms a complete valid CML payload.

## `pi-telegram` Profile

For `telegram_button` and its exact `telegram_buttons` alias:

- `Cell.key` becomes the visible button label.
- `Cell.value` becomes the queued prompt.
- A top-level cell becomes one full-width inline-keyboard row.
- A nested row becomes one horizontal row.
- `{value}` is equivalent to JSON `{"value":"value"}`.
- `{label|prompt}` is equivalent to JSON `{"label":"label","prompt":"prompt"}`.
- JSON and double-quoted attributes remain the full-fidelity forms.
- `selected_style` and future metadata are not represented by CML v1.
- Invalid CML is stripped with its enclosing recognized action comment and registers no callbacks, matching existing fail-closed action behavior.

Example embedding:

```html
<!-- telegram_button [{⬆️ Up|/}[{⬅️|page-1}{➡️|page-3}]{📁 etc|/etc}] -->
```

The enclosing HTML-comment transport still owns its own delimiter boundary; content containing the comment terminator cannot reach the CML parser and must use another supported delivery representation.

## Conformance Classes

A conformance suite covers properties rather than incident-specific strings.

### Accepted

- Singular copied and key-value cells.
- Top-level singleton rows.
- Nested rows at widths one, five, and eight.
- Mixed singleton and compact rows.
- Unicode, punctuation, brackets, quotes, commas, colons, and internal spaces.
- Trimmed atom boundaries.
- Each defined escape sequence.
- Structural whitespace between tokens.
- Semantic equivalence with supported JSON cell forms.

### Rejected

- Empty payload, matrix, row, key, or value.
- Deeper nesting.
- Missing or mismatched delimiters.
- A second unescaped separator.
- Unknown or trailing escapes.
- Internal control characters.
- Commas between cells.
- Trailing garbage.
- JSON that parses but fails the JSON action schema.

Every rejected case proves zero callback registration.

## Versioning

This document defines CML v1. Compatible embeddings may impose documented host-level byte, cell-count, or width limits without changing the core grammar, but must preserve bounded-depth and fail-closed semantics.

Future versions must not assign new meaning to input rejected by a security or ownership boundary without an explicit version discriminator. Metadata fields, styles, and deeper structures require a revised standard rather than permissive v1 parsing.
