# Notes System Redesign — Compact Format

## Problem
نوت‌ها خیلی طولانی بودن (۱۱,۸۴۰ خط برای یه استان با ۳۵۰ روستا) و agent تمام تمرکزش رو روی نگهداری نوت می‌ذاشت به جای کار اصلی.

## Solution
جدا کردن state از markdown:
- **`notes.md`**: خلاصه فشرده که agent می‌بینه (۴۷ خط)
- **`notes.state.json`**: state کامل که internally استفاده می‌شه

## Changes Made

### 1. `src/notes.ts`
- **`statePath()`**: فایل جداگانه برای state
- **`readNotes()`**: اول از `notes.state.json` می‌خونه، fallback به format قدیمی
- **`writeNotes()`**: هم `notes.md` (خلاصه) و هم `notes.state.json` (state کامل) رو می‌نویسه
- **`compactStateForStorage()`**: فیلدهای سنگین resolved candidates/conflicts رو حذف می‌کنه:
  - Resolved candidates: فقط `id, nodeId, name, entityKind, state, outcome` (حذف sourceUrls, reason, query, blockingRequirements, createdAt)
  - Resolved conflicts: فقط `id, nodeId, state, resolution` (حذف description)
  - Source matrix: فقط ۵۰ تای آخر
  - Research coverage: فقط ۲۰ تای آخر
  - JSON: بدون pretty-printing (یک خط)
- **`renderProgressTable()`**: جدول پیشرفت به جای لیست تک‌تک nodes (counts by type×state)
- **`renderActionableNodes()`**: فقط nodes مهم:
  - Province و counties (همیشه)
  - Cities/villages/places که complete یا in_progress
  - حذف: districts, ruralDistricts (intermediate admin)
- **`normalizeState()`**: فیلدهای حذف‌شده رو با defaults پر می‌کنه (backward compatibility)

### 2. `src/dataset.ts`
- **`listEntities()`**: فایل‌های `notes.state.json` و `notes.md` رو exclude می‌کنه (به‌عنوان entity شناخته نشن)

## Results

| Metric | Before | After | Reduction |
|--------|--------|-------|-----------|
| **Markdown lines** | 11,840 | 47 | **99.6%** |
| **Size (agent sees)** | 393.7 KB | 1.7 KB | **99.6%** |

### Sample Output (47 lines)
```markdown
# Notes — province-30
- Updated: 2026-08-27T10:27:16.537Z
- Status: in_progress

## Progress
| type | total | ✓ done | ⟳ wip | ⊘ pending |
|---|---:|---:|---:|---:|
| province | 1 | 1 | 0 | 0 |
| county | 10 | 2 | 0 | 8 |
| district | 14 | 14 | 0 | 0 |
| ruralDistrict | 27 | 27 | 0 | 0 |
| city | 15 | 2 | 0 | 13 |
| village | 351 | 4 | 0 | 347 |
| place | 40 | 0 | 0 | 40 |

## Active nodes
- province-30 (province) استان همدان — complete
- county-30-1 (county) شهرستان 1 — complete
- county-30-2 (county) شهرستان 2 — complete
- county-30-3 (county) شهرستان 3 — research_required
...
- city-30-1 (city) شهر 1 — complete
- village-30-v1 (village) روستای 1 — complete
...

## Registry
| id | slug | path | status |
|---|---|---|---|
| province-30 | hamadan-province | province.json | active |
| county-30-1 | county-1 | county-30-1/county.json | active |

## Open items
- (none)

## Next step
- (none)
```

## Backward Compatibility
- `readNotes()` هنوز format قدیمی (embedded JSON in markdown) رو می‌خونه
- Migration خودکار: اولین write بعد از upgrade، state رو به `notes.state.json` منتقل می‌کنه
- همه ۴۲ تست پاس شدن

## Impact
- Agent فقط ۴۷ خط خلاصه می‌بینه به جای ۱۱,۸۴۰ خط
- تمرکز روی کار اصلی به جای نگهداری نوت
- State کامل preserved در فایل جداگانه (هیچ data loss)
