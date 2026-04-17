const { test, expect } = require('@playwright/test');
const { fuzzyMatch, flattenTree } = require('../../src/renderer/components/tree.js');

test('fuzzyMatch: exact substring matches', () => {
  expect(fuzzyMatch('routes', 'src/routes.js')).toBe(true);
  expect(fuzzyMatch('rts', 'src/routes.js')).toBe(true); // in-order letters
  expect(fuzzyMatch('xyz', 'src/routes.js')).toBe(false);
});

test('fuzzyMatch: empty query matches everything', () => {
  expect(fuzzyMatch('', 'anything.js')).toBe(true);
});

test('fuzzyMatch: case-insensitive', () => {
  expect(fuzzyMatch('ROUTES', 'src/routes.js')).toBe(true);
});

test('flattenTree: expanded dir children follow parent', () => {
  const nodes = {
    '.': [{ name: 'src', dir: true }, { name: 'pkg.json', dir: false }],
    'src': [{ name: 'app.js', dir: false }],
  };
  const list = flattenTree({ children: nodes, expanded: new Set(['src']), query: '' });
  expect(list.map((n) => n.path)).toEqual(['src', 'src/app.js', 'pkg.json']);
});

test('flattenTree: collapsed dir hides children', () => {
  const nodes = {
    '.': [{ name: 'src', dir: true }],
    'src': [{ name: 'app.js', dir: false }],
  };
  const list = flattenTree({ children: nodes, expanded: new Set(), query: '' });
  expect(list.map((n) => n.path)).toEqual(['src']);
});

test('flattenTree: query auto-expands ancestors of matching files', () => {
  const nodes = {
    '.': [{ name: 'src', dir: true }, { name: 'README.md', dir: false }],
    'src': [{ name: 'app.js', dir: false }, { name: 'util.js', dir: false }],
  };
  const list = flattenTree({ children: nodes, expanded: new Set(), query: 'util' });
  expect(list.map((n) => n.path)).toEqual(['src', 'src/util.js']);
});
