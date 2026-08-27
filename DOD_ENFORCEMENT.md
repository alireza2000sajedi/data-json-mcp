# DoD Enforcement System — Multi-Layer Approach

## Problem
Agent بدون اجرای `check_definition_of_done` و `validate_province` گزارش نهایی می‌داد.
بند ۱۷ پرامپت الزام می‌کند: `complete: true` + `invalid: 0` قبل از گزارش نهایی.

## Solution: 3-Layer Enforcement

### Layer 1: Notes DoD Status (Always Visible)
**فایل: `src/types.ts`, `src/notes.ts`**

اضافه شدن `dodStatus` به NotesState:
```typescript
export interface DodStatus {
  lastCheck: string;       // ISO timestamp
  dodComplete: boolean;    // from check_definition_of_done
  validateInvalid: number; // from validate_province
  validateTotal: number;
  issues: string[];        // compact list (max 10)
}
```

نمایش در `notes.md`:
```markdown
## DoD
- ⊘ Never checked — run check_definition_of_done + validate_province
```
یا بعد از چک:
```markdown
## DoD
- ✓ PASSED (2026-08-27 10:32:32) — complete:true, invalid:0 — ready for final report
```

### Layer 2: Tool Reminders (Proactive Warnings)

**`get_next_research_node`** — وقتی `done: true`:
```json
{
  "done": true,
  "reminder": "All nodes complete! You MUST now run check_definition_of_done and validate_province...",
  "dodStatus": { "checked": true, "complete": false, "invalid": 3 }
}
```

**`list_pending_nodes`** — وقتی `pending: 0`:
```json
{
  "pending": 0,
  "reminder": "All nodes complete! You MUST now run check_definition_of_done...",
  "dodStatus": { "checked": false, "complete": false, "invalid": -1 }
}
```

**`update_notes` (mark_node_complete)** — وقتی آخرین node کامل می‌شه:
```json
{
  "updated": true,
  "operation": "mark_node_complete",
  "reminder": "All nodes complete! You MUST now run check_definition_of_done...",
  "dodStatus": { "checked": false, "complete": false, "invalid": -1 }
}
```

### Layer 3: Persistent DoD Tracking

**`check_definition_of_done`** — نتیجه رو در notes ذخیره می‌کنه:
```typescript
updateDodStatus(state, complete, state.dodStatus?.validateInvalid ?? -1, ...);
writeNotes(state);
return { complete, ..., reminder: "..." };
```

**`validate_province`** — نتیجه رو در notes ذخیره می‌کنه:
```typescript
updateDodStatus(state, state.dodStatus?.dodComplete ?? false, invalid.length, entities.length, issues);
writeNotes(state);
return { invalid: invalid.length, ..., reminder: "..." };
```

### Layer 4: MCP Tool Descriptions (Explicit Requirements)

**`src/server.ts`** — توضیحات آپدیت شده:
- `check_definition_of_done`: "MUST be run (returning complete:true) together with validate_province (returning invalid:0) before producing the final report."
- `validate_province`: "MUST be run (returning invalid:0) together with check_definition_of_done (returning complete:true) before producing the final report."
- `get_next_research_node`: "When done:true, returns a reminder to run DoD checks before final report."
- `list_pending_nodes`: "When pending:0, returns a reminder to run DoD checks before final report."

## Impact

1. **Agent هر بار notes رو می‌خونه، DoD status رو می‌بینه** — نمی‌تونه نادیده بگیره
2. **وقتی همه nodes تمام می‌شن، toolها reminder می‌دن** — agent مجبور می‌شه DoD چک کنه
3. **نتیجه DoD persist می‌شه** — حتی اگه session قطع بشه، status حفظ می‌شه
4. **Tool descriptions صریحاً می‌گن "MUST"** — agent نمی‌تونه بگه نمی‌دونستم

## Files Changed
- `src/types.ts` — DodStatus interface, dodStatus field in NotesState
- `src/notes.ts` — emptyState, normalizeState, compactStateForStorage, renderMarkdown, updateDodStatus, renderDodStatus
- `src/tools.ts` — toolCheckDefinitionOfDone, toolValidateProvince, toolGetNextResearchNode, toolListPendingNodes, update_notes (mark_node_complete)
- `src/server.ts` — tool descriptions
- `src/dataset.ts` — listEntities (exclude notes.state.json, notes.md)

## Test Results
- ✓ همه ۴۲ تست اصلی پاس شدن
- ✓ DoD status در notes persist می‌شه
- ✓ Tool reminders وقتی باید نشون داده می‌شن
- ✓ Backward compatibility با format قدیمی
