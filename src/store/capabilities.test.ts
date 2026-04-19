import { describe, it, expect, beforeEach } from 'vitest';
import { useCapabilitiesStore } from './capabilities';
import type { CapabilitiesSnapshot } from '@/lib/bindings';

const snapshot: CapabilitiesSnapshot = {
  items: [
    {
      id: '1',
      kind: 'skill',
      name: 'frontend-design',
      description: 'Build UIs.',
      whenToUse: 'when building components',
      source: { type: 'plugin', marketplace: 'm', plugin: 'p', version: '1' },
      invocation: '/frontend-design',
    },
    {
      id: '2',
      kind: 'mcpserver',
      name: 'context7',
      description: 'Library docs.',
      whenToUse: null,
      source: { type: 'settings', file: 's.json' },
      invocation: '@context7',
    },
    {
      id: '3',
      kind: 'subagent',
      name: 'reviewer',
      description: 'Review code.',
      whenToUse: null,
      source: { type: 'user', dir: 'd' },
      invocation: 'Use the reviewer agent...',
    },
  ],
  scannedAt: 0,
  parseWarnings: ['warn-1'],
};

describe('capabilities store', () => {
  beforeEach(() => {
    useCapabilitiesStore.setState({
      open: false,
      snapshot: null,
      loading: false,
      error: null,
      query: '',
      kindFilter: new Set(['skill', 'subagent', 'mcpserver', 'slashcommand']),
    });
  });

  it('returns all items when query and filter are unset', () => {
    useCapabilitiesStore.setState({ snapshot });
    expect(useCapabilitiesStore.getState().filtered().length).toBe(3);
  });

  it('filters by query against name, description, whenToUse', () => {
    useCapabilitiesStore.setState({ snapshot, query: 'docs' });
    const items = useCapabilitiesStore.getState().filtered();
    expect(items.length).toBe(1);
    expect(items[0].name).toBe('context7');
  });

  it('filters by kind', () => {
    useCapabilitiesStore.setState({ snapshot, kindFilter: new Set(['skill']) });
    const items = useCapabilitiesStore.getState().filtered();
    expect(items.length).toBe(1);
    expect(items[0].kind).toBe('skill');
  });

  it('combines query and kind filter', () => {
    useCapabilitiesStore.setState({ snapshot, query: 'review', kindFilter: new Set(['subagent']) });
    const items = useCapabilitiesStore.getState().filtered();
    expect(items.length).toBe(1);
    expect(items[0].name).toBe('reviewer');
  });

  it('exposes warnings count', () => {
    useCapabilitiesStore.setState({ snapshot });
    expect(useCapabilitiesStore.getState().warningsCount()).toBe(1);
  });
});
