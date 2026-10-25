import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { emptyLog } from "../shared/domain.js";
function harness() {
  const sheets = new Map(),
    props = new Map(),
    shared = { email: "owner@example.test", failNext: false, drive: 0 };
  class Sheet {
    constructor() {
      this.rows = [];
      this.max = 1000;
    }
    getMaxRows() {
      return this.max;
    }
    insertRowsAfter(_, n) {
      this.max += n;
    }
    getLastRow() {
      let n = this.rows.length;
      while (n && this.rows[n - 1].every((x) => x === "" || x == null)) n--;
      return n;
    }
    getRange(row, col, rows, cols) {
      return {
        setNumberFormats: () => {},
        getValues: () =>
          Array.from({ length: rows }, (_, i) =>
            Array.from(
              { length: cols },
              (_, j) => this.rows[row - 1 + i]?.[col - 1 + j] ?? "",
            ),
          ),
        setValues: (values) => {
          if (shared.failNext) {
            shared.failNext = false;
            throw new Error("Transient Sheets failure");
          }
          for (let i = 0; i < rows; i++) {
            this.rows[row - 1 + i] ||= [];
            for (let j = 0; j < cols; j++) {
              let v = values[i][j];
              if (typeof v === "string" && v.startsWith("'")) v = v.slice(1);
              this.rows[row - 1 + i][col - 1 + j] = v;
            }
          }
        },
        clearContent: () => {
          for (let i = 0; i < rows; i++)
            for (let j = 0; j < cols; j++)
              this.rows[row - 1 + i][col - 1 + j] = "";
        },
      };
    }
    getDataRange() {
      const cols = Math.max(...this.rows.map((r) => r.length), 1);
      return this.getRange(1, 1, Math.max(this.getLastRow(), 1), cols);
    }
    setFrozenRows() {}
  }
  const db = {
    getId: () => "sheet1",
    getSheetByName: (n) => sheets.get(n),
    insertSheet: (n) => {
      const s = new Sheet();
      sheets.set(n, s);
      return s;
    },
  };
  function context() {
    return vm.createContext({
      console,
      Date,
      Math,
      Intl,
      JSON,
      Set,
      Map,
      Session: {
        getActiveUser: () => ({ getEmail: () => shared.email }),
        getEffectiveUser: () => ({ getEmail: () => "owner@example.test" }),
      },
      PropertiesService: {
        getScriptProperties: () => ({
          getProperty: (k) => props.get(k),
          setProperty: (k, v) => props.set(k, v),
        }),
      },
      SpreadsheetApp: {
        getActiveSpreadsheet: () => db,
        openById: () => db,
        flush: () => {},
      },
      LockService: {
        getScriptLock: () => ({ waitLock() {}, releaseLock() {} }),
      },
      Utilities: {
        getUuid: () => crypto.randomUUID(),
        newBlob: (value, type, name) => ({ value, type, name }),
      },
      Drive: {
        Files: {
          create: () => {
            shared.drive++;
            return {
              id: "private-backup",
              webViewLink: "https://drive.google.com/private-backup",
            };
          },
        },
      },
      MimeType: { PLAIN_TEXT: "text/plain" },
    });
  }
  const code =
    fs.readFileSync("shared/domain.js", "utf8").replace(/^export /gm, "") +
    "\n" +
    fs.readFileSync("apps-script/Server.js", "utf8");
  let ctx = context();
  vm.runInContext(code, ctx);
  ctx.initialize();
  return {
    call: (p) =>
      JSON.parse(JSON.stringify(ctx.api(JSON.parse(JSON.stringify(p))))),
    fresh: () => {
      ctx = context();
      vm.runInContext(code, ctx);
    },
    sheets,
    shared,
  };
}
function save(h, log, version = null, requestId = crypto.randomUUID()) {
  return h.call({ action: "save", log, expectedVersion: version, requestId })
    .log;
}
test("backend create / fresh-runtime reload / edit preserve full nested records", () => {
  const h = harness();
  let log = {
    ...emptyLog("2026-10-17"),
    weight: 80.8,
    water: 3.5,
    calories: 2540,
    notes: "Keep this",
    workouts: [
      {
        id: "workout1",
        type: "Biceps",
        duration: 45,
        exercises: [{ id: "exercise1", name: "Curl", weight: 15, reps: 15 }],
      },
    ],
    badminton: [{ id: "court1", played: 6, won: 5, lost: 1, duration: 90 }],
  };
  log = save(h, log);
  assert.equal(log.version, 1);
  h.fresh();
  let loaded = h.call({ action: "load" }).logs[0];
  assert.equal(loaded.weight, 80.8);
  assert.equal(loaded.workouts[0].exercises[0].sets, null);
  loaded.weight = 79.5;
  loaded.workouts[0].exercises[0].reps = 20;
  loaded.workouts[0].exercises.push({
    id: "exercise2",
    name: "Press",
    reps: 10,
  });
  loaded.calories = 2600;
  loaded.water = 4;
  loaded.badminton[0].won = 4;
  loaded.badminton[0].lost = 2;
  const edited = save(h, loaded, loaded.version);
  h.fresh();
  const persisted = h.call({ action: "load" }).logs[0];
  assert.equal(persisted.id, log.id);
  assert.equal(persisted.createdAt, log.createdAt);
  assert.equal(persisted.weight, 79.5);
  assert.equal(persisted.notes, "Keep this");
  assert.equal(persisted.calories, 2600);
  assert.equal(persisted.water, 4);
  assert.equal(persisted.badminton[0].won, 4);
  assert.equal(persisted.workouts[0].exercises.length, 2);
  persisted.workouts[0].exercises.splice(0, 1);
  save(h, persisted, edited.version);
  assert.equal(
    h.call({ action: "load" }).logs[0].workouts[0].exercises.length,
    1,
  );
  assert.equal(h.sheets.get("Exercises").getLastRow(), 2);
});
test("idempotency and stale-edit detection", () => {
  const h = harness(),
    r = emptyLog("2026-10-17"),
    token = crypto.randomUUID();
  const a = save(h, r, null, token);
  assert.equal(save(h, r, null, token).version, 1);
  assert.equal(h.call({ action: "load" }).logs.length, 1);
  assert.throws(() => save(h, { ...a, weight: 79 }, 0), /changed/);
  assert.throws(() => save(h, emptyLog("2026-10-17")), /already exists/);
});
test("soft deletion retains children; restore conflicts never lose data", () => {
  const h = harness();
  const a = save(h, {
    ...emptyLog("2026-10-17"),
    meals: [{ id: "meal1", food: "Chicken", category: "Lunch" }],
  });
  h.call({
    action: "delete",
    id: a.id,
    expectedVersion: 1,
    requestId: crypto.randomUUID(),
  });
  assert(h.call({ action: "load" }).logs[0].deletedAt);
  assert.equal(h.call({ action: "load" }).logs[0].meals[0].food, "Chicken");
  const b = save(h, emptyLog("2026-10-17"));
  assert.throws(
    () =>
      h.call({
        action: "restore",
        id: a.id,
        expectedVersion: 2,
        requestId: crypto.randomUUID(),
      }),
    /Another active/,
  );
  h.call({
    action: "delete",
    id: b.id,
    expectedVersion: 1,
    requestId: crypto.randomUUID(),
  });
  h.call({
    action: "restore",
    id: a.id,
    expectedVersion: 2,
    requestId: crypto.randomUUID(),
  });
  assert.equal(
    h.call({ action: "load" }).logs.find((x) => x.id === a.id).deletedAt,
    null,
  );
});
test("exports roundtrip into new database, duplicates skipped, conflicting values retained", () => {
  const h = harness();
  const a = save(h, {
    ...emptyLog("2026-10-17"),
    water: 3.5,
    sources: [
      {
        id: "source1",
        field: "water",
        value: "over 4 L",
        source: "conversation",
        note: "Conflict retained",
      },
    ],
  });
  const backup = h.call({ action: "export" }),
    other = harness();
  const result = other.call({
    action: "import",
    backup,
    conflictPolicy: "skip",
    requestId: crypto.randomUUID(),
  });
  assert.equal(result.imported, 1);
  assert.equal(
    other.call({ action: "load" }).logs[0].sources[0].value,
    "over 4 L",
  );
  assert.equal(
    other.call({
      action: "import",
      backup,
      conflictPolicy: "skip",
      requestId: crypto.randomUUID(),
    }).duplicates.length,
    1,
  );
  backup.logs[0].water = 4.5;
  assert.throws(
    () =>
      other.call({ action: "import", backup, requestId: crypto.randomUUID() }),
    /Conflicts/,
  );
  const conflict = other.call({
    action: "import",
    backup,
    conflictPolicy: "skip",
    requestId: crypto.randomUUID(),
  });
  assert.equal(conflict.conflicts.length, 1);
  assert.equal(other.call({ action: "load" }).logs[0].water, 3.5);
});
test("authorization enforced for every API action and private backups", () => {
  const h = harness();
  h.shared.email = "other@example.test";
  for (const action of [
    "load",
    "save",
    "delete",
    "export",
    "driveBackup",
    "import",
    "goals",
  ])
    assert.throws(
      () => h.call({ action, requestId: crypto.randomUUID() }),
      /Access denied/,
    );
  assert.equal(h.shared.drive, 0);
  h.shared.email = "";
  assert.throws(() => h.call({ action: "load" }), /Access denied/);
});
test("write failure restores prior table contents and allows retry", () => {
  const h = harness(),
    a = save(h, emptyLog("2026-10-17"));
  h.shared.failNext = true;
  assert.throws(
    () => save(h, { ...a, water: 4 }, a.version),
    /previous data restored/,
  );
  assert.equal(h.call({ action: "load" }).logs[0].water, null);
  assert.equal(save(h, { ...a, water: 4 }, a.version).water, 4);
});
test("text formula injection remains literal through Sheets serialization", () => {
  const h = harness();
  const a = save(h, {
    ...emptyLog("2026-10-17"),
    notes: '=IMPORTXML("private")',
  });
  assert.equal(h.call({ action: "load" }).logs[0].notes, a.notes);
});
test("child IDs cannot attach exercises to a different parent log", () => {
  const h = harness();
  save(h, {
    ...emptyLog("2026-10-17"),
    workouts: [
      {
        id: "session-collision",
        exercises: [{ id: "exercise-collision", name: "Press" }],
      },
    ],
  });
  assert.throws(
    () =>
      save(h, {
        ...emptyLog("2026-10-18"),
        workouts: [{ id: "session-collision", exercises: [] }],
      }),
    /another log/,
  );
  assert.throws(
    () =>
      save(h, {
        ...emptyLog("2026-10-18"),
        workouts: [
          {
            id: "different-session",
            exercises: [{ id: "exercise-collision", name: "Curl" }],
          },
        ],
      }),
    /another log/,
  );
  assert.equal(h.call({ action: "load" }).logs.length, 1);
});
test("Drive backup is private file creation and repeated request IDs reuse the result", () => {
  const h = harness(),
    request = { action: "driveBackup", requestId: crypto.randomUUID() };
  assert.match(h.call(request).url, /drive.google.com/);
  h.call(request);
  assert.equal(h.shared.drive, 1);
});
