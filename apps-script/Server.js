/* Built together with shared/domain.js into deploy/apps-script/Code.gs. */
const TABLES = {
  DailyLogs: [
    "id",
    "date",
    "dayType",
    ...Object.keys(DAILY_NUMBERS),
    "notes",
    "sleepTime",
    "wakeTime",
    "sleepQuality",
    "workoutCompleted",
    "cardioCompleted",
    "badmintonPlayed",
    "nutritionLogged",
    "supplementsTaken",
    "waterAchieved",
    "createdAt",
    "updatedAt",
    "version",
    "deletedAt",
  ],
  Workouts: ["id", "logId", "type", "duration", "effort", "notes"],
  Exercises: [
    "id",
    "workoutId",
    "name",
    "equipment",
    "sets",
    "reps",
    "weight",
    "duration",
    "notes",
    "pr",
  ],
  BadmintonSessions: [
    "id",
    "logId",
    "duration",
    "played",
    "won",
    "lost",
    "intensity",
    "opponent",
    "notes",
  ],
  Meals: [
    "id",
    "logId",
    "category",
    "food",
    "quantity",
    "unit",
    "calories",
    "protein",
    "carbs",
    "fat",
    "notes",
    "estimated",
  ],
  Supplements: [
    "id",
    "logId",
    "name",
    "dose",
    "unit",
    "time",
    "taken",
    "notes",
  ],
  Sources: ["id", "logId", "field", "value", "source", "note"],
  Settings: ["key", "value"],
  AuditLog: ["id", "at", "action", "recordId", "version"],
  Requests: ["id", "at", "chunk", "response"],
};
for (const name of [
  "Workouts",
  "Exercises",
  "BadmintonSessions",
  "Meals",
  "Supplements",
  "Sources",
])
  TABLES[name].push("createdAt", "updatedAt");
