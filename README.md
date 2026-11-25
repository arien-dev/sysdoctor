# sysdoctor

`sysdoctor` is an open-source Linux diagnostic TUI for the question “Why is X
not working right now?”. It combines subsystem health, likely causes, safe
next steps, and the command evidence behind each finding.

```text
+-- sysdoctor 1.0.0 - workstation - Linux 6.x - LIVE 2s - WARN -----+
| SUBSYSTEMS       | FINDINGS & ROOT CAUSES                       |
| * services    0  | WARN  network - No default route              |
| ! audio       1  | The active interface may not have a gateway.  |
| * bluetooth  0  | Check: ip route; inspect interface state.      |
| ! network     1  +-----------------------------------------------+
| * storage     0  | EVIDENCE - ip route                           |
| * suspend     0  | (no default route found)                      |
| * gpu-display 0  | [Tab] Focus  [r] Scan  [e] Export  [q] Quit   |
| * memory-cpu  0  |                                               |
+------------------+-----------------------------------------------+
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
in a terminal. On the first interactive launch, a setup screen asks for
English or German and stores the choice in `$XDG_CONFIG_HOME/sysdoctor/`
(usually `~/.config/sysdoctor/settings.json`). Press `L` in the dashboard to
change it later. `--lang de` or `--lang en` sets and saves the language from
the command line. To use the just-built copy locally before publishing:

```sh
npm install
npm run build
npm link
syst
```

Requires Node.js 20 or newer. The TUI works best at 100×30 or larger; narrower
terminals switch to a compact stacked view. Root access is not required: probes
that are unavailable or denied are reported with their reason. Checks are
read-only; suggested steps are explicitly classified before users act.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `↑`/`↓`, `j`/`k` | Navigate the focused list |
| `Tab` / `Shift+Tab` | Change focus between subsystems, findings, inspector |
| `Enter` | Open full finding detail |
| `Esc` / `q` | Close detail / exit |
| `r` | Run all checks immediately |
| `Space` | Pause or resume automatic refresh |
| `e` | Export anonymized Markdown and JSON reports |
| `f` | Cycle severity filter: ALL, WARN+ERR, ERR |
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

The implementation uses only Node.js built-ins at runtime. Checks use an
injectable probe interface, so tests run on non-Linux hosts without touching
the host's actual services, network, or devices. Diagnostic output can include
system paths and log excerpts; review reports before sharing them.

## License

MIT. See [LICENSE](LICENSE).
