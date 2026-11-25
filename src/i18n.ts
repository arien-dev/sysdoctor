import type { Finding, Risk, Severity, SubsystemId } from './types.js';

export const languages = ['en', 'de'] as const;
export type Language = (typeof languages)[number];

export const languageNames: Record<Language, string> = {
  en: 'English',
  de: 'Deutsch',
};

const messages = {
  en: {
    app: 'SYSDOCTOR',
    loading: 'Collecting live diagnostics',
    host: 'HOST',
    os: 'SYSTEM',
    uptime: 'UPTIME',
    cpu: 'CPU LOAD',
    memory: 'MEMORY',
    health: 'HEALTH',
    findings: 'FINDINGS',
    subsystemPanel: 'SUBSYSTEMS',
    inspector: 'ROOT CAUSE / EVIDENCE',
    live: 'LIVE',
    paused: 'PAUSED',
    scan: 'SCAN',
    lastScan: 'LAST SCAN',
    filter: 'FILTER',
    all: 'ALL',
    warnError: 'WARN + ERROR',
    errorsOnly: 'ERROR ONLY',
    noFindings: 'No findings in this subsystem.',
    noEvidence: 'No raw evidence attached to this finding.',
    cause: 'LIKELY CAUSE',
    steps: 'NEXT STEPS',
    evidence: 'RAW EVIDENCE',
    details: 'FINDING DETAILS',
    help: 'KEYBOARD HELP',
    language: 'LANGUAGE',
    chooseLanguage: 'Choose your language',
    languagePrompt: 'Use Up/Down, then Enter to save.',
    languageSaved: 'Language preference saved.',
    scanRunning: 'Scanning all subsystems…',
    scanFinished: 'Scan complete',
    scanFailed: 'Scan failed',
    exportComplete: 'Anonymized reports saved',
    exportFailed: 'Report export failed',
    subsystemFocus: 'SUBSYSTEMS',
    findingFocus: 'FINDINGS',
    inspectorFocus: 'INSPECTOR',
    healthy: 'healthy',
    issueCount: '{count} finding(s)',
    noAction: 'No corrective action suggested.',
    quit: 'quit',
    rescan: 'rescan',
    focus: 'focus',
    open: 'details',
    pause: 'pause',
    export: 'export',
    filterKey: 'filter',
    helpKey: 'help',
    languageKey: 'language',
    selected: 'SELECTED',
    command: 'COMMAND',
    refreshIn: 'NEXT SCAN',
    minute: 'm',
    second: 's',
    statuses: {
      ok: 'OK',
      info: 'INFO',
      warn: 'WARN',
      error: 'ERROR',
    },
    risks: {
      'read-only': 'READ ONLY',
      reversible: 'REVERSIBLE',
      caution: 'CAUTION',
    },
    subsystems: {
      services: 'Services',
      audio: 'Audio',
      bluetooth: 'Bluetooth',
      network: 'Network',
      storage: 'Storage',
      suspend: 'Suspend',
      'gpu-display': 'GPU / Display',
      'memory-cpu': 'Memory / CPU',
    },
  },
  de: {
    app: 'SYSDOCTOR',
    loading: 'Live-Diagnosen werden gesammelt',
    host: 'HOST',
    os: 'SYSTEM',
    uptime: 'LAUFZEIT',
    cpu: 'CPU-LAST',
    memory: 'ARBEITSSPEICHER',
    health: 'STATUS',
    findings: 'BEFUNDE',
    subsystemPanel: 'TEILSYSTEME',
    inspector: 'URSACHE / EVIDENZ',
    live: 'LIVE',
    paused: 'PAUSIERT',
    scan: 'SCAN',
    lastScan: 'LETZTER SCAN',
    filter: 'FILTER',
    all: 'ALLE',
    warnError: 'WARN + FEHLER',
    errorsOnly: 'NUR FEHLER',
    noFindings: 'Keine Befunde in diesem Teilsystem.',
    noEvidence: 'Zu diesem Befund liegen keine Rohdaten vor.',
    cause: 'WAHRSCHEINLICHE URSACHE',
    steps: 'NÄCHSTE SCHRITTE',
    evidence: 'ROHDATEN',
    details: 'BEFUNDDETAILS',
    help: 'TASTATURKÜRZEL',
    language: 'SPRACHE',
    chooseLanguage: 'Sprache auswählen',
    languagePrompt: 'Mit ↑/↓ auswählen, mit Enter speichern.',
    languageSaved: 'Spracheinstellung gespeichert.',
    scanRunning: 'Alle Teilsysteme werden geprüft…',
    scanFinished: 'Scan abgeschlossen',
    scanFailed: 'Scan fehlgeschlagen',
    exportComplete: 'Anonymisierte Berichte gespeichert',
    exportFailed: 'Berichtexport fehlgeschlagen',
    subsystemFocus: 'TEILSYSTEME',
    findingFocus: 'BEFUNDE',
    inspectorFocus: 'INSPEKTOR',
    healthy: 'unauffällig',
    issueCount: '{count} Befund(e)',
    noAction: 'Keine Korrekturmaßnahme vorgeschlagen.',
    quit: 'beenden',
    rescan: 'neu scannen',
    focus: 'Fokus',
    open: 'Details',
    pause: 'pausieren',
    export: 'Export',
    filterKey: 'Filter',
    helpKey: 'Hilfe',
    languageKey: 'Sprache',
    selected: 'AUSGEWÄHLT',
    command: 'BEFEHL',
    refreshIn: 'NÄCHSTER SCAN',
    minute: 'm',
    second: 's',
    statuses: {
      ok: 'OK',
      info: 'INFO',
      warn: 'WARN',
      error: 'FEHLER',
    },
    risks: {
      'read-only': 'NUR LESEN',
      reversible: 'UMKEHRBAR',
      caution: 'VORSICHT',
    },
    subsystems: {
      services: 'Dienste',
      audio: 'Audio',
      bluetooth: 'Bluetooth',
      network: 'Netzwerk',
      storage: 'Speicher',
      suspend: 'Energiesparen',
      'gpu-display': 'Grafik / Anzeige',
      'memory-cpu': 'Speicher / CPU',
    },
  },
} as const;

