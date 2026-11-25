# Contributing

Contributions to `sysdoctor` are welcome. Keep diagnostics read-only, explain
why a condition can cause a problem, and give concrete follow-up steps with an
accurate risk label (`read-only`, `reversible`, or `caution`).

## Development setup

* Use Node.js 20 or newer.
* Run `npm install`, `npm run typecheck`, `npm test`, and `npm run build`.
* Add fixture-based tests for new check behavior. Do not make tests depend on
  the developer machine's Linux distribution, privileges, or installed tools.
* Keep English and German dashboard strings and diagnostic finding
  translations current when adding or changing user-visible text.

## Diagnostic and security requirements

* Invoke programs with the safe `execFile` command runner, never a shell
  command string.
* Bound command execution with the configured timeout and output limit.
* Treat missing tools and permission errors as normal diagnostic evidence.
* Never change system state automatically. Clearly identify any suggested
  action that changes configuration or services.
* Redact personal identifiers from exported reports and add tests for any
  changes to redaction behavior.
* Avoid including secrets or unbounded journal output in findings.

## Pull requests

Describe the user-visible diagnosis added or corrected, include test coverage,
and mention any platform assumptions. Keep changes focused and update the
README when CLI behavior changes.
