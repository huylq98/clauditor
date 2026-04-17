function fuzzyMatch(query, text) {
  if (!query) return true;
  const q = query.toLowerCase();
  const s = text.toLowerCase();
  let i = 0;
  for (const ch of s) {
    if (ch === q[i]) i++;
    if (i === q.length) return true;
  }
  return false;
}

function flattenTree({ children, expanded, query }) {
  const out = [];
  const visit = (parentPath, depth) => {
    const kids = children[parentPath] || [];
    for (const kid of kids) {
      const path = parentPath === '.' ? kid.name : `${parentPath}/${kid.name}`;
      if (kid.dir) {
        const isExpanded = expanded.has(path) || hasMatchingDescendant(path, children, query);
        if (isExpanded || !query || fuzzyMatch(query, path)) out.push({ ...kid, path, depth });
        if (isExpanded) visit(path, depth + 1);
      } else {
        if (!query || fuzzyMatch(query, path)) out.push({ ...kid, path, depth });
      }
    }
  };
  visit('.', 0);
  return out;
}

function hasMatchingDescendant(dirPath, children, query) {
  if (!query) return false;
  const stack = [dirPath];
  while (stack.length) {
    const cur = stack.pop();
    const kids = children[cur] || [];
    for (const k of kids) {
      const p = `${cur}/${k.name}`;
      if (fuzzyMatch(query, p)) return true;
      if (k.dir) stack.push(p);
    }
  }
  return false;
}

if (typeof module !== 'undefined' && module.exports) module.exports = { fuzzyMatch, flattenTree };
if (typeof window !== 'undefined') window.__clauditorTree = { fuzzyMatch, flattenTree };
