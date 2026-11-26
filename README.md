# sysdoctor

`sysdoctor` is an open-source Linux diagnostic TUI built by arien-dev for the question “Why is X
not working right now?”. It combines subsystem health, likely causes, safe
next steps, and the command evidence behind each finding.

```text
+-- SYSDOCTOR 1.0.0 · workstation · Linux 6.x --------------------+
| SYSTEM STATUS: WARN · LIVE 2s · LAST SCAN: 12:34 · VIEW: EASY  |
|                                                                  |
| SYSTEM OVERVIEW                                                  |
| 1 area needs attention. Select it to see why.                   |
|                                                                  |
| CHECKED AREAS                                                    |
| › ▲ Network             1 finding                                |
|   ● Services            healthy                                  |
|   ● Audio               healthy                                  |
|   ● Bluetooth           healthy                                  |
|   ● Storage             healthy                                  |
|   ● Suspend             healthy                                  |
|   ● GPU / Display       healthy                                  |
|   ● Memory / CPU        healthy                                  |
|                                                                  |
| CPU LOAD: 0.42 / 8 · MEMORY: 33% · UPTIME: 2h 10m               |
| ↑↓ choose an area · Enter details · r rescan · q quit            |
| Space pause · m mode · L language · ? help                       |
+------------------------------------------------------------------+
```

## Install and run

```sh
npx linux-sysdoctor
npm install -g linux-sysdoctor
sysdoctor
syst
sysdoctor --no-tui
sysdoctor --json --redact
sysdoctor --lang de
sysdoctor report --redact
```

`sysdoctor` and its short alias `syst` both open the interactive TUI when run
in a terminal. First-run setup asks for a language, then a display mode:
**Easy** shows a plain-language cause and one suggested next step; **Advanced**
also shows all steps and raw command evidence. Both modes run the same checks.
Use `m` in the dashboard to switch modes later. Preferences are stored in
`$XDG_CONFIG_HOME/sysdoctor/settings.json` (usually
`~/.config/sysdoctor/settings.json`). Press `L` to change the language later.
`--lang de` or `--lang en` sets and saves the language from the command line.
To use the just-built copy locally before publishing:

```sh
npm install
npm run build
npm link
syst
```

Requires Node.js 20 or newer. The TUI works best at 80×24 or larger; long
diagnostic text wraps in the details view. Root access is not required: probes
that are unavailable or denied are reported with their reason. Checks are
read-only; suggested steps are explicitly classified before users act.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `↑`/`↓`, `j`/`k` | Select an area or finding |
| `Enter` | Open area details / full finding details |
| `Esc` | Return to overview or close dialog |
| `q` / `Ctrl+C` | Exit |
| `r` | Run all checks immediately |
| `Space` | Pause or resume automatic refresh |
| `e` | Export anonymized Markdown and JSON reports |
| `f` | Cycle severity filter in details: ALL, WARN+ERR, ERR |
| `[` / `]` | Change evidence source in Advanced details |
| `Page Up` / `Page Down` | Scroll long details |
| `m` | Switch Easy / Advanced display mode |
| `L` | Change interface language (English / Deutsch) |
| `?` / `h` | Show help |

`Ctrl+C` exits and restores the terminal. `SIGTERM`, resize, and unexpected
exceptions also restore the cursor and alternate screen.

## CLI

```text
sysdoctor [--no-tui] [--json] [--redact] [--interval <ms>]
          [--timeout <ms>] [--lang <de|en>] [--no-color] [--help] [--version]
sysdoctor report [--redact]
```

`--interval` controls live refresh (default 2000 ms; minimum 500 ms),
`--timeout` sets the per-command timeout (default 3000 ms), `--no-color`
disables ANSI colors, and `--redact` anonymizes report output. Export from the
TUI is anonymized by default. JSON output is designed for scripts; `report`
writes timestamped `.md` and `.json` files in the current directory.

## Development

```sh
make help
make install
make typecheck
make test
make build
make run
make run-headless
make pack-dry
```

## npm releases

The GitHub Actions release workflow publishes on version tags. For the one-time
setup and npm Trusted Publisher configuration, see
[docs/NPM_RELEASE.md](docs/NPM_RELEASE.md). Releases after the initial package
creation use GitHub Actions OIDC and do not need an npm token secret.

The implementation uses only Node.js built-ins at runtime. Checks use an
injectable probe interface, so tests run on non-Linux hosts without touching
the host's actual services, network, or devices. Diagnostic output can include
system paths and log excerpts; review reports before sharing them.

## License

MIT. See [LICENSE](LICENSE).
