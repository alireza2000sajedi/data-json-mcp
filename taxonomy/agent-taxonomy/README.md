# Agent Taxonomy

This folder is a **full parallel taxonomy** with the same catalogs and item shape as `taxonomy/*.json`.

When Global Taxonomy is missing a reusable concept, the agent:

1. Researches it (real sources / observed need on a node).
2. Creates a proper taxonomy item here — same fields as production (`id`, `label`, plus `appliesTo` / `group` when relevant).
3. Attaches provenance under `source` (province, node, reason, dates, URLs).
4. Does **not** put the new id into a production Entity until a human promotes the item into `taxonomy/*.json`.
5. At end of province (and Scope if new items appeared), reports what was missing and what was added here.

## Catalogs (mirrors Global Taxonomy)

| File | Same role as |
|---|---|
| `types.json` | `taxonomy/types.json` |
| `subtypes.json` | `taxonomy/subtypes.json` |
| `categories.json` | `taxonomy/categories.json` |
| `activities.json` | `taxonomy/activities.json` |
| `features.json` | `taxonomy/features.json` |
| `facilities.json` | `taxonomy/facilities.json` |
| `risks.json` | `taxonomy/risks.json` |
| `checklist-items.json` | `taxonomy/checklist-items.json` |

## Item shape

Same as Global Taxonomy, plus required provenance for agent-created rows:

```json
{
  "id": "snake_case_id",
  "label": "برچسب فارسی",
  "appliesTo": ["natural"],
  "group": "general",
  "source": {
    "provinceId": "province-30",
    "nodeId": "county-30-1",
    "reason": "why this reusable concept is needed",
    "proposedAt": "2026-09-05",
    "urls": ["https://example.com/..."]
  }
}
```

Rules:

- `id` must be lowercase snake_case and **must not** already exist in the matching Global Taxonomy catalog.
- Do not invent empty stubs: collect enough real context (`reason`, and `urls` when available) before appending.
- Append only; never rewrite Global Taxonomy from this folder.
- Resource: `planro://taxonomy/agent`
