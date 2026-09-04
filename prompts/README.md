# Planro Agent Prompts

`01-start-province.txt` is the initial prompt and contains the complete master contract plus MCP bootstrap.

- `01-start-province.txt`: user provides only `province_id`; Agent clones/loads MCP and starts the Province Scope.
- `02-run-scope.txt`: user provides `province_id` + exact `scope_id`.
- `03-resume.txt`: user provides `province_id` + `scope_id` + `previous_id`.
- `04-repair-entity.txt`: user provides `province_id` + `scope_id` + `entity_id` (+ optional `previous_id`).
- `05-final-audit-minify.txt`: user provides `final_audit=true` after the full dataset is complete.

No real production IDs are embedded in these prompts.

All prompts follow the global field normalization in `dataset/entity-field-policy.json`: Visit, Costs, FAQ, Checklist and Media are owned by the current Entity and must not leak child-specific operational data into parents.
