export const SCHEMA_VERSION = 1;
export const DAILY_NUMBERS = {
  weight: [20, 500],
  waist: [20, 300],
  cardio: [0, 1440],
  water: [0, 30],
  calories: [0, 20000],
  protein: [0, 1000],
  sleep: [0, 24],
  steps: [0, 200000],
  mood: [1, 5],
  energy: [1, 5],
};
export const GOAL_DEFAULTS = {
  water: null,
  calories: null,
  protein: null,
  weeklyActivity: null,
  weeklyBadminton: null,
  weight: null,
  goalDate: "",
  startWeight: null,
};
export const PROPOSED_GOALS = {
  water: 4,
  calories: 2540,
  protein: null,
  weeklyActivity: 4,
  weeklyBadminton: 2,
  weight: 128,
  goalDate: "2027-11-30",
  startWeight: null,
};
export function today() {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  return ["year", "month", "day"]
    .map((k) => p.find((x) => x.type === k).value)
    .join("-");
}
export function id() {
  return (
    globalThis.crypto?.randomUUID?.() ||
    `r-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}
export function emptyLog(date = today()) {
  return {
    id: id(),
    date,
    dayType: "",
    weight: null,
    waist: null,
    cardio: null,
    water: null,
    calories: null,
    protein: null,
    sleep: null,
    steps: null,
    mood: null,
    energy: null,
    notes: "",
    sleepTime: "",
    wakeTime: "",
    sleepQuality: null,
    workoutCompleted: false,
    cardioCompleted: false,
    badmintonPlayed: false,
    nutritionLogged: false,
    supplementsTaken: false,
    waterAchieved: false,
    workouts: [],
    badminton: [],
    meals: [],
    supplements: [],
    sources: [],
  };
}
export function validDate(v) {
  return (
    typeof v === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    !Number.isNaN(Date.parse(v + "T12:00:00Z")) &&
    new Date(v + "T12:00:00Z").toISOString().slice(0, 10) === v
  );
}
export function numberIn(v, min, max, label) {
  if (v == null || v === "") return null;
  if (
    typeof v === "boolean" ||
    !Number.isFinite(Number(v)) ||
    Number(v) < min ||
    Number(v) > max
  )
    throw new Error(`${label} must be between ${min} and ${max}.`);
  return Number(v);
}
export function text(v, max = 4000) {
  if (v == null) return "";
  if (typeof v !== "string") throw new Error("Text fields must contain text.");
  if (v.length > max) throw new Error(`Text exceeds ${max} characters.`);
  return v;
}
export function validateLog(input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Invalid log.");
  const allowed = new Set([
    ...Object.keys(emptyLog("2000-01-01")),
    "createdAt",
    "updatedAt",
    "version",
    "deletedAt",
  ]);
  for (const k of Object.keys(input))
    if (!allowed.has(k))
      throw new Error(
        `Unrecognized field: ${k}. Original data was not imported; use a reviewed migration.`,
      );
  const r = { ...emptyLog(input.date), ...input };
  if (!validDate(r.date)) throw new Error("Choose a valid date.");
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(r.id))
    throw new Error("Invalid record ID.");
  if (!["", "gym", "rest", "recovery", "active"].includes(r.dayType))
    throw new Error("Invalid day type.");
  for (const [k, [min, max]] of Object.entries(DAILY_NUMBERS))
    r[k] = numberIn(r[k], min, max, k);
  r.sleepQuality = numberIn(r.sleepQuality, 1, 5, "Sleep quality");
  for (const k of ["createdAt", "updatedAt", "deletedAt"])
    if (
      r[k] != null &&
      (typeof r[k] !== "string" ||
        !/^\d{4}-\d{2}-\d{2}T/.test(r[k]) ||
        Number.isNaN(Date.parse(r[k])))
    )
      throw new Error("Invalid " + k + " timestamp.");
  if (r.version != null && (!Number.isInteger(r.version) || r.version < 1))
    throw new Error("Invalid record version.");
  r.notes = text(r.notes);
  for (const k of ["sleepTime", "wakeTime"]) {
    r[k] = text(r[k], 5);
    if (r[k] && !/^([01]\d|2[0-3]):[0-5]\d$/.test(r[k]))
      throw new Error("Invalid sleep/wake time.");
  }
  for (const k of [
    "workoutCompleted",
    "cardioCompleted",
    "badmintonPlayed",
    "nutritionLogged",
    "supplementsTaken",
    "waterAchieved",
  ]) {
    if (typeof r[k] !== "boolean") throw new Error(`Invalid ${k} flag.`);
  }
  const numeric = {
    workouts: { duration: [0, 1440], effort: [1, 10] },
    exercises: {
      sets: [1, 100],
      reps: [0, 10000],
      weight: [0, 2000],
      duration: [0, 1440],
    },
    badminton: {
      duration: [0, 1440],
      played: [0, 1000],
      won: [0, 1000],
      lost: [0, 1000],
    },
    meals: {
      quantity: [0, 10000],
      calories: [0, 20000],
      protein: [0, 1000],
      carbs: [0, 2000],
      fat: [0, 1000],
    },
    supplements: { dose: [0, 10000] },
  };
  const strings = {
    workouts: ["type", "notes"],
    exercises: ["name", "equipment", "notes"],
    badminton: ["intensity", "opponent", "notes"],
    meals: ["category", "food", "unit", "notes"],
    supplements: ["name", "unit", "time", "notes"],
    sources: ["field", "value", "source", "note"],
  };
  const ids = new Set([r.id]);
  function children(items, kind) {
    if (!Array.isArray(items) || items.length > 250)
      throw new Error(`Invalid or excessive ${kind}.`);
    return items.map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item))
        throw new Error(`Invalid ${kind} entry.`);
      const known = new Set([
        "id",
        "createdAt",
        "updatedAt",
        ...Object.keys(numeric[kind] || {}),
        ...(strings[kind] || []),
        ...(kind === "workouts" ? ["exercises"] : []),
        ...(kind === "exercises" ? ["pr"] : []),
        ...(kind === "meals" ? ["estimated"] : []),
        ...(kind === "supplements" ? ["taken"] : []),
      ]);
      for (const k of Object.keys(item))
        if (!known.has(k))
          throw new Error(
            `Unrecognized ${kind} field: ${k}. Nothing imported.`,
          );
      const v = { ...item, id: item.id || id() };
      for (const key of ["createdAt", "updatedAt"])
        if (
          v[key] != null &&
          (typeof v[key] !== "string" || Number.isNaN(Date.parse(v[key])))
        )
          throw new Error("Invalid child timestamp.");
      if (!/^[a-zA-Z0-9_-]{1,100}$/.test(v.id) || ids.has(v.id))
        throw new Error("Duplicate or invalid child ID.");
      ids.add(v.id);
      for (const [k, [min, max]] of Object.entries(numeric[kind] || {}))
        v[k] = numberIn(v[k], min, max, k);
      for (const k of ["sets", "reps", "played", "won", "lost"])
        if (v[k] != null && !Number.isInteger(v[k]))
          throw new Error(k + " must be a whole number.");
      for (const k of ["pr", "estimated", "taken"])
        if (k in item && typeof item[k] !== "boolean")
          throw new Error("Invalid " + k + " flag.");
      for (const k of strings[kind] || []) v[k] = text(v[k]);
      if (kind === "workouts")
        v.exercises = children(v.exercises || [], "exercises");
      if (kind === "exercises") v.pr = v.pr === true;
      if (kind === "meals") v.estimated = v.estimated === true;
      if (kind === "supplements") v.taken = v.taken === true;
      if (
        kind === "badminton" &&
        v.played != null &&
        (v.won || 0) + (v.lost || 0) > v.played
      )
        throw new Error("Wins and losses cannot exceed matches played.");
      return v;
    });
  }
  for (const k of ["workouts", "badminton", "meals", "supplements", "sources"])
    r[k] = children(r[k] || [], k);
  return r;
}
export function validateGoals(value) {
  const r = { ...GOAL_DEFAULTS, ...value };
  for (const k of Object.keys(value))
    if (!(k in GOAL_DEFAULTS)) throw new Error(`Unknown goal: ${k}`);
  for (const k of [
    "water",
    "calories",
    "protein",
    "weeklyActivity",
    "weeklyBadminton",
    "weight",
    "startWeight",
  ])
    r[k] = numberIn(
      r[k],
      0,
      k === "calories"
        ? 20000
        : k === "weight" || k === "startWeight"
          ? 500
          : k === "protein"
            ? 1000
            : k === "water"
              ? 30
              : 100,
      k,
    );
  if (r.goalDate && !validDate(r.goalDate))
    throw new Error("Invalid goal date.");
  return r;
}
export function importPreview(input, current = []) {
  if (
    !input ||
    input.schemaVersion !== SCHEMA_VERSION ||
    !Array.isArray(input.logs)
  )
    throw new Error(
      "Unsupported backup format. Use a Surya Fitness HQ v1 export. Historical backups need a reviewed field mapping; no records were changed.",
    );
  if (input.logs.length > 5000)
    throw new Error("Import limited to 5,000 records.");
  const logs = input.logs.map(validateLog),
    seen = new Set(),
    dates = new Set(),
    report = {
      new: [],
      duplicates: [],
      conflicts: [],
      missing: [],
      deleted: [],
      transformations: [
        "Empty numeric fields become null (unknown); supplied values and source notes are preserved.",
      ],
      logs,
    };
  for (const r of logs) {
    if (seen.has(r.id) || dates.has(r.date))
      throw new Error(
        "Backup contains duplicate IDs or dates. Resolve them before import.",
      );
    seen.add(r.id);
    dates.add(r.date);
    if (r.deletedAt) {
      report.deleted.push(r.id);
      continue;
    }
    const old = current.find((x) => x.id === r.id || x.date === r.date);
    if (!old) report.new.push(r.id);
    else {
      const strip = (o) =>
        Array.isArray(o)
          ? o.map(strip)
          : o && typeof o === "object"
            ? Object.fromEntries(
                Object.entries(o)
                  .filter(
                    ([k]) =>
                      ![
                        "updatedAt",
                        "createdAt",
                        "version",
                        "deletedAt",
                      ].includes(k),
                  )
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([k, v]) => [k, strip(v)]),
              )
            : o;
      const clean = (o) => JSON.stringify(strip(o));
      (clean(old) === clean(r) ? report.duplicates : report.conflicts).push(
        r.id,
      );
    }
    report.missing.push({
      id: r.id,
      fields: Object.keys(DAILY_NUMBERS).filter((k) => r[k] == null),
    });
  }
  return report;
}
export function duplicateLog(log, date) {
  const r = JSON.parse(JSON.stringify(log));
  for (const k of ["createdAt", "updatedAt", "deletedAt", "version"])
    delete r[k];
  r.id = id();
  r.date = date;
  for (const type of [
    "workouts",
    "badminton",
    "meals",
    "supplements",
    "sources",
  ])
    for (const x of r[type] || []) {
      x.id = id();
      delete x.createdAt;
      delete x.updatedAt;
      for (const e of x.exercises || []) {
        e.id = id();
        delete e.createdAt;
        delete e.updatedAt;
      }
    }
  return r;
}
export function dateRange(kind, customStart, customEnd, now = today()) {
  const end = now;
  let start;
  const d = new Date(now + "T12:00:00Z");
  if (kind === "custom") return { start: customStart, end: customEnd };
  if (kind === "month") start = now.slice(0, 7) + "-01";
  else if (kind === "previous") {
    const first = new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 12),
    );
    const prev = new Date(first.getTime() - 86400000);
    return {
      start: prev.toISOString().slice(0, 7) + "-01",
      end: prev.toISOString().slice(0, 10),
    };
  } else {
    d.setUTCDate(d.getUTCDate() - (kind === "7" ? 6 : 29));
    start = d.toISOString().slice(0, 10);
  }
  return { start, end };
}
export function inRange(logs, range) {
  return logs
    .filter((x) => !x.deletedAt && x.date >= range.start && x.date <= range.end)
    .sort((a, b) => a.date.localeCompare(b.date));
}
export function average(values) {
  const a = values.filter((x) => x != null && Number.isFinite(x));
  return a.length ? a.reduce((a, b) => a + b, 0) / a.length : null;
}
export function total(values) {
  const a = values.filter((x) => x != null && Number.isFinite(x));
  return a.length ? a.reduce((a, b) => a + b, 0) : null;
}
export function stats(logs, all = logs, now = today()) {
  const b = logs.flatMap((x) => x.badminton),
    w = logs.flatMap((x) => x.workouts),
    weights = logs.filter((x) => x.weight != null),
    known = b.filter((x) => x.won != null && x.lost != null);
  const wins = total(b.map((x) => x.won)),
    outcomes = known.reduce((s, x) => s + x.won + x.lost, 0);
  const days = [
    ...new Set(
      all.filter((x) => !x.deletedAt && x.date <= now).map((x) => x.date),
    ),
  ].sort();
  let best = 0,
    run = 0,
    last = "";
  for (const day of days) {
    run = last && Date.parse(day) - Date.parse(last) === 86400000 ? run + 1 : 1;
    best = Math.max(best, run);
    last = day;
  }
  let current = 0;
  let day = now;
  const yesterday = new Date(Date.parse(now) - 86400000)
    .toISOString()
    .slice(0, 10);
  if (!days.includes(day)) day = yesterday;
  while (days.includes(day)) {
    current++;
    day = new Date(Date.parse(day) - 86400000).toISOString().slice(0, 10);
  }
  return {
    days: logs.length,
    latest: weights.at(-1)?.weight ?? null,
    change:
      weights.length > 1 ? weights.at(-1).weight - weights[0].weight : null,
    water: average(logs.map((x) => x.water)),
    calories: average(logs.map((x) => x.calories)),
    protein: average(logs.map((x) => x.protein)),
    sleep: average(logs.map((x) => x.sleep)),
    cardio: total(logs.map((x) => x.cardio)),
    workoutMinutes: total(w.map((x) => x.duration)),
    sessions: w.length,
    badminton: b.length,
    badmintonMinutes: total(b.map((x) => x.duration)),
    wins,
    winRate: outcomes
      ? (known.reduce((s, x) => s + x.won, 0) / outcomes) * 100
      : null,
    outcomes,
    longest: b.some((x) => x.duration != null)
      ? Math.max(...b.filter((x) => x.duration != null).map((x) => x.duration))
      : null,
    played: total(b.map((x) => x.played)),
    current,
    best,
    prs: w.flatMap((x) => x.exercises).filter((x) => x.pr),
    volume: total(
      w
        .flatMap((x) => x.exercises)
        .filter((x) => x.sets != null && x.reps != null && x.weight != null)
        .map((x) => x.sets * x.reps * x.weight),
    ),
  };
}
export function csvExport(logs) {
  const keys = [
    "id",
    "date",
    "dayType",
    ...Object.keys(DAILY_NUMBERS),
    "notes",
    "createdAt",
    "updatedAt",
  ];
  const quote = (v) => '"' + String(v ?? "").replaceAll('"', '""') + '"';
  return [
    keys.join(","),
    ...logs.map((r) =>
      keys
        .map((k) =>
          quote(
            typeof r[k] === "string" && /^[=+@\-\t\r]/.test(r[k])
              ? "'" + r[k]
              : r[k],
          ),
        )
        .join(","),
    ),
  ].join("\r\n");
}
