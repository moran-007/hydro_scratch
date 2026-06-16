import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PLUGIN_CONFIG,
  normalizeEnabledDomains,
  pluginEnabledForDomain,
  pluginEnabledForHandlerDomain,
} from '../src/config';

describe('Scratch plugin domain scope', () => {
  it('keeps all domains enabled when enabledDomains is empty', () => {
    expect(pluginEnabledForDomain(DEFAULT_PLUGIN_CONFIG, 'system')).toBe(true);
    expect(pluginEnabledForDomain(DEFAULT_PLUGIN_CONFIG, 'scratch')).toBe(true);
  });

  it('normalizes configured domain IDs and enables only matching domains', () => {
    const enabledDomains = normalizeEnabledDomains([' Scratch ', 'scratch', 'CLASSROOM', '']);
    const config = { ...DEFAULT_PLUGIN_CONFIG, enabledDomains };

    expect(enabledDomains).toEqual(['scratch', 'classroom']);
    expect(pluginEnabledForDomain(config, 'scratch')).toBe(true);
    expect(pluginEnabledForDomain(config, 'SCRATCH')).toBe(true);
    expect(pluginEnabledForDomain(config, 'system')).toBe(false);
  });

  it('accepts comma or newline separated values during normalization', () => {
    expect(normalizeEnabledDomains('scratch, classroom\ntraining')).toEqual([
      'scratch',
      'classroom',
      'training',
    ]);
  });

  it('uses Hydro UiContext domainId when checking injected UI entries', () => {
    const config = { ...DEFAULT_PLUGIN_CONFIG, enabledDomains: ['scratch'] };

    expect(pluginEnabledForHandlerDomain(config, { UiContext: { domainId: 'scratch' } })).toBe(true);
    expect(pluginEnabledForHandlerDomain(config, { UiContext: { domainId: 'system' } })).toBe(false);
  });
});
