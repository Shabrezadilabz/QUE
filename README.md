# Que (adc) — separate git repo

This folder is its **own** git repository. It does **not** use the parent `prosols` remote.

| | |
|---|---|
| Remote | https://github.com/Shabrezadilabz/QUE.git |
| Branch | `main` |

## Everyday commands

From PowerShell:

```powershell
cd d:\ADC\prosols\adc
.\git-pull.ps1          # fetch + pull from QUE
.\git-push.ps1          # commit prompt optional; push to QUE
```

Or plain git (same thing):

```powershell
cd d:\ADC\prosols\adc
git pull origin main
git add -A
git commit -m "your message"
git push origin main
```

Do **not** run these from `d:\ADC\prosols` — that pushes Prosols, not Que.

## Free pilot deploy

App lives under `schemagraph/`. Walkthrough: [`schemagraph/docs/DEPLOY-FREE.md`](./schemagraph/docs/DEPLOY-FREE.md) (Vercel UI + Neon DB + Render API).
