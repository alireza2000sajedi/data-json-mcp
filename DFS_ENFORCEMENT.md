# DFS Traversal Enforcement

## Problem
Agent داده‌های چند شاخه مختلف رو هم‌زمان وارد خروجی می‌کرد. مثلاً هم‌زمان روی County 1 و County 2 کار می‌کرد.

## Required Order (Strict DFS)
```
Province
  ├── Province Places
  └── County 1
        ├── District 1
        │     ├── RuralDistrict 1
        │     │     ├── Village 1 → Village 1 Places
        │     │     └── Village 2 → Village 2 Places
        │     └── City 1 → City 1 Places
        ├── City 2 → City 2 Places
        └── County 1 Places (AFTER all children)
```

**قانون:** هر Node باید کامل بشه (entity + discovery + candidates) و بعد به Node بعدی بره.

## Solution: 4-Layer Enforcement

### Layer 1: `mark_node_complete` — Hard Block
فقط نود فعلی (current required node) قابل تکمیل هست.

```
Error: DFS ORDER VIOLATION: Cannot mark 'county-4-2' complete — 
it is not the current required node. Current required node: 'county-4-1'.
```

### Layer 2: `get_next_research_node` — Explicit Instructions
```json
{
  "nodeId": "county-4-1",
  "currentBranch": "استان اصفهان(province) → شهرستان کاشان(county)",
  "dfsInstruction": "DFS ORDER: You MUST work on 'county-4-1' NOW. 
   Complete this node FULLY before moving to any other node."
}
```

### Layer 3: `notes.md` — Always Visible
```markdown
# Notes — province-4
- Current branch (DFS): استان اصفهان(province) → شهرستان کاشان(county)
```

### Layer 4: `save_active_entity` — Advisory Warning
```json
{
  "accepted": true,
  "dfsWarning": "DFS ADVISORY: You are saving entity for 'city-4-5' but 
   the current required node is 'county-4-1'. You can save entities for 
   discovered nodes, but you CANNOT mark them complete until 'county-4-1' 
   is fully done."
}
```

## Traversal Priority (siblingPriority)

| Parent | Children Order |
|--------|---------------|
| Province | places → camping → counties |
| County | districts → ruralDistricts → cities → villages → places → camping |
| District | ruralDistricts → cities → villages → places → camping |
| RuralDistrict | villages → places → camping |
| City | places → camping |
| Village | places → camping |

**نکته:** county-level places بعد از همه فرزندان اداری (cities, villages) میان.

## Files Changed
- `src/graph.ts` — `getCurrentBranch()`, `isOnCurrentBranch()`, `siblingPriority()` updated
- `src/tools.ts` — `mark_node_complete` enforcement, `get_next_research_node` branch + instructions, `save_active_entity` advisory
- `src/notes.ts` — `computeCurrentBranch()`, current branch in notes.md
- `prompt.txt` — strengthened DFS language, enforcement documentation

## Test Results
- ✅ All 42 tests pass
- ✅ DFS traversal order verified
- ✅ `mark_node_complete` blocks out-of-order completion
- ✅ `get_next_research_node` returns current branch
- ✅ `notes.md` shows current branch
