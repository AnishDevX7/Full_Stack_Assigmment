/**
 * graphProcessor.js
 * Handles all graph/tree logic: validation, dedup, construction, cycle detection
 */

const EDGE_REGEX = /^[A-Z]->[A-Z]$/;

/**
 * Step 1 – Parse raw entries into valid edges, invalid entries, and duplicate edges.
 */
function parseEntries(rawData) {
  const validEdges = [];
  const invalidEntries = [];
  const duplicateEdges = [];
  const seenEdges = new Set();

  for (let entry of rawData) {
    const trimmed = (typeof entry === "string") ? entry.trim() : String(entry).trim();

    if (!EDGE_REGEX.test(trimmed)) {
      // self-loop A->A also fails regex since both chars same: catch explicitly
      if (/^[A-Z]->[A-Z]$/.test(trimmed) && trimmed[0] === trimmed[3]) {
        invalidEntries.push(entry);
        continue;
      }
      invalidEntries.push(entry);
      continue;
    }

    // self-loop check
    const [parent, child] = trimmed.split("->").map(s => s.trim());
    if (parent === child) {
      invalidEntries.push(entry);
      continue;
    }

    if (seenEdges.has(trimmed)) {
      // Only push to duplicates once per unique edge
      if (!duplicateEdges.includes(trimmed)) {
        duplicateEdges.push(trimmed);
      }
    } else {
      seenEdges.add(trimmed);
      validEdges.push({ parent, child, raw: trimmed });
    }
  }

  return { validEdges, invalidEntries, duplicateEdges };
}

/**
 * Step 2 – Build adjacency map respecting the "first parent wins" rule for multi-parent nodes.
 */
function buildAdjacency(validEdges) {
  const childParentMap = {};   // child -> first parent
  const parentChildMap = {};   // parent -> [children]
  const allNodes = new Set();

  for (const { parent, child } of validEdges) {
    allNodes.add(parent);
    allNodes.add(child);

    // Multi-parent: first-encountered parent wins
    if (child in childParentMap) continue;

    childParentMap[child] = parent;

    if (!parentChildMap[parent]) parentChildMap[parent] = [];
    parentChildMap[parent].push(child);
  }

  return { childParentMap, parentChildMap, allNodes };
}

/**
 * Step 3 – Identify connected groups using Union-Find, then determine root for each group.
 */
function groupNodes(allNodes, childParentMap, parentChildMap) {
  const parent = {};
  const find = (x) => {
    if (parent[x] === undefined) parent[x] = x;
    if (parent[x] !== x) parent[x] = find(parent[x]);
    return parent[x];
  };
  const union = (a, b) => {
    parent[find(a)] = find(b);
  };

  for (const node of allNodes) find(node);

  // Union nodes connected by accepted edges
  for (const [child, par] of Object.entries(childParentMap)) {
    union(child, par);
  }

  // Group by representative
  const groups = {};
  for (const node of allNodes) {
    const rep = find(node);
    if (!groups[rep]) groups[rep] = new Set();
    groups[rep].add(node);
  }

  return groups;
}

/**
 * Step 4 – Detect cycles using DFS within a group.
 */
function hasCycleInGroup(nodes, parentChildMap) {
  const visited = new Set();
  const stack = new Set();

  const dfs = (node) => {
    visited.add(node);
    stack.add(node);
    for (const child of (parentChildMap[node] || [])) {
      if (!nodes.has(child)) continue;
      if (!visited.has(child)) {
        if (dfs(child)) return true;
      } else if (stack.has(child)) {
        return true;
      }
    }
    stack.delete(node);
    return false;
  };

  for (const node of nodes) {
    if (!visited.has(node)) {
      if (dfs(node)) return true;
    }
  }
  return false;
}

/**
 * Step 5 – Build nested tree object recursively.
 */
function buildTree(node, parentChildMap, visited = new Set()) {
  const result = {};
  if (visited.has(node)) return result;
  visited.add(node);

  const children = (parentChildMap[node] || []).sort();
  for (const child of children) {
    result[child] = buildTree(child, parentChildMap, visited);
  }
  return result;
}

/**
 * Step 6 – Calculate depth (longest root-to-leaf node count).
 */
function calcDepth(node, parentChildMap, memo = {}) {
  if (node in memo) return memo[node];
  const children = parentChildMap[node] || [];
  if (children.length === 0) {
    memo[node] = 1;
    return 1;
  }
  const maxChild = Math.max(...children.map(c => calcDepth(c, parentChildMap, memo)));
  memo[node] = 1 + maxChild;
  return memo[node];
}

/**
 * Main processor – orchestrates all steps and builds final response fields.
 */
function processData(rawData) {
  const { validEdges, invalidEntries, duplicateEdges } = parseEntries(rawData);
  const { childParentMap, parentChildMap, allNodes } = buildAdjacency(validEdges);
  const groups = groupNodes(allNodes, childParentMap, parentChildMap);

  const hierarchies = [];

  for (const groupSet of Object.values(groups)) {
    const cyclic = hasCycleInGroup(groupSet, parentChildMap);

    // Find root: node in group that is never a child
    let roots = [...groupSet].filter(n => !(n in childParentMap));

    let root;
    if (roots.length > 0) {
      roots.sort();
      root = roots[0];
    } else {
      // Pure cycle — use lex smallest
      const sorted = [...groupSet].sort();
      root = sorted[0];
    }

    if (cyclic) {
      hierarchies.push({ root, tree: {}, has_cycle: true });
    } else {
      const tree = { [root]: buildTree(root, parentChildMap) };
      const depth = calcDepth(root, parentChildMap);
      hierarchies.push({ root, tree, depth });
    }
  }

  // Sort hierarchies by root lex order for consistent output
  hierarchies.sort((a, b) => a.root.localeCompare(b.root));

  // Summary
  const nonCyclic = hierarchies.filter(h => !h.has_cycle);
  const cycleCount = hierarchies.filter(h => h.has_cycle).length;

  let largestRoot = "";
  if (nonCyclic.length > 0) {
    const maxDepth = Math.max(...nonCyclic.map(h => h.depth));
    const candidates = nonCyclic.filter(h => h.depth === maxDepth).map(h => h.root).sort();
    largestRoot = candidates[0];
  }

  const summary = {
    total_trees: nonCyclic.length,
    total_cycles: cycleCount,
    largest_tree_root: largestRoot,
  };

  return { hierarchies, invalidEntries, duplicateEdges, summary };
}

module.exports = { processData };