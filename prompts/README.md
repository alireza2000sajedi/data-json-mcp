# Planro Prompt Sequence

## Normal workflow
1. `01-start-province.txt` — one-time start of a province Scope.
2. `02-run-scope.txt` — one explicitly selected Scope per run.
3. `03-resume.txt` — continue the same Scope after interruption.
4. `04-repair-entity.txt` — repair one explicitly selected Entity.
5. `05-final-audit-minify.txt` — global audit only after the full dataset is complete.

The Master contract is `../prompt.txt`.

## Input rule
These files intentionally contain **no concrete province/county/city IDs**.
The Agent must use only the IDs explicitly supplied by the user in the current command.
If a required ID is missing, the Agent must stop and ask for it instead of guessing or selecting one.
