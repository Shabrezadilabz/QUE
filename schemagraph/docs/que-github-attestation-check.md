# GitHub check — Que attestation fingerprint + approved join IDs

Phase 0 CI helper. When Que opens a dbt PR, the PR body includes:

- **Attestation fingerprint**
- **Approved join IDs**

## Suggested GitHub Action (customer repo)

```yaml
name: Que attestation present
on:
  pull_request:
    types: [opened, edited, synchronize]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - name: Require Que attestation in PR body
        env:
          BODY: ${{ github.event.pull_request.body }}
        run: |
          echo "$BODY" | grep -q "Attestation fingerprint" || (echo "Missing fingerprint" && exit 1)
          echo "$BODY" | grep -q "Approved join IDs" || (echo "Missing join IDs" && exit 1)
```

Que never merges without human review — this check only proves the PR carries non-repudiation fields.
