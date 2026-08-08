# /todo og /task — brukerveiledning

> Formål: raskt fange opp, følge og ferdigstille arbeid i løpet av en
> session eller i et prosjekt over tid.

## Forskjellen

| Kommando | Scope | Levde |
|---|---|---|
| `/todo` | **Session** — kun denne pi-sessionen | Når sessionen avsluttes |
| `/task` | **Project** — delt i repoet | Persistert i repoet |

Bruk `/todo` umiddelbar work-in-progress, avbrutte grep, "kom tilbake til dette".
Flytt til `/task` når arbeidet erverdighetsgrensen og andre også må se det.

## Snarvei

```
/todo <tekst>
/task <tekst>
```

Bare skriv teksten uten subkommando → det blir automatisk en `add`.

## Kommandoer

### List

```
/todo list
/task list
```

Viser alle oppgaver med id, status, rekkefølge og tekst.

### Add

```
/todo add Gjør X ferdig
/task add Skriv test for Y
```

Eller med snarvei:

```
/todo Gjør X ferdig
/task Skriv test for Y
```

### Done / Start / Undo

```
/todo done <id>
/task done <id>
/todo start <id>
/task start <id>
/todo undo <id>
/task undo <id>
```

- `done` → ferdig
- `start` → påbegynt (`in_progress`)
- `undo` → tilbake til ventende (`pending`)

### Edit

```
/todo edit <id> <ny tekst>
/task edit <id> <ny tekst>
```

Eksempel:

```
/todo edit session-1 Oppdater dokumentasjon for /todo
```

### Remove

```
/todo remove <id>
/task remove <id>
```

### Flytt mellom scope

```
/todo move <id> project
/task move <id> session
```

Brukes når et session-todo blir viktig nok til å leve videre i prosjektet,
eller når et prosjekt-task må gjøres umiddelbart i nåværende session.

### Reorder

```
/todo top <id>
/todo up <id>
/todo down <id>
/task top <id>
/task up <id>
/task down <id>
```

- `top` → flytt helt øverst
- `up` / `down` → flytt en plass opp eller ned

## ID-er

Oppgaver får automatisk genererte ID-er:

- Session: `session-1`, `session-2`, …
- Project: `project-1`, `project-2`, …

Du kan referere til en oppgave ved hjelp av disse ID-ene i alle kommandoer
som tar `<id>`.

## Filer på disk

Oppgaver lagres som Markdown-filer, så du kan redigere dem direkte hvis du vil:

- **Project:** `.pi/tasks/project.md`
- **Session:** `.pi/tasks/sessions/<sessionId>.md`

Format:

```markdown
- [ ] Oppgave tekst <!-- pi-task:session-1 -->
- [x] Ferdig oppgave <!-- pi-task:project-2 -->
```

Extensionen overvåker filene og synkroniserer automatisk hvis du redigerer
dem utenfor pi.

## Påminnelser

Extensionen injiserer automatisk en `<system-reminder>` i agentens system
prompt når:

- det finnes ventende session-todo
- det finnes ventende prosjekt-tasks og ingen session-todo
- todo-listen nettopp ble endret

Påminnelsene opptrer jevnlig, ikke ved hver eneste melding.

## Agent-verktøy

Agenter har tilgang til disse verktøyene direkte:

- `adhd_tasks_list` — hent nåværende todo-liste eller prosjekt-tasks
- `adhd_tasks_add` — legg til oppgave
- `adhd_tasks_update` — oppdater status, tekst, flytt, reorder eller fjern

## Eksempel flyt

```
/todo Skriv brukerhistorie for innlogging
/todo start session-1
/todo add Lag tilbakemelding til reviewer
/todo down session-2
/todo done session-1
/todo move session-3 project
/task list
```

## Tips

- Bruk `/todo` for alt du kan gjøre på under 5 minutter.
- Bruk `/task` for arbeid som må leve videre etter denne sessionen.
- Hvis du er i en session og ser `/todo`-listen er tom, men prosjektet har
  tasks, så kan extensionen automatisk vise deg prosjekt-tasks på nytt.
- Rediger filene i `.pi/tasks/` direkte hvis du vil strukturere med
  overskrifter eller gruppering — extensionen synkroniserer likevel.