export type MessageKey = Exclude<keyof typeof messages.en, 'statuses' | 'risks' | 'subsystems'>;

export function t(language: Language, key: MessageKey, variables: Record<string, string | number> = {}): string {
  let value: string = messages[language][key];
  for (const [name, replacement] of Object.entries(variables)) {
    value = value.replaceAll(`{${name}}`, String(replacement));
  }
  return value;
}

export function severityText(language: Language, severity: Severity): string {
  return messages[language].statuses[severity];
}

export function riskText(language: Language, risk: Risk): string {
  return messages[language].risks[risk];
}

export function subsystemText(language: Language, subsystem: SubsystemId): string {
  return messages[language].subsystems[subsystem];
}

const germanFindings: Record<string, { title: string; cause: string; steps: string[] }> = {
  'services-systemctl-missing': {
    title: 'systemctl ist nicht verfügbar',
    cause: 'Dieses System verwendet möglicherweise kein systemd; der Zustand der Dienste konnte daher nicht abgefragt werden.',
    steps: ['Verwende den von dieser Linux-Distribution bereitgestellten Dienstmanager.'],
  },
  'services-system-access': {
    title: 'Systemdienst-Details nicht verfügbar',
    cause: 'Der Zustand der Systemdienste konnte nicht abgefragt werden; Rechte oder ein nicht verfügbares systemd können die Ursache sein.',
    steps: ['Prüfe mit systemctl --failed, ob der Systemdienstmanager erreichbar ist.'],
  },
  'services-user-access': {
    title: 'Benutzerdienst-Details nicht verfügbar',
    cause: 'Der systemd-Benutzerdienstmanager ist in dieser Sitzung nicht erreichbar.',
    steps: ['Prüfe, ob eine systemd-Benutzersitzung aktiv ist.'],
  },
  'services-degraded': {
    title: 'System ist eingeschränkt',
    cause: 'Mindestens ein Systemdienst hat keinen fehlerfreien Zustand erreicht.',
    steps: ['Prüfe systemctl --failed und das Startprotokoll.'],
  },
  'services-healthy': {
    title: 'Keine fehlgeschlagenen Dienste gemeldet',
    cause: 'systemd meldet in den abgefragten Bereichen keine fehlgeschlagenen Einheiten.',
    steps: [],
  },
  'audio-no-server': {
    title: 'Kein Audioserver erkannt',
    cause: 'PipeWire oder PulseAudio ist für den aktuellen Benutzer nicht sichtbar; Anwendungen finden dadurch möglicherweise keinen Audioserver.',
    steps: ['Prüfe die Benutzerdienste PipeWire und WirePlumber.', 'Starte den Audiodienst nur, wenn er in dieser Sitzung erwartet wird.'],
  },
  'audio-control-unavailable': {
    title: 'Audio-Steuerung nicht erreichbar',
    cause: 'Sitzungsbus, Audioserver oder optionales Steuerungsprogramm konnte nicht erreicht werden.',
    steps: ['Prüfe, ob die Desktop-Benutzersitzung und der Audioserver laufen.'],
  },
  'audio-no-sinks': {
    title: 'Keine Audio-Ausgänge verfügbar',
    cause: 'Der Audioserver meldet keine Ausgabegeräte; Gerätesuche, Profil oder Serverstart können fehlgeschlagen sein.',
    steps: ['Vergleiche pactl-Ausgänge mit /proc/asound/cards und prüfe die Audio-Protokolle.'],
  },
  'audio-no-default-sink': {
    title: 'Kein Standardausgang ausgewählt',
    cause: 'Der Audioserver antwortet, aber Anwendungen haben möglicherweise kein Standard-Wiedergabegerät.',
    steps: ['Prüfe verfügbare Ausgänge und das Desktop-Audioprofil, bevor du ein Gerät auswählst.'],
  },
  'audio-journal-errors': {
    title: 'Audiofehler im Journal gefunden',
    cause: 'Der Audiostack hat kürzlich Fehler ausgegeben, die fehlende Geräte oder stumme Wiedergabe erklären können.',
    steps: ['Prüfe den Protokollkontext und das ausgewählte Ausgabegeräteprofil.'],
  },
  'audio-available': {
    title: 'Audiostack scheint verfügbar',
    cause: 'Ein Audioserver oder ALSA-Gerät ist sichtbar; passende aktuelle Fehler wurden nicht gefunden.',
    steps: [],
  },
  'bluetooth-rfkill-missing': {
    title: 'rfkill ist nicht verfügbar',
    cause: 'Der Funk-Blockierungsstatus konnte mit rfkill nicht abgefragt werden.',
    steps: ['Prüfe den Hardware-Funkschalter und den Bluetooth-Dienststatus.'],
  },
  'bluetoothctl-missing': {
    title: 'bluetoothctl ist nicht verfügbar',
    cause: 'Controller konnten nicht aufgelistet werden, weil die BlueZ-Kommandozeilenwerkzeuge fehlen.',
    steps: ['Prüfe, ob BlueZ installiert und der Bluetooth-Dienst verfügbar ist.'],
  },
  'bluetooth-service-inactive': {
    title: 'Bluetooth-Dienst ist nicht aktiv',
    cause: 'Ohne den Bluetooth-Daemon können Controller nicht verwaltet und Geräte nicht verbunden werden.',
    steps: ['Prüfe systemctl status bluetooth und die zugehörigen Journal-Einträge.', 'Starte den Dienst nur, wenn Bluetooth benötigt wird.'],
  },
  'bluetooth-radio-blocked': {
    title: 'Bluetooth-Funk ist blockiert',
    cause: 'Eine Software- oder Hardware-Sperre durch rfkill verhindert die Nutzung des Bluetooth-Funks.',
    steps: ['Unterscheide zwischen Software-Sperre und Hardware-Schalter.', 'Eine Software-Sperre nur bei Bedarf aufheben; eine Hardware-Sperre benötigt den physischen Schalter.'],
  },
  'bluetooth-no-controller': {
    title: 'Kein Bluetooth-Controller erkannt',
    cause: 'Adapter, Firmware oder Bluetooth-Dienst fehlen möglicherweise; auch eine Funk-Sperre ist möglich.',
    steps: ['Prüfe rfkill, Adapter, Firmwaremeldungen und den Bluetooth-Dienst.'],
  },
  'bluetooth-journal-errors': {
    title: 'Bluetooth-Fehler im Journal',
    cause: 'Adapterinitialisierung, Firmware oder Geräteauthentifizierung hat Fehler gemeldet.',
    steps: ['Prüfe Adaptermodell, Firmwarepaket und Kopplungsstatus des anderen Geräts.'],
  },
  'bluetooth-inspected': {
    title: 'Kein Bluetooth-Blocker erkannt',
    cause: 'Dienst, Funksperre, Controller und aktuelle Bluetooth-Protokolle wurden geprüft.',
    steps: [],
  },
  'network-ip-missing': {
    title: 'Netzwerkabfrage nicht verfügbar',
    cause: 'Interface- und Routingprüfung konnte nicht abgeschlossen werden, weil iproute2 fehlt oder der Befehl fehlschlug.',
    steps: ['Prüfe, ob iproute2 installiert ist, und untersuche anschließend Interfaces und Routen.'],
  },
  'network-no-gateway': {
    title: 'Keine Standardroute erkannt',
    cause: 'Ohne Standardroute erreichen Verbindungen außerhalb lokaler Netze kein Gateway.',
    steps: ['Prüfe ip -br addr und den Netzwerkmanager auf ein fehlendes Gateway oder getrenntes Interface.'],
  },
  'network-down-interfaces': {
    title: 'Netzwerk-Interface(s) nicht aktiv',
    cause: 'Ein getrenntes oder administrativ deaktiviertes Interface kann den Netzwerkausfall erklären.',
    steps: ['Prüfe Funk-/Kabelverbindung und Verbindungsstatus des Netzwerkmanagers.'],
  },
  'network-resolvectl-missing': {
    title: 'resolvectl ist nicht verfügbar',
    cause: 'Der Host verwendet möglicherweise nicht systemd-resolved; /etc/resolv.conf dient als Ersatzindikator.',
    steps: ['Prüfe Nameserver-Einträge und DNS-Konfiguration des aktiven Netzwerkmanagers.'],
  },
  'network-no-dns': {
    title: 'Kein DNS-Server konfiguriert',
    cause: 'Weder im Status von systemd-resolved noch in resolv.conf wurde eine Resolver-Adresse gefunden.',
    steps: ['Prüfe Verbindungsprofil und Resolver-Konfiguration.'],
  },
  'network-journal-errors': {
    title: 'Aktuelle Netzwerkdienst-Fehler',
    cause: 'Netzwerkkonfiguration, DHCP oder DNS hat kürzlich Fehler gemeldet.',
    steps: ['Prüfe Netzwerkmanager-Protokolle sowie aktuelle Lease- und Konfigurationsdaten.'],
  },
  'network-healthy': {
    title: 'Netzwerkkonfiguration vorhanden',
    cause: 'Standardroute und Resolver-Konfiguration wurden erkannt; passende aktuelle Dienstfehler fehlen.',
    steps: [],
  },
  'storage-df-missing': {
    title: 'Dateisystemabfrage unvollständig',
    cause: 'Speicherplatz oder Inode-Auslastung konnte nicht vollständig abgefragt werden, da ein df-Aufruf fehlschlug.',
    steps: ['Prüfe mit dem df-Werkzeug der Distribution die Dateisystemauslastung.'],
  },
  'storage-readonly-mounts': {
    title: 'Schreibgeschützte Mounts erkannt',
    cause: 'Ein unerwartet schreibgeschütztes Dateisystem verhindert Änderungen; Kernel- oder Dateisystemfehler können es umgestellt haben.',
    steps: ['Prüfe Kernelprotokolle und Dateisystemzustand vor jedem Remount.'],
  },
  'storage-io-errors': {
    title: 'Kernel meldet Speicher- oder Dateisystemfehler',
    cause: 'Gerätefehler oder Dateisystemschäden können schreibgeschützte Mounts und Datenverlust verursachen.',
    steps: ['Sichere noch lesbare Daten und prüfe Gerät sowie Dateisystem.', 'Reparaturwerkzeuge nicht auf einem eingehängten Dateisystem ausführen.'],
  },
  'storage-healthy': {
    title: 'Kein kritischer Speicherdruck erkannt',
    cause: 'Kapazitäts- und Inode-Auslastung liegen unter den Warnschwellen; passende E/A-Fehler fehlen.',
    steps: [],
  },
  'suspend-no-mode': {
    title: 'Kein aktiver Energiesparmodus angezeigt',
    cause: 'Der Kernel stellt keinen aktiven mem_sleep-Modus bereit; Firmware oder Plattform können Suspend einschränken.',
    steps: ['Prüfe Firmware-Energieoptionen und Kernelmeldungen zur Suspend-Unterstützung.'],
  },
  'suspend-journal-errors': {
    title: 'Aktuelle Suspend-/Resume-Fehler',
    cause: 'Gerätetreiber, Firmware-Wake-Quelle oder System-Hook kann den Schlafzustand blockieren oder unterbrechen.',
    steps: ['Ordne Zeitstempel dem fehlgeschlagenen Schlafversuch zu und identifiziere Gerät oder Treiber.'],
  },
  'suspend-inspected': {
    title: 'Suspend-Zustand geprüft',
    cause: 'Kernel-Schlafmodus und aktive ACPI-Wake-Quellen sind sichtbar; aktuelle Übergangsfehler wurden nicht gefunden.',
    steps: [],
  },
  'gpu-kernel-errors': {
    title: 'GPU- oder Anzeigetreiberfehler',
    cause: 'Modesetting-Fehler, GPU-Resets oder Treiberprobleme können schwarzen Bildschirm, Flackern oder fehlende Beschleunigung verursachen.',
    steps: ['Identifiziere GPU-Treiber und vergleiche die Protokollzeitpunkte mit dem Anzeigeproblem.'],
  },
  'gpu-no-device': {
    title: 'Kein Grafikgerät über lspci erkannt',
    cause: 'Gerät kann wegen Rechten, virtueller Maschine oder fehlendem PCI-Werkzeug nicht sichtbar sein.',
    steps: ['Prüfe Anzeigesitzung und verfügbare Anschlüsse unter /sys/class/drm.'],
  },
  'gpu-inspected': {
    title: 'Grafik und Anzeige geprüft',
    cause: 'Anzeigeumgebung und Kernelprotokolle wurden geprüft; aktuelle passende GPU-Fehler fehlen.',
    steps: [],
  },
  'memory-proc-unavailable': {
    title: 'Speicherkennzahlen nicht verfügbar',
    cause: 'Kernel-Speicherzähler konnten nicht aus /proc/meminfo gelesen werden.',
    steps: ['Führe die Diagnose unter Linux mit eingehängtem procfs aus.'],
  },
  'memory-critical': {
    title: 'Arbeitsspeicher fast ausgeschöpft',
    cause: 'Es ist nur wenig Speicher verfügbar; Zuweisungen können scheitern oder der OOM-Killer aktiv werden.',
    steps: ['Prüfe Speicherverbraucher und Speicherdruck, bevor du Prozesse stoppst.'],
  },
  'memory-high': {
    title: 'Hohe Arbeitsspeicherauslastung',
    cause: 'Wenig verfügbarer Speicher kann Rückgewinnungs-Stalls und langsame Anwendungen auslösen.',
    steps: ['Prüfe Speicherverbraucher sowie some/full-Werte des Memory-PSI.'],
  },
  'memory-oom': {
    title: 'Kernel-OOM-Ereignisse erkannt',
    cause: 'Der Kernel hat einen Prozess beendet, weil Speicher nicht schnell genug freigegeben werden konnte.',
    steps: ['Prüfe betroffenen Prozess, Speicherverbrauch und verfügbaren Arbeitsspeicher.'],
  },
  'cpu-pressure': {
    title: 'Hoher CPU-Druck',
    cause: 'Laufbereite Prozesse warten deutlich auf CPU-Zeit; das kann langsame Reaktionen erklären.',
    steps: ['Vergleiche Load Average und aktive CPU-Verbraucher mit der Zahl verfügbarer CPU-Kerne.'],
  },
  'memory-cpu-healthy': {
    title: 'Kein kritischer Speicher- oder CPU-Druck',
    cause: 'Verfügbarer Speicher, Druckkennzahlen und Kernelprotokolle zeigen keinen passenden kritischen Zustand.',
    steps: [],
  },
};

