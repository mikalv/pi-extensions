# nmem extension glossary

Domain glossary for the `@cnife/pi-nmem` extension — nmem integration concepts. Project-wide terms live in the root [CONTEXT.md](../../CONTEXT.md).

## nmem integration

**nmem backend**:
Localhost REST service (default <http://127.0.0.1:14242>), single source of truth for memories / threads / context. Backend for the pi-nmem extension.
_Avoid_: nmem CLI (the CLI is a command-line client of the backend)

**nowledge-mem-pi**:
Existing pi plugin that pi-nmem replaces; composed of an extension (ambient sync + startup injection) and 5 skills (hard-coded raw `nmem --json` calls).
_Avoid_: nmem plugin (ambiguous)

**ambient sync**:
Extension automatically syncs a pi session into an nmem thread across the session lifecycle; the LLM does not participate.
_Avoid_: manual import

**Context Bundle**:
Startup context package from nmem backend `GET /context/bundle` — owner identity, agent identity, active space, rules, working memory. pi-nmem injects it on session_start.
_Avoid_: working memory (that is a sub-part)

**session start time**:
Timestamp of the session’s first message — an intrinsic property of the session. Time-based session splitting (e.g. workday windows) should use this; the first-message time from `nmem_read_thread` is this value.
_Avoid_: confusing with “import time”

**import time**:
Moment ambient sync first wrote the session into the nmem backend; later than session start time. Reflects “when it was ingested”, not “when the session happened”; `nmem_list_threads` list times are an approximation for coarse filtering only.
_Avoid_: using as session start time for precise splitting
