import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyLog,
  validateLog,
  stats,
  importPreview,
  duplicateLog,
  csvExport,
  dateRange,
  validateGoals,
} from "../shared/domain.js";
const log = (date = "2026-10-17", fields = {}) => ({
  ...emptyLog(date),
  ...fields,
});
test("partial entries preserve null while actual zeros remain zero", () => {
  const v = validateLog(log(undefined, { water: 0, cardio: 0 }));
  assert.equal(v.water, 0);
  assert.equal(v.weight, null);
  assert.equal(v.calories, null);
  assert.throws(() => validateLog(log("2026-02-30")), /date/);
  assert.throws(() => validateLog(log(undefined, { water: -1 })), /water/);
});
test("multiple sessions, exercise edits and unknown sets are retained", () => {
  const v = validateLog(
    log(undefined, {
      workouts: [
        {
          id: "s1",
          type: "Chest",
          exercises: [{ id: "e1", name: "Press", weight: 15, reps: 15 }],
        },
        { id: "s2", type: "Legs", exercises: [] },
      ],
    }),
  );
  assert.equal(v.workouts.length, 2);
  assert.equal(v.workouts[0].exercises[0].sets, null);
  assert.equal(stats([v]).volume, null);
  v.workouts[0].exercises[0].sets = 3;
  assert.equal(stats([v]).volume, 675);
});
test("win rate uses explicit outcomes, never missing losses", () => {
  const v = validateLog(
    log(undefined, {
      badminton: [
        { id: "b1", played: 7, won: 5, lost: 1 },
        { id: "b2", played: 4, won: 2 },
      ],
    }),
  );
  const s = stats([v]);
  assert.equal(s.wins, 7);
  assert.equal(s.outcomes, 6);
  assert.equal(s.winRate, (5 / 6) * 100);
  assert.throws(
    () => validateLog(log(undefined, { badminton: [{ played: 2, won: 3 }] })),
    /exceed/,
  );
});
test("streaks include rest and recovery, missing days end streaks", () => {
  const a = [
    log("2026-10-17", { dayType: "rest" }),
    log("2026-10-18", { dayType: "recovery" }),
    log("2026-10-20"),
  ];
  assert.equal(stats(a, a, "2026-10-19").current, 2);
  assert.equal(stats(a, a, "2026-10-20").current, 1);
  assert.equal(stats(a, a, "2026-10-20").best, 2);
});
test("JSON roundtrip detects duplicates and preserves source conflicts", () => {
  const v = validateLog(
    log(undefined, {
      sources: [
        {
          id: "source1",
          field: "water",
          value: "above 4 L",
          source: "conversation",
          note: "backup says 3.5 L",
        },
      ],
      water: 3.5,
    }),
  );
  const backup = JSON.parse(JSON.stringify({ schemaVersion: 1, logs: [v] }));
  const p = importPreview(backup, [v]);
  assert.equal(p.duplicates.length, 1);
  assert.equal(p.new.length, 0);
  backup.logs[0].weight = 80;
  assert.equal(importPreview(backup, [v]).conflicts.length, 1);
  assert.equal(backup.logs[0].sources[0].value, "above 4 L");
  assert.throws(() => importPreview({ logs: [v] }, []), /Unsupported/);
});
test("import rejects unknown fields rather than silently discarding source data", () => {
  assert.throws(
    () =>
      importPreview({
        schemaVersion: 1,
        logs: [{ ...log(), mysteriousHistory: [1] }],
      }),
    /Unrecognized/,
  );
  assert.throws(
    () =>
      validateLog(
        log(undefined, { workouts: [{ name: "unmapped", exercises: [] }] }),
      ),
    /Unrecognized/,
  );
});
test("duplicate clones regenerate all nested IDs", () => {
  const v = validateLog(
    log(undefined, {
      workouts: [{ id: "s1", exercises: [{ id: "e1", name: "Press" }] }],
      version: 3,
    }),
  );
  const d = duplicateLog(v, "2026-10-18");
  assert.notEqual(d.id, v.id);
  assert.notEqual(d.workouts[0].id, "s1");
  assert.notEqual(d.workouts[0].exercises[0].id, "e1");
  assert.equal(d.version, undefined);
  assert.equal(d.date, "2026-10-18");
});
test("ranges, means, targets and CSV protect unknowns and formulas", () => {
  assert.deepEqual(dateRange("previous", "", "", "2026-10-25"), {
    start: "2026-09-01",
    end: "2026-09-30",
  });
  assert.equal(
    stats([log(undefined, { water: 0 }), log("2026-10-18")]).water,
    0,
  );
  assert.throws(() => validateGoals({ water: 31 }), /water/);
  const csv = csvExport([log(undefined, { notes: '=IMPORTXML("bad")' })]);
  assert(csv.includes("'=IMPORTXML"));
  assert(csv.includes('""'));
});
