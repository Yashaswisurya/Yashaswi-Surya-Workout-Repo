# Deploy Surya Fitness HQ privately

The public GitHub Pages URL is an interface preview. It does **not** connect to a private Sheet and does not save fitness data. Its opt-in sandbox uses memory that clears on refresh. Production uses a Google Apps Script HTML-service app with `google.script.run`, hosted separately and embedded into Google Sites. This avoids cross-origin API workarounds, public Sheets and frontend credentials.

## 1. Prepare the bundle

Use Node 24 (Node 20.19+ or 22.12+ also meets Vite requirements):

```sh
npm ci
npm test
npm run build
```

This produces `dist/` for the public preview and three files in `deploy/apps-script/`: `Code.gs`, `Index.html`, `appsscript.json`. The build inlines the compiled React code and CSS into Index.html. Do not paste the source Vite index.html: it references development-only files.

The GitHub deployment workflow uploads a `surya-fitness-apps-script` artifact containing these three files. Open a successful **Deploy Fitness HQ** Actions run and download that artifact if you do not want to build locally. Artifact downloads may require GitHub login.

## 2. Create the private database

1. Sign in to the Google account that should own your personal fitness data.
2. Create a new Google Sheet named **Surya Fitness HQ — Private Data**.
3. Keep Share → General access set to **Restricted**. Do not publish the spreadsheet to the web. Do not enter fitness data into public repositories.
4. From that spreadsheet open **Extensions → Apps Script**. This creates a container-bound script.
5. In the editor replace Code.gs with the generated Code.gs from the build/artifact.
6. Add an HTML file named **Index**, then paste generated Index.html into it.
7. Project Settings → enable **Show appsscript.json manifest file**. Replace the manifest with the generated appsscript.json. Time zone is Asia/Kolkata.
8. Save all files. Confirm **Google Drive API v3** appears under Services (the manifest enables this advanced service for optional private backups). If using a custom Google Cloud project, enable the Drive API there as well.
9. Select **initialize** in the function dropdown and click **Run**. Review the requested Google permissions and authorize only your own project. This stores your owner email and spreadsheet ID in private Script Properties and creates the documented tabs without replacing populated tables. A schema mismatch stops initialization instead of overwriting existing data.
10. Confirm the DailyLogs, Workouts, Exercises, BadmintonSessions, Meals, Supplements, Sources, Settings, AuditLog and Requests tabs appear.

The app requires spreadsheet access, your signed-in email, and Drive file access for optional explicit backups. It never makes the database public. If Google or your organization blocks authorization, stop and resolve that restriction; do not weaken database sharing to work around it.

## 3. Deploy the private app

1. Apps Script → **Deploy → New deployment → Web app**.
2. Description: `Surya Fitness HQ v1`.
3. Execute as: **Me** (the owner who ran initialize).
4. Who has access: **Only myself**. Do not select Everyone.
5. Deploy and copy the web app URL ending in **/exec**. Keep the URL in your private notes.
6. Open this URL while signed into the same owner account. The top bar should say **Google Sheets**. A public preview or unsaved sandbox is not a cloud connection.
7. If owner email is unavailable in your account/deployment policy, the backend deliberately denies access. Verify the account, initialize owner, and deployment settings; do not remove `authorize_()` or allow anonymous access. Apps Script access options vary for Workspace accounts. Ask your administrator if owner-only web apps are restricted.

## 4. Verify real persistence before relying on it

Use test values, not historical records:

1. Create a partial log on an unused date and save. Verify its row in DailyLogs.
2. Refresh the /exec app. Reopen the log in History and confirm the values persisted.
3. Add two workout sessions, exercises with unknown sets left blank, meals, supplements, and a badminton result with explicit wins and losses.
4. Edit only weight. Save, refresh and check that notes and all child data remain unchanged.
5. Edit exercise reps, calories, water and badminton results. Refresh and inspect the normalized Sheet tabs.
6. Leave the same record open on two devices. Save on device A, then try saving the old version on device B. B must receive a conflict rather than overwriting A. Keep its form open, copy unsaved text if needed, then close and reload before merging.
7. Export JSON. On re-import it should be detected as duplicates, not added again. Change a copied backup value: import review must flag a conflict and preserve the database value.
8. Delete the test log with confirmation and restore it through Settings → Recoverable trash.
9. Open /exec on another device signed into the owner account and check the same record.
10. Try /exec signed out and with a different Google account. It must deny access. Never relax Sheet permissions to pass a test.

These Google-hosted checks require your account and have not been performed by Codex. Backend tests in the repository use a simulated Sheets service; they do not establish Google authorization, API quotas or cross-device production behavior.

## 5. Embed in Google Sites

Publishing destination supplied in the brief: https://sites.google.com/view/suryafitnessdashboard/full-page-embed?authuser=1 . This is not evidence of editor access.

1. Open your existing site in **Google Sites edit mode**, signed into its owner/editor account.
2. Choose your fitness dashboard page or create a **Full page embed** page.
3. Choose **Insert → Embed → By URL** and paste the private Apps Script **/exec** URL. Do not embed the Google Sheet or public Pages sandbox.
4. Insert, adjust the height if using a section embed, preview desktop/mobile, then publish the Site yourself.
5. Open the published Site signed into the same Google account. Confirm the app says **Google Sheets**, then perform create → refresh → edit → refresh inside the embed.
6. Verify on a second device and confirm signed-out viewers cannot see records. Restrict the Google Site audience as appropriate; Apps Script also enforces owner access.

HtmlService `ALLOWALL` enables the iframe; it does not grant database access. Google authentication, organization rules, embedded browser restrictions or blocked third-party cookies can prevent private Apps Script content from loading in an iframe. If that occurs, authenticate in a top-level /exec tab first and retry. If the browser still blocks it, place an **Open private Fitness HQ** button on the Site linking to /exec. Do not make the app or Sheet public to defeat iframe restrictions. Actual Google Sites embedding must be verified under your account.

## 6. Update an existing deployment

Build and test the new version, replace Code.gs and Index.html in your original Apps Script project, save, then **Deploy → Manage deployments → Edit → Version: New version → Deploy**. Keep the same deployment so your Site embed URL stays stable. Refresh and repeat the persistence checks. Do not create a new Sheet or rerun a destructive migration. initialize is additive for missing tabs and refuses unexpected schemas.

## Operational limits

This is an owner-only personal app. Apps Script runtime quotas and Sheets limits apply. It reads the small personal dataset under a script lock and rewrites only changed normalized tables; it is not designed for a multi-user public service or unbounded data. Request IDs are retained for the last 500 mutations. Keep backups before imports and major edits. Multi-tab writes have compensating rollback on ordinary errors, but Sheets is not a transactional database; process termination or quota exhaustion can interrupt rollback. Use the recovery guide and stop edits if a storage error reports failed recovery.
