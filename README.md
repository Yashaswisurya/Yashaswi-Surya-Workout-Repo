# Surya Fitness HQ

A personal fitness command centre with React, an owner-only Google Apps Script backend, and a normalized private Google Sheets database. Built for fast check-ins, editable history, workouts, badminton, nutrition, recovery, progress and backups.

The GitHub Pages deployment is an **interface preview**. Its optional sandbox is unsaved memory and clears on refresh. Real cloud persistence requires the private Apps Script deployment; no public Sheet or browser-held secret is needed.

```sh
npm ci
npm run dev
npm test
npm run build
```

Use Node 24. The build also generates `deploy/apps-script/Code.gs`, `Index.html`, and `appsscript.json`. The Actions workflow publishes the interface and uploads those files as an artifact.

- [Private Google deployment and Sites embedding](docs/DEPLOYMENT.md)
- [Database schema, historical migration, backup and recovery](docs/DATA-AND-RECOVERY.md)
- [Validation and remaining Google account checks](docs/TEST-REPORT.md)

Historical fitness HTML/JSON was not supplied, so no personal records are fabricated or seeded. Provide the original merged backup for a reviewed migration. The marketing portfolio remains in the original repository and its earlier commits; this repository now contains the fitness application.
