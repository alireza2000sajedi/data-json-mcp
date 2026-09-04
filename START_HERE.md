# Planro Data MCP — Start Here

## First Agent run
Use `prompts/01-start-province.txt` as the first prompt. It contains the master contract and the mandatory bootstrap process for the MCP repository.

The user gives only:
```text
province_id=<PROVINCE_ID>
```

The Agent derives the Province Scope internally. It must not ask for the derived `scope_id`.

## Other prompts
- `prompts/02-run-scope.txt`: run one explicitly selected Scope.
- `prompts/03-resume.txt`: resume one Scope using `previous_id`.
- `prompts/04-repair-entity.txt`: repair one exact Entity.
- `prompts/05-final-audit-minify.txt`: global audit and final minification.

## MCP bootstrap
Prompt 01 must locate or clone:
`https://github.com/alireza2000sajedi/data-json-mcp.git`

Then install/build/verify and inspect tools/resources with `mcp-client.mjs` before research.

## Core normalized model
Field applicability is defined in `dataset/entity-field-policy.json`.
- Province: destination season/months, destination travel costs, province-level FAQ/checklist/media.
- County/City: scope-level information and costs; no opening hours or child entry fees.
- Village: village-specific visit/access/cost/checklist/FAQ/media.
- Place: detailed visit fields including opening hours and entry fee when applicable.
- Camping: site-specific visit, camping costs, checklist and media.

Every Entity owns its own FAQ, checklist, costs and media. Parent records must not duplicate child operational data.
