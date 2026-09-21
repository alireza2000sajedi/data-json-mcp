# Global Planro Taxonomy

Taxonomy is global and shared by every province and every Entity. Never create province-local taxonomy files under a province output folder.

Production Entity fields must contain **Global Taxonomy** canonical IDs only.

## Missing concept → Agent Taxonomy (parallel catalogs)

`taxonomy/agent-taxonomy/` is a full mirror of these catalogs. The agent behaves **exactly like taxonomy authoring**:

1. Look up `planro://taxonomy` (Global).
2. If the reusable concept is missing, research it and **create a real taxonomy item** in the matching file under `taxonomy/agent-taxonomy/` (same shape as Global — for categories: nested `children` + `context`).
3. Attach provenance in `source` (provinceId, nodeId, reason, proposedAt, urls).
4. Do **not** write that new id into a production Entity yet (schema / quality-gate only accept Global IDs).
5. At the **end of the province stage** (and again when a Scope adds more), report:
   - what was missing from Global Taxonomy
   - what was created under `taxonomy/agent-taxonomy/`

Human promotion later copies the item into the matching `taxonomy/*.json` (and schema enums when required). Until then, Agent Taxonomy stays staging-only.

See `agent-taxonomy/README.md` for the item contract.

## Catalogs

| File | Used by |
|---|---|
| `types.json` | `entity.type` |
| `subtypes.json` | `entity.subType` |
| `categories.json` | `entity.categories[]` (any node id in the tree) |
| `activities.json` | `entity.activities[]` |
| `features.json` | `entity.features[]` |
| `facilities.json` | `entity.facilities[]` |
| `risks.json` | `entity.safety.risks[]` |
| `checklist-items.json` | `entity.travelChecklist.{mode}[]` |

`travelChecklist` modes stay structural (`tour`, `personalCar`, `airplane`, `camping`, `train`, `bus`). Values inside each mode must be ids from Global `checklist-items.json`, never free-form Persian prose.

Each checklist item may list related theme ids in `categories[]` (ids from `categories.json`) so agents/UI know which destination or event themes that gear fits.

Checklist plan filters (on each item; `difficulty` is trip-only):

| Field | Values |
|---|---|
| `difficulty` | `easy` آسان · `moderate` متوسط · `challenging` چالش‌برانگیز |
| `group_type` | `solo` · `couple` · `friends` · `family` |
| `transportation` | `tour` · `personalCar` · `airplane` · `camping` · `train` · `bus` · `hitchhiking` · `none` |
| `accommodation` | `hotel` · `hostel` · `airbnb` · `camp` · `none` |

Canonical enum labels live under `checklist-items.json` → `enums`.

## Categories contract (`categories.json`)

Nested tree — no separate events folder:

```json
{
  "categories": [
    {
      "id": "sports",
      "label": "ورزش و تناسب",
      "description": "…",
      "context": ["trip", "location", "event"],
      "children": [
        {
          "id": "team_ball",
          "label": "ورزش‌های تیمی و توپی",
          "context": ["event"],
          "children": [
            { "id": "football", "label": "فوتبال", "context": ["event"], "children": [] }
          ]
        }
      ]
    }
  ]
}
```

- Top-level = دستهٔ اصلی (۹ تا: nature, heritage, lifestyle, sports, arts_culture, social, learning, entertainment, business)
- `children[]` = زیرمجموعه‌ها (چند لایه مجاز)
- هر نود: `id`, `label`, `description`, `context` (`trip` | `event` | `location`)
- `entity.categories[]` می‌تواند id هر سطح از درخت باشد
- **بدون `defaults`**

### قوانین `context` (سخت)

| context | معنی |
|---|---|
| `location` | تگ مکان / Entity جا |
| `trip` | تم سفر / برنامه مسیر |
| `event` | برنامه / رویداد میزبان |

- **فرزند ⊆ پرنت:** هر مقدار `context` فرزند باید در پرنت هم باشد؛ پرنت نمی‌تواند فاقد چیزی باشد که فرزند دارد.
- شاخه‌های **sports / social / business / entertainment** و همهٔ فرزندانشان → فقط `["event"]`
- شاخه‌های **nature / heritage / lifestyle** → فقط `["trip","location"]`
- زیر **arts_culture** و **learning**: ریشه همهٔ contextهای زیرشاخه را پوشش می‌دهد؛ `arts_crafts` و `education` → `["trip","location"]`؛ بقیهٔ زیرشاخهٔ رویداد → `["event"]`
