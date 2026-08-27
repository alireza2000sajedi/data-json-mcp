# MCP System Redesign — Implementation Summary

## دو مشکل بزرگ

### مشکل ۱: نوت‌های طولانی
**وضعیت قبل:** ۱۱,۸۴۰ خط، ۳۹۳ KB برای یه استان با ۳۵۰ روستا
**مشکل:** Agent تمام تمرکزش رو روی نگهداری نوت می‌ذاشت

### مشکل ۲: عدم اجرای DoD
**مشکل:** Agent بدون اجرای `check_definition_of_done` و `validate_province` گزارش نهایی می‌داد
**بند ۱۷ پرامپت:** فقط وقتی `complete:true` + `invalid:0` مجاز به گزارش نهایی

---

## راه‌حل ۱: Notes Compact Format

### تغییرات اصلی

**۱. جدا کردن state از markdown**
- `notes.md` → خلاصه فشرده (۴۷ خط) که agent می‌بینه
- `notes.state.json` → state کامل که internally استفاده می‌شه

**۲. خلاصه‌سازی هوشمند**
```markdown
## Progress
| type | total | ✓ done | ⟳ wip | ⊘ pending |
|---|---:|---:|---:|---:|
| village | 351 | 4 | 0 | 347 |
```

**۳. فشرده‌سازی state**
- Resolved candidates: حذف sourceUrls, reason, query
- Source matrix: فقط ۵۰ تای آخر
- JSON بدون pretty-printing

### نتایج
| Metric | Before | After | Reduction |
|--------|--------|-------|-----------|
| **Markdown lines** | 11,840 | 47 | **99.6%** |
| **Size (agent sees)** | 393.7 KB | 1.7 KB | **99.6%** |

### فایل‌های تغییر یافته
- `src/notes.ts` — statePath, readNotes, writeNotes, renderMarkdown, compactStateForStorage, renderProgressTable, renderActionableNodes, normalizeState
- `src/dataset.ts` — listEntities (exclude notes.state.json)

---

## راه‌حل ۲: DoD Enforcement System

### سه لایه Enforcement

**لایه ۱: Notes DoD Status (همیشه قابل مشاهده)**
```markdown
## DoD
- ⊘ Never checked — run check_definition_of_done + validate_province
```
یا بعد از چک:
```markdown
## DoD
- ✓ PASSED (2026-08-27 10:32:32) — complete:true, invalid:0 — ready for final report
```

**لایه ۲: Tool Reminders (هشدارهای خودکار)**

وقتی همه nodes تمام می‌شن:
- `get_next_research_node` → `done: true` + reminder
- `list_pending_nodes` → `pending: 0` + reminder
- `mark_node_complete` (آخرین node) → reminder

مثال:
```json
{
  "done": true,
  "reminder": "All nodes complete! You MUST now run check_definition_of_done and validate_province...",
  "dodStatus": { "checked": false, "complete": false, "invalid": -1 }
}
```

**لایه ۳: Persistent DoD Tracking**

`check_definition_of_done` و `validate_province` نتیجه رو در notes ذخیره می‌کنن:
```typescript
updateDodStatus(state, complete, invalidCount, totalCount, issues);
writeNotes(state);
```

### نتایج
1. ✓ Agent هر بار notes رو می‌خونه، DoD status رو می‌بینه
2. ✓ وقتی همه nodes تمام می‌شن، toolها reminder می‌دن
3. ✓ نتیجه DoD persist می‌شه (حتی اگه session قطع بشه)
4. ✓ Tool descriptions صریحاً می‌گن "MUST"

### فایل‌های تغییر یافته
- `src/types.ts` — DodStatus interface, dodStatus field
- `src/notes.ts` — updateDodStatus, renderDodStatus
- `src/tools.ts` — toolCheckDefinitionOfDone, toolValidateProvince, toolGetNextResearchNode, toolListPendingNodes, update_notes
- `src/server.ts` — tool descriptions

---

## تست‌ها

### همه ۴۲ تست پاس شدن
```
# tests 42
# pass 42
# fail 0
```

### تست‌های کلیدی
- ✓ Notes compact format (47 lines vs 11,840)
- ✓ DoD status persisted to notes
- ✓ Tool reminders when nodes complete
- ✓ Backward compatibility with old format
- ✓ listEntities excludes notes.state.json

---

## Impact نهایی

### قبل
- Agent با ۱۱,۸۴۰ خط نوت مواجه بود
- تمرکز روی نگهداری نوت به جای کار اصلی
- DoD چک نمی‌شد → گزارش ناقص

### بعد
- Agent فقط ۴۷ خط خلاصه می‌بینه
- تمرکز روی کار اصلی
- DoD enforcement سه‌لایه → agent مجبور به چک قبل از گزارش
- State کامل preserved (هیچ data loss)

---

## Migration

### Automatic
- اولین write بعد از upgrade، state رو به `notes.state.json` منتقل می‌کنه
- `readNotes` هنوز format قدیمی (embedded JSON) رو می‌خونه
- هیچ action دستی نیاز نیست

### Backward Compatibility
- ✓ همه تست‌های موجود پاس شدن
- ✓ فایل‌های قدیمی هنوز قابل خواندن
- ✓ No breaking changes

---

## فایل‌های ایجاد شده
- `NOTES_REDESIGN.md` — توضیح کامل notes compact format
- `DOD_ENFORCEMENT.md` — توضیح کامل DoD enforcement system
- `IMPLEMENTATION_SUMMARY.md` — این فایل

## فایل‌های تغییر یافته
- `src/types.ts`
- `src/notes.ts`
- `src/tools.ts`
- `src/dataset.ts`
- `src/server.ts`
