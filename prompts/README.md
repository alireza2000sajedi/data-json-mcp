# Planro Prompt Sequence

## Normal workflow
1. `01-start-province.txt` — one-time start of a province Scope.
2. `02-run-scope.txt` — one explicitly selected Scope per run.
3. `03-resume.txt` — continue the same Scope after interruption.
4. `04-repair-entity.txt` — repair one explicitly selected Entity.
5. `05-final-audit-minify.txt` — global audit only after the full dataset is complete.

The The Master contract is `01-start-province.txt`; it is the only Prompt that contains the full bootstrap + province-stage contract.

## Input rule
These files intentionally contain **no concrete province/county/city IDs**.
The Agent must use only the IDs explicitly supplied by the user in the current command.
Prompt 01 requires only `province_id`; derive the canonical Province Scope internally. Other prompts use the explicit scope/entity IDs supplied in their variable blocks and must not guess them.