function initialize() {
  const email = Session.getEffectiveUser().getEmail();
  if (!email) throw new Error("Sign in to your Google account first.");
  const p = PropertiesService.getScriptProperties();
  const owner = p.getProperty("OWNER_EMAIL");
  if (
    owner &&
    (owner !== email || Session.getActiveUser().getEmail() !== owner)
  )
    throw new Error("Owner access required.");
  if (!p.getProperty("SPREADSHEET_ID")) {
    const bound = SpreadsheetApp.getActiveSpreadsheet();
    if (!bound)
      throw new Error(
        "Create this script from your private Google Sheet: Extensions → Apps Script.",
      );
    p.setProperty("SPREADSHEET_ID", bound.getId());
  }
  p.setProperty("OWNER_EMAIL", email);
  const ss = database_();
  for (const [name, headers] of Object.entries(TABLES)) {
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
    } else if (sheet.getLastRow() > 0) {
      const actual = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
      if (JSON.stringify(actual) !== JSON.stringify(headers))
        throw new Error(
          "Schema mismatch in " + name + ". No data overwritten.",
        );
    }
  }
  return "Initialized. Keep this spreadsheet private and deploy the web app for Only myself.";
}
function authorize_() {
  const owner =
    PropertiesService.getScriptProperties().getProperty("OWNER_EMAIL");
  const active = Session.getActiveUser().getEmail();
  if (!owner || !active || active !== owner)
    throw new Error(
      "Private fitness data: sign in with the owner account. Access denied.",
    );
}
function database_() {
  const key =
    PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  if (!key) throw new Error("Run initialize in the Apps Script editor first.");
  return SpreadsheetApp.openById(key);
}
function doGet() {
  authorize_();
  return HtmlService.createHtmlOutputFromFile("Index")
    .setTitle("Surya Fitness HQ")
    .addMetaTag("viewport", "width=device-width, initial-scale=1")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function readTables_() {
  const ss = database_(),
    tables = {};
  for (const [name, headers] of Object.entries(TABLES)) {
    const sheet = ss.getSheetByName(name);
    if (!sheet) throw new Error("Missing table " + name + ". Run initialize.");
    const values = sheet.getDataRange().getValues();
    if (JSON.stringify(values[0]) !== JSON.stringify(headers))
      throw new Error("Unexpected schema in " + name + ".");
    tables[name] = values
      .slice(1)
      .filter((r) => r[0] !== "")
      .map((row) =>
        Object.fromEntries(
          headers.map((k, i) => [k, row[i] === "" ? null : row[i]]),
        ),
      );
  }
  return tables;
}
function cell_(v) {
  if (v == null) return "";
  if (typeof v === "string" && /^[=+@\-\t\r']/.test(v)) return "'" + v;
  return v;
}
function writeTable_(name, rows) {
  const s = database_().getSheetByName(name),
    keys = TABLES[name];
  const required = rows.length + 1;
  if (required > s.getMaxRows())
    s.insertRowsAfter(s.getMaxRows(), required - s.getMaxRows());
  if (s.getLastRow() > 1)
    s.getRange(2, 1, s.getLastRow() - 1, keys.length).clearContent();
  if (rows.length) {
    const range = s.getRange(2, 1, rows.length, keys.length);
    // Preserve ISO dates, times and notes as text; do not let Sheets infer dates.
    range.setNumberFormats(
      rows.map((r) =>
        keys.map((k) => (typeof r[k] === "string" ? "@" : "General")),
      ),
    );
    range.setValues(rows.map((r) => keys.map((k) => cell_(r[k]))));
  }
}
function hydrate_(t) {
  return t.DailyLogs.map((row) => {
    const log = { ...row };
    for (const k of ["notes", "sleepTime", "wakeTime", "dayType"])
      log[k] = log[k] || "";
    for (const k of [
      "workoutCompleted",
      "cardioCompleted",
      "badmintonPlayed",
      "nutritionLogged",
      "supplementsTaken",
      "waterAchieved",
    ])
      log[k] = log[k] === true;
    for (const [key, table] of [
      ["workouts", "Workouts"],
      ["badminton", "BadmintonSessions"],
      ["meals", "Meals"],
      ["supplements", "Supplements"],
      ["sources", "Sources"],
    ])
      log[key] = t[table]
        .filter((x) => x.logId === log.id)
        .map((x) => {
          const v = { ...x };
          delete v.logId;
          if (key === "workouts")
            v.exercises = t.Exercises.filter((e) => e.workoutId === v.id).map(
              (e) => {
                const c = { ...e };
                delete c.workoutId;
                return c;
              },
            );
          return v;
        });
    return log;
  });
}
function settings_(t) {
  const value = { ...GOAL_DEFAULTS };
  for (const x of t.Settings) if (x.key in value) value[x.key] = x.value;
  return validateGoals(value);
}
function putLog_(t, log) {
  const now = log.updatedAt || new Date().toISOString();
  for (const [key, table] of [
    ["workouts", "Workouts"],
    ["badminton", "BadmintonSessions"],
    ["meals", "Meals"],
    ["supplements", "Supplements"],
    ["sources", "Sources"],
  ])
    for (const item of log[key]) {
      const old = t[table].find((x) => x.id === item.id);
      item.createdAt = old?.createdAt || item.createdAt || now;
      item.updatedAt = now;
      if (key === "workouts")
        for (const e of item.exercises) {
          const prior = t.Exercises.find((x) => x.id === e.id);
          e.createdAt = prior?.createdAt || e.createdAt || now;
          e.updatedAt = now;
        }
    }
  const oldWork = t.Workouts.filter((x) => x.logId === log.id).map((x) => x.id);
  for (const [key, table] of [
    ["workouts", "Workouts"],
    ["badminton", "BadmintonSessions"],
    ["meals", "Meals"],
    ["supplements", "Supplements"],
    ["sources", "Sources"],
  ])
    for (const item of log[key]) {
      if (t[table].some((x) => x.id === item.id && x.logId !== log.id))
        throw new Error(
          "Child ID already belongs to another log. No data changed.",
        );
      if (key === "workouts")
        for (const e of item.exercises)
          if (
            t.Exercises.some(
              (x) => x.id === e.id && !oldWork.includes(x.workoutId),
            )
          )
            throw new Error("Exercise ID already belongs to another log.");
    }
  t.Exercises = t.Exercises.filter((x) => !oldWork.includes(x.workoutId));
  t.DailyLogs = t.DailyLogs.filter((x) => x.id !== log.id);
  t.DailyLogs.push(
    Object.fromEntries(TABLES.DailyLogs.map((k) => [k, log[k] ?? null])),
  );
  for (const [key, table] of [
    ["workouts", "Workouts"],
    ["badminton", "BadmintonSessions"],
    ["meals", "Meals"],
    ["supplements", "Supplements"],
    ["sources", "Sources"],
  ]) {
    t[table] = t[table].filter((x) => x.logId !== log.id);
    for (const item of log[key]) {
      const row = { ...item, logId: log.id };
      delete row.exercises;
      t[table].push(row);
      if (key === "workouts")
        for (const exercise of item.exercises)
          t.Exercises.push({ ...exercise, workoutId: item.id });
    }
  }
}
function audit_(t, action, record) {
  t.AuditLog.push({
    id: Utilities.getUuid(),
    at: new Date().toISOString(),
    action,
    recordId: record.id || "settings",
    version: record.version || null,
  });
}
function backupPayload_(t) {
  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    logs: hydrate_(t),
    goals: settings_(t),
    audit: t.AuditLog,
  };
}
function api(request) {
  authorize_();
  if (!request || typeof request !== "object")
    throw new Error("Invalid request.");
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const t = readTables_();
    if (request.action === "load")
      return {
        logs: hydrate_(t),
        goals: settings_(t),
        owner: Session.getActiveUser().getEmail(),
      };
    if (request.action === "export") return backupPayload_(t);
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(request.requestId || ""))
      throw new Error("A stable request ID is required.");
    const previous = t.Requests.filter((x) => x.id === request.requestId).sort(
      (a, b) => a.chunk - b.chunk,
    );
    if (previous.length)
      return JSON.parse(previous.map((x) => x.response).join(""));
    const original = JSON.parse(JSON.stringify(t));
    let result;
    const now = new Date().toISOString();
    if (request.action === "save") {
      const log = validateLog(request.log),
        old = t.DailyLogs.find((x) => x.id === log.id);
      if (old && old.version !== request.expectedVersion)
        throw new Error(
          "This record changed on another device. Reload before editing; your form is preserved.",
        );
      if (old?.deletedAt)
        throw new Error("Restore this record before editing.");
      if (
        t.DailyLogs.some(
          (x) => x.date === log.date && x.id !== log.id && !x.deletedAt,
        )
      )
        throw new Error(
          "A daily log already exists for this date. Edit it to add another session.",
        );
      if (!old && request.expectedVersion != null)
        throw new Error("Record no longer exists. Reload first.");
      log.createdAt = old?.createdAt || now;
      log.updatedAt = now;
      log.version = (old?.version || 0) + 1;
      log.deletedAt = null;
      putLog_(t, log);
      audit_(t, old ? "update" : "create", log);
      result = { log };
    } else if (request.action === "delete" || request.action === "restore") {
      const old = t.DailyLogs.find((x) => x.id === request.id);
      if (!old) throw new Error("Record not found.");
      if (old.version !== request.expectedVersion)
        throw new Error("Record changed. Reload first.");
      if (
        request.action === "restore" &&
        t.DailyLogs.some(
          (x) => x.date === old.date && x.id !== old.id && !x.deletedAt,
        )
      )
        throw new Error("Another active record exists on this date.");
      old.deletedAt = request.action === "delete" ? now : null;
      old.updatedAt = now;
      old.version++;
      audit_(t, request.action, old);
      result = { id: old.id };
    } else if (request.action === "goals") {
      const goals = validateGoals(request.goals);
      t.Settings = Object.entries(goals).map(([key, value]) => ({
        key,
        value,
      }));
      audit_(t, "goals", {});
      result = { goals };
    } else if (request.action === "import") {
      const report = importPreview(request.backup, hydrate_(t));
      if (report.conflicts.length && request.conflictPolicy !== "skip")
        throw new Error(
          "Conflicts require explicit skip-existing confirmation. Existing data is never overwritten by import.",
        );
      for (const log of report.logs.filter((x) => report.new.includes(x.id))) {
        log.createdAt = log.createdAt || now;
        log.updatedAt = now;
        log.version = 1;
        log.deletedAt = null;
        putLog_(t, log);
        audit_(t, "import", log);
      }
      result = {
        imported: report.new.length,
        skipped:
          report.duplicates.length +
          report.conflicts.length +
          report.deleted.length,
        duplicates: report.duplicates,
        conflicts: report.conflicts,
        missing: report.missing,
        transformations: report.transformations,
        goalsImported: false,
      };
    } else if (request.action === "driveBackup") {
      if (typeof Drive === "undefined")
        throw new Error(
          "Enable the Google Drive v3 advanced service in Apps Script before creating Drive backups.",
        );
      const name = "surya-fitness-" + now.replace(/[:.]/g, "-") + ".json";
      const file = Drive.Files.create(
        { name, mimeType: "application/json" },
        Utilities.newBlob(
          JSON.stringify(backupPayload_(t), null, 2),
          "application/json",
          name,
        ),
        { fields: "id,webViewLink" },
      );
      result = {
        url:
          file.webViewLink ||
          "https://drive.google.com/file/d/" + file.id + "/view",
      };
    } else throw new Error("Unknown action.");
    const encoded = JSON.stringify(result);
    for (let offset = 0; offset < encoded.length; offset += 40000)
      t.Requests.push({
        id: request.requestId,
        at: now,
        chunk: offset / 40000,
        response: encoded.slice(offset, offset + 40000),
      });
    const retained = [...new Set(t.Requests.map((x) => x.id))].slice(-500);
    t.Requests = t.Requests.filter((x) => retained.includes(x.id));
    const changed = Object.keys(TABLES).filter(
      (name) => JSON.stringify(t[name]) !== JSON.stringify(original[name]),
    );
    try {
      for (const name of changed) writeTable_(name, t[name]);
      SpreadsheetApp.flush();
    } catch (error) {
      let rollbackFailed = false;
      for (const name of changed) {
        try {
          writeTable_(name, original[name]);
        } catch (_) {
          rollbackFailed = true;
        }
      }
      SpreadsheetApp.flush();
      if (rollbackFailed)
        throw new Error(
          "Storage error during rollback. Stop editing and restore from your latest backup; check the spreadsheet.",
        );
      throw new Error("Save failed; previous data restored. " + error.message);
    }
    return result;
  } finally {
    lock.releaseLock();
  }
}
