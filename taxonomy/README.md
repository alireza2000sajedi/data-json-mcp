# Global Planro Taxonomy

Taxonomy is global and shared by every province and every Entity. Never create province-local taxonomy files under a province output folder.

Production Entity fields must contain **Global Taxonomy** canonical IDs only.

## Missing concept → Agent Taxonomy (parallel catalogs)

`taxonomy/agent-taxonomy/` is a full mirror of these catalogs. The agent behaves **exactly like taxonomy authoring**:

1. Look up `planro://taxonomy` (Global).
2. If the reusable concept is missing, research it and **create a real taxonomy item** in the matching file under `taxonomy/agent-taxonomy/` (same `id`/`label`/`appliesTo`/`group` shape as Global).
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
| `categories.json` | `entity.categories[]` |
| `activities.json` | `entity.activities[]` |
| `features.json` | `entity.features[]` |
| `facilities.json` | `entity.facilities[]` |
| `risks.json` | `entity.safety.risks[]` |
| `checklist-items.json` | `entity.travelChecklist.{mode}[]` |

`travelChecklist` modes stay structural (`tour`, `personalCar`, `airplane`, `camping`, `train`, `bus`). Values inside each mode must be ids from Global `checklist-items.json`, never free-form Persian prose.
