import {
  emptyLog,
  GOAL_DEFAULTS,
  validateLog,
  validateGoals,
  importPreview,
  id,
  SCHEMA_VERSION,
} from "../shared/domain.js";
export const isCloud = () => Boolean(globalThis.google?.script?.run);
let sandbox = {
  logs: [],
  goals: { ...GOAL_DEFAULTS },
  owner: "Unsaved sandbox",
};
const requests = new Map();
export async function request(payload) {
  if (isCloud())
    return new Promise((resolve, reject) =>
      globalThis.google.script.run
        .withSuccessHandler(resolve)
        .withFailureHandler((e) =>
          reject(new Error(e.message || "Cloud request failed.")),
        )
        .api(payload),
    );
  if (!globalThis.__SURYA_SANDBOX__)
    throw new Error(
      "Cloud is not connected. Open your private Apps Script deployment or try the unsaved sandbox.",
    );
  await new Promise((r) => setTimeout(r, 100));
  if (payload.action === "load") return structuredClone(sandbox);
  if (payload.action === "export")
    return {
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      ...structuredClone(sandbox),
    };
  if (requests.has(payload.requestId)) return requests.get(payload.requestId);
  let result;
  if (payload.action === "save") {
    const log = validateLog(payload.log),
      old = sandbox.logs.find((x) => x.id === log.id);
    if (old && old.version !== payload.expectedVersion)
      throw new Error("Stale edit. Reload first.");
    if (
      sandbox.logs.some(
        (x) => x.id !== log.id && x.date === log.date && !x.deletedAt,
      )
    )
      throw new Error("A log exists for this date. Edit the existing log.");
    log.version = (old?.version || 0) + 1;
    log.createdAt = old?.createdAt || new Date().toISOString();
    log.updatedAt = new Date().toISOString();
    log.deletedAt = null;
    sandbox.logs = sandbox.logs.filter((x) => x.id !== log.id).concat(log);
    result = { log };
  } else if (["delete", "restore"].includes(payload.action)) {
    const log = sandbox.logs.find((x) => x.id === payload.id);
    if (!log || log.version !== payload.expectedVersion)
      throw new Error("Record changed. Reload.");
    if (
      payload.action === "restore" &&
      sandbox.logs.some(
        (x) => !x.deletedAt && x.id !== log.id && x.date === log.date,
      )
    )
      throw new Error("A log exists for this date.");
    log.deletedAt =
      payload.action === "delete" ? new Date().toISOString() : null;
    log.version++;
    log.updatedAt = new Date().toISOString();
    result = { id: log.id };
  } else if (payload.action === "goals") {
    sandbox.goals = validateGoals(payload.goals);
    result = { goals: sandbox.goals };
  } else if (payload.action === "import") {
    const report = importPreview(payload.backup, sandbox.logs);
    for (const x of report.logs.filter((x) => report.new.includes(x.id)))
      sandbox.logs.push({
        ...x,
        version: 1,
        createdAt: x.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });
    result = {
      imported: report.new.length,
      skipped:
        report.conflicts.length +
        report.duplicates.length +
        report.deleted.length,
      conflicts: report.conflicts,
      duplicates: report.duplicates,
      missing: report.missing,
      transformations: report.transformations,
      goalsImported: false,
    };
  } else
    throw new Error("This operation requires the private Google deployment.");
  requests.set(payload.requestId, result);
  return structuredClone(result);
}
export function startSandbox() {
  globalThis.__SURYA_SANDBOX__ = true;
}
