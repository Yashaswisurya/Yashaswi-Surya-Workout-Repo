# Validation report

## Executed

- `npm test`: 17 tests passed; zero failures/skips. Covers partial records, unknown versus zero, invalid dates/numbers, relational child preservation, changing old weight/calories/water/exercises/badminton results, removing an exercise, fresh backend runtime reads, version conflicts, duplicate request replay, duplicate dates, cross-log child-ID collisions, soft delete/restore conflicts, JSON roundtrip, duplicate/conflicting import, source notes, rejected unmapped fields, owner authorization, optional Drive backup idempotency, compensating rollback and formula-safe text/CSV.
- `npm run build`: production Vite build and Apps Script inline bundle generated successfully.
- Chromium browser automation (`node tests/browser.mjs` with a local dev server and Chromium debugging port): created a partial historical-date log; edited weight, water, calories, reps and badminton outcomes; checked unrelated notes; added/removed exercises; confirmed deletion and restore; visited all ten sections; reviewed and saved proposed goals; exported JSON and reviewed a duplicate import; checked unknown sets remain null; checked 360, 390, 768 and 1440px viewports including the edit form; no JavaScript runtime exceptions. Confirmed the public sandbox clears on refresh, as explicitly labeled.
- Generated Apps Script HTML contains the compiled React/CSS inline rather than references to `/src/main.jsx`. The generated inline bundle was served locally and passed the same full browser automation as the development build; actual Google HTML-service hosting still requires account-side validation.

Browser scripts use synthetic test records and temporary download files, not the user's original historical backup. The public application starts empty and never seeds narrative historical summaries.

## Important scope limits

The backend tests run the actual backend source against a simulated Sheets API in Node VM contexts, including a fresh runtime sharing the fake persisted tables. They test storage logic, not Google API behavior. They do **not** prove production cloud persistence, Google OAuth consent, Drive service configuration, actual Sheet cell interpretation, Apps Script quotas, owner-only deployment settings, or Google Sites authentication in iframes.

The Google account is not connected through tools with the necessary scopes. Required manual acceptance tests are documented step by step in DEPLOYMENT.md: create/refresh/edit/refresh against the real Sheet; repeating from another device; signed-out/non-owner rejection; Drive backup access; Google Sites embedding and browser-cookie behavior. These remain unrun, not passed. The supplied merged historical JSON and HTML are absent, so historical migration, record counts and source reconciliation also remain blocked pending the original source files.

## Reproduce browser checks

Start the dev server on port 5174 (`npm run dev -- --host 127.0.0.1 --port 5174 --strictPort`). Launch Chromium headlessly with remote debugging on 127.0.0.1:9222 using an isolated temporary profile, then run `node tests/browser.mjs`. This uses native Chrome DevTools Protocol and Node WebSocket without adding a test framework dependency. On containers Chromium may require the platform's supported sandbox flags. Synthetic JSON downloads and a screenshot go to `/tmp`.