export function localizeFinding(finding: Finding, language: Language): Finding {
  if (language === 'en') return finding;
  const translation = germanFindings[finding.id]
    ?? (finding.id.startsWith('failed-')
      ? {
          title: `Dienst fehlgeschlagen: ${finding.component}`,
          cause: 'systemd meldet diesen Dienst als fehlgeschlagen. Häufige Ursachen sind ein Programmfehler, fehlende Abhängigkeiten, Berechtigungen oder Sandbox-Regeln.',
          steps: [`Prüfe systemctl status ${finding.component} und journalctl für diesen Dienst.`, `Starte ${finding.component} erst nach Klärung der Ursache neu.`],
        }
      : finding.id.startsWith('storage-space-') || finding.id.startsWith('storage-inode-')
        ? {
            title: finding.title.replace('usage is', 'Auslastung ist').replace('space', 'Speicherplatz').replace('inode', 'Inode'),
            cause: finding.cause.includes('nearly exhausted')
              ? 'Das Dateisystem ist fast voll; Schreibvorgänge, Protokolle oder Programmstarts können fehlschlagen.'
              : 'Die Dateisystemauslastung ist hoch und kann bald neue Schreibvorgänge verhindern.',
            steps: ['Prüfe das betroffene Dateisystem und finde den größten Verbraucher.', 'Daten erst nach Prüfung der Eigentümer und Löschbarkeit entfernen.'],
          }
        : undefined);
  if (!translation) return finding;
  const translatedSteps = translation.steps.map((text, index) => ({
    ...finding.steps[index] ?? { risk: 'read-only' as Risk, text },
    text,
  }));
  return {
    ...finding,
    title: translation.title,
    cause: translation.cause,
    steps: translatedSteps,
  };
}
