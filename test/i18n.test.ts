import { describe, expect, it } from 'vitest';
import { localizeFinding, severityText, t } from '../src/i18n.js';
import type { Finding } from '../src/types.js';

describe('interface localization', () => {
  it('provides complete localized dashboard chrome for German and English', () => {
    expect(t('de', 'chooseLanguage')).toBe('Sprache auswählen');
    expect(t('en', 'chooseLanguage')).toBe('Choose your language');
    expect(severityText('de', 'error')).toBe('FEHLER');
  });

  it('translates diagnostic cause, title, and safe next steps', () => {
    const finding: Finding = {
      id: 'network-no-gateway',
      severity: 'warn',
      component: 'routing',
      title: 'No default route detected',
      cause: 'Without a default route, traffic cannot reach the gateway.',
      evidence: ['ip route'],
      steps: [{ risk: 'read-only', text: 'Inspect the route table.' }],
    };
    const translated = localizeFinding(finding, 'de');
    expect(translated.title).toBe('Keine Standardroute erkannt');
    expect(translated.cause).toContain('Gateway');
    expect(translated.steps[0]?.text).toContain('ip -br addr');
    expect(localizeFinding(finding, 'en')).toBe(finding);
  });
});
