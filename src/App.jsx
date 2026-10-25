import React, { useState, useEffect, useRef } from "react";
import { request, isCloud, startSandbox } from "./api.js";
import {
  today,
  emptyLog,
  id,
  stats,
  dateRange,
  inRange,
  GOAL_DEFAULTS,
  PROPOSED_GOALS,
  importPreview,
  duplicateLog,
  csvExport,
  validDate,
  total,
  average,
} from "../shared/domain.js";
import {
  Icon,
  Metric,
  Card,
  Empty,
  Field,
  Chart,
  Bars,
  fmt,
} from "./components/UI.jsx";
import LogForm from "./components/LogForm.jsx";
const NAV = [
  ["overview", "Overview", "grid"],
  ["checkin", "Daily check-in", "plus"],
  ["workouts", "Workout journal", "workout"],
  ["badminton", "Badminton", "racket"],
  ["nutrition", "Nutrition & supplements", "meal"],
  ["progress", "Weight & progress", "weight"],
  ["history", "History & edit logs", "history"],
  ["analytics", "Analytics & reports", "chart"],
  ["goals", "Goals & achievements", "target"],
  ["settings", "Settings & backups", "settings"],
];
function download(name, text, type = "application/json") {
  const u = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
function weekStart(now = today()) {
  const d = new Date(now + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
function weekBars(logs) {
  const m = new Map();
  for (const l of logs) {
    const d = new Date(l.date + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    const key = d.toISOString().slice(0, 10);
    m.set(key, (m.get(key) || 0) + l.workouts.length);
  }
  return [...m].map(([label, value]) => ({
    label: "Week of " + label.slice(5),
    value,
  }));
}
function App() {
  const [page, setPage] = useState("overview"),
    [data, setData] = useState({
      logs: [],
      goals: { ...GOAL_DEFAULTS },
      owner: "",
    }),
    [connected, setConnected] = useState(isCloud()),
    [sandbox, setSandbox] = useState(false),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(null),
    [editor, setEditor] = useState(null),
    [view, setView] = useState(null),
    [saveError, setSaveError] = useState("");
  const [period, setPeriod] = useState("30"),
    [customStart, setCustomStart] = useState(today().slice(0, 7) + "-01"),
    [customEnd, setCustomEnd] = useState(today());
  const pending = useRef(null),
    lock = useRef(false),
    dialogRef = useRef(null),
    lastFocused = useRef(null);
  const range = dateRange(period, customStart, customEnd),
    logs = inRange(data.logs, range),
    active = data.logs.filter((x) => !x.deletedAt),
    summary = stats(logs, active),
    weekLogs = active.filter((x) => x.date >= weekStart() && x.date <= today()),
    ws = stats(weekLogs),
    weekDays = weekLogs.length;
  async function reload() {
    setLoading(true);
    try {
      setData(await request({ action: "load" }));
      setConnected(true);
    } catch (e) {
      setNotice({ error: true, text: e.message });
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (isCloud()) reload();
  }, []);
  useEffect(() => {
    document.title = `${NAV.find((x) => x[0] === page)?.[1]} · Surya Fitness HQ`;
  }, [page]);
  useEffect(() => {
    if (!editor && !view) return;
    lastFocused.current = document.activeElement;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setTimeout(
      () => dialogRef.current?.querySelector("input,button")?.focus(),
      0,
    );
    const handler = (e) => {
      if (e.key === "Escape") {
        if (view) setView(null);
        else if (
          window.confirm("Close this form? Unsaved changes will be lost.")
        )
          setEditor(null);
      }
      if (e.key === "Tab") {
        const elements = [
          ...(dialogRef.current?.querySelectorAll(
            "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary",
          ) || []),
        ].filter((x) => x.getClientRects().length);
        if (!elements.length) return;
        const first = elements[0],
          last = elements.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", handler);
      lastFocused.current?.focus();
    };
  }, [Boolean(editor), Boolean(view)]);
  async function mutate(payload, success) {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setSaveError("");
    const hash = JSON.stringify(payload);
    if (pending.current?.hash !== hash)
      pending.current = { hash, requestId: id() };
    try {
      const result = await request({
        ...payload,
        requestId: pending.current.requestId,
      });
      pending.current = null;
      try {
        const fresh = await request({ action: "load" });
        setData(fresh);
      } catch (e) {
        setNotice({
          error: true,
          text:
            "The operation succeeded, but refreshing failed. Reload before your next edit. " +
            e.message,
        });
        return result;
      }
      setNotice({ text: success });
      return result;
    } catch (e) {
      setNotice({ error: true, text: e.message });
      setSaveError(e.message);
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function quick() {
    if (!connected) {
      setPage("settings");
      setNotice({
        text: "Open your private Apps Script app, or start the unsaved sandbox below.",
      });
      return;
    }
    setSaveError("");
    setEditor(
      structuredClone(active.find((x) => x.date === today()) || emptyLog()),
    );
  }
  function edit(log) {
    setView(null);
    setSaveError("");
    setEditor(structuredClone(log));
  }
  async function save(log) {
    const result = await mutate(
      { action: "save", log, expectedVersion: editor.version ?? null },
      sandbox
        ? "Saved in this sandbox session only. Export before leaving."
        : "Saved to your private Google Sheet.",
    );
    if (result) setEditor(null);
  }
  const newLogButton = (
    <button className="button primary" onClick={quick}>
      <Icon name="plus" size={18} />
      Quick log
    </button>
  );
  const goto = (p) => {
    setPage(p);
    window.scrollTo({ top: 0 });
  };
  const sections = {
    overview: (
      <>
        <div className="welcome">
          <div>
            <span className="eyebrow">BUILD YOUR OWN MOMENTUM</span>
            <h1>
              One day. One better you<span>.</span>
            </h1>
            <p>
              Train with intention. Recover with care. Keep showing up for
              yourself.
            </p>
          </div>
          <div className="today-card">
            <span className="pulse" />
            {new Intl.DateTimeFormat("en-IN", {
              weekday: "long",
              day: "numeric",
              month: "short",
              timeZone: "Asia/Kolkata",
            }).format(new Date())}
          </div>
        </div>
        <div className="metric-grid">
          <Metric
            label="Latest weight in range"
            value={summary.latest}
            unit="kg"
            icon="weight"
            sub={
              summary.change == null
                ? "Record two measurements to see change"
                : `${summary.change > 0 ? "+" : ""}${fmt(summary.change)} kg across this period`
            }
          />
          <Metric
            label="Workout sessions"
            value={summary.sessions}
            icon="workout"
            sub={`${ws.sessions} sessions this week`}
          />
          <Metric
            label="Badminton time"
            value={
              summary.badmintonMinutes == null
                ? null
                : fmt(summary.badmintonMinutes / 60)
            }
            unit="hrs"
            icon="racket"
            sub={`${summary.badminton} sessions recorded`}
          />
          <Metric
            label="Average water"
            value={summary.water == null ? null : fmt(summary.water)}
            unit="L"
            icon="water"
            sub={
              data.goals.water != null
                ? `${data.goals.water} L personal target`
                : "Set your own daily target"
            }
          />
        </div>
        <div className="dashboard-grid">
          <Card
            title="Your weight journey"
            subtitle="Small changes. A longer perspective."
            action={
              <span className="chip">
                {logs.filter((x) => x.weight != null).length} measurements
              </span>
            }
          >
            <Chart logs={logs} field="weight" unit="kg" label="weight" />
          </Card>
          <Card
            title="This week, for you"
            subtitle="Monday–Sunday · rest days count"
          >
            <div className="week-dots">
              {Array.from({ length: 7 }, (_, i) => {
                const d = new Date(weekStart() + "T12:00:00Z");
                d.setUTCDate(d.getUTCDate() + i);
                const iso = d.toISOString().slice(0, 10),
                  log = weekLogs.find((x) => x.date === iso);
                return (
                  <div key={iso}>
                    <span>{["M", "T", "W", "T", "F", "S", "S"][i]}</span>
                    <b
                      className={
                        log ? "done" : iso === today() ? "current" : ""
                      }
                      title={log ? log.dayType || "Logged" : iso}
                    >
                      {log ? <Icon name="check" size={15} /> : d.getUTCDate()}
                    </b>
                  </div>
                );
              })}
            </div>
            <div className="row between">
              <span>{weekDays} of 7 days checked in</span>
              <strong>{Math.round((weekDays / 7) * 100)}%</strong>
            </div>
            <div className="progress-track">
              <i style={{ width: `${(weekDays / 7) * 100}%` }} />
            </div>
            <p className="muted small">
              {summary.current
                ? `${summary.current}-day logging streak. Your best is ${summary.best}.`
                : "A new check-in is always a good place to begin."}
            </p>
            <button className="button secondary full" onClick={quick}>
              Check in for today
              <Icon name="arrow" size={17} />
            </button>
          </Card>
        </div>
        <div className="dashboard-grid">
          <Card
            title="Movement, on your terms"
            subtitle="Recorded minutes in the selected period"
          >
            <Bars
              unit="min"
              items={[
                summary.cardio != null && {
                  label: "Cardio",
                  value: summary.cardio,
                },
                summary.workoutMinutes != null && {
                  label: "Workouts",
                  value: summary.workoutMinutes,
                  color: "#e5e7de",
                },
                summary.badmintonMinutes != null && {
                  label: "Badminton",
                  value: summary.badmintonMinutes,
                  color: "#80b8a4",
                },
              ].filter(Boolean)}
            />
          </Card>
          <Card
            title="Daily foundations"
            subtitle="Averages from days with recorded values"
          >
            <div className="foundation">
              <span>
                <Icon name="meal" />
                Calories{" "}
                <b>
                  {fmt(summary.calories, 0)} <small>kcal</small>
                </b>
              </span>
              <span>
                <Icon name="activity" />
                Protein{" "}
                <b>
                  {fmt(summary.protein)} <small>g</small>
                </b>
              </span>
              <span>
                <Icon name="moon" />
                Sleep{" "}
                <b>
                  {fmt(summary.sleep)} <small>hrs</small>
                </b>
              </span>
            </div>
          </Card>
        </div>
        <div className="dashboard-grid">
          <Card
            title="Intentions & milestones"
            subtitle="Your confirmed targets, at your pace"
          >
            <div className="foundation">
              <span>
                Active days this week{" "}
                <b>
                  {
                    weekLogs.filter(
                      (l) =>
                        l.dayType === "gym" ||
                        l.dayType === "active" ||
                        l.workouts.length ||
                        l.badminton.length,
                    ).length
                  }
                  <small> / {data.goals.weeklyActivity ?? "—"}</small>
                </b>
              </span>
              <span>
                Current / best logging streak{" "}
                <b>
                  {summary.current}
                  <small> / {summary.best} days</small>
                </b>
              </span>
              <span>
                Confirmed weight goal{" "}
                <b>
                  {fmt(data.goals.weight)}
                  <small> kg</small>
                </b>
              </span>
            </div>
            <button className="text-button" onClick={() => goto("goals")}>
              Review goals & achievements <Icon name="arrow" size={15} />
            </button>
          </Card>
          <Card
            title="Recorded performance"
            subtitle="Only the outcomes you know"
          >
            <div className="foundation">
              <span>
                Wins recorded <b>{fmt(summary.wins, 0)}</b>
              </span>
              <span>
                Known-outcome win rate{" "}
                <b>
                  {fmt(summary.winRate)}
                  <small> %</small>
                </b>
              </span>
            </div>
            <h4>Recent personal records</h4>
            {summary.prs.length ? (
              summary.prs.slice(-3).map((e) => (
                <p key={e.id} className="muted small">
                  {e.name} · {fmt(e.weight)} kg · {fmt(e.reps, 0)} reps
                </p>
              ))
            ) : (
              <p className="muted small">
                Mark a documented personal best in your workout journal.
              </p>
            )}
          </Card>
        </div>
        <details className="overview-details">
          <summary>Explore your activity and daily trends</summary>
          <div className="dashboard-grid">
            <Card title="Weekly workout frequency">
              <Bars items={weekBars(logs)} unit="sessions" />
            </Card>
            <Card title="Water intake">
              <Chart
                logs={logs}
                field="water"
                unit="L"
                target={data.goals.water}
              />
            </Card>
            <Card title="Calories vs target">
              <Chart
                logs={logs}
                field="calories"
                unit="kcal"
                target={data.goals.calories}
              />
            </Card>
            <Card title="Badminton performance">
              <Chart
                logs={logs.map((l) => {
                  const s = stats([l]);
                  return { ...l, win: s.winRate };
                })}
                field="win"
                label="win rate"
                unit="%"
              />
            </Card>
          </div>
        </details>
        <Card
          title="Recent check-ins"
          subtitle="Your record. Always editable."
          action={
            <button className="text-button" onClick={() => goto("history")}>
              View history <Icon name="arrow" size={15} />
            </button>
          }
        >
          {logs.length ? (
            <LogRows
              logs={[...logs].reverse().slice(0, 4)}
              onEdit={edit}
              onView={setView}
            />
          ) : (
            <Empty
              text="No check-ins in this date range. Start with just one number or a note."
              action={newLogButton}
            />
          )}
        </Card>
        <div className="gentle">
          <Icon name="heart" />
          <span>Progress includes the days you choose to rest.</span>
        </div>
      </>
    ),
    checkin: (
      <>
        <PageHeading
          title="Make room for a quick check-in."
          description="A date and whatever you remember. That’s enough."
        />
        <Card
          title="Today’s check-in"
          subtitle={
            active.some((x) => x.date === today())
              ? "You already logged today. Add more or edit your existing record."
              : "All fields are optional except the date."
          }
        >
          <Empty
            title="How are you doing today?"
            text="Weight, water, a workout, or a well-earned rest. Capture it in under a minute."
            action={newLogButton}
          />
        </Card>
      </>
    ),
    workouts: <WorkoutPage logs={logs} onEdit={edit} onNew={quick} />,
    badminton: (
      <>
        <PageHeading
          title="Time on court."
          description="Track your sessions. Celebrate the games you actually recorded."
          action={newLogButton}
        />
        <div className="metric-grid">
          <Metric
            label="Court time"
            value={
              summary.badmintonMinutes == null
                ? null
                : fmt(summary.badmintonMinutes / 60)
            }
            unit="hrs"
            icon="racket"
          />
          <Metric
            label="Recorded wins"
            value={summary.wins}
            sub={`${fmt(summary.played, 0)} matches played where recorded`}
          />
          <Metric
            label="Win rate"
            value={summary.winRate == null ? null : fmt(summary.winRate)}
            unit="%"
            sub={`${summary.outcomes} explicitly known outcomes`}
          />
          <Metric label="Longest session" value={summary.longest} unit="min" />
        </div>
        <Card
          title="Court journal"
          subtitle="A blank result is unknown, never a loss."
        >
          {logs.some((x) => x.badminton.length) ? (
            logs.flatMap((l) =>
              l.badminton.map((b) => (
                <div className="journal-row" key={b.id}>
                  <div>
                    <strong>{l.date}</strong>
                    <p>
                      {fmt(b.duration)} min ·{" "}
                      {b.intensity || "Intensity not recorded"}
                    </p>
                    <p className="muted small">
                      {b.opponent} {b.notes}
                    </p>
                  </div>
                  <div>
                    <b>
                      {fmt(b.won, 0)} W / {fmt(b.lost, 0)} L
                    </b>
                    <button className="text-button" onClick={() => edit(l)}>
                      Edit session
                    </button>
                  </div>
                </div>
              )),
            )
          ) : (
            <Empty action={newLogButton} />
          )}
        </Card>
        <div className="dashboard-grid">
          <Card title="Court minutes">
            <Chart
              logs={logs.map((l) => ({
                ...l,
                court: total(l.badminton.map((b) => b.duration)),
              }))}
              field="court"
              label="court minutes"
              unit="min"
            />
          </Card>
          <Card title="Performance">
            <Chart
              logs={logs.map((l) => {
                const k = l.badminton.filter(
                    (b) => b.won != null && b.lost != null,
                  ),
                  n = k.reduce((s, b) => s + b.won + b.lost, 0);
                return {
                  ...l,
                  win: n ? (k.reduce((s, b) => s + b.won, 0) / n) * 100 : null,
                };
              })}
              field="win"
              label="win rate"
              unit="%"
            />
            <p className="muted small">
              Winning streak unavailable: aggregate session totals do not
              establish match sequence.
            </p>
          </Card>
        </div>
      </>
    ),
    nutrition: (
      <>
        <PageHeading
          title="Fuel the days ahead."
          description="Record your meals and supplements without chasing perfect numbers."
          action={newLogButton}
        />
        <div className="metric-grid">
          <Metric
            label="Average calories"
            value={summary.calories == null ? null : fmt(summary.calories, 0)}
            unit="kcal"
            icon="meal"
          />
          <Metric
            label="Average protein"
            value={summary.protein == null ? null : fmt(summary.protein)}
            unit="g"
          />
          <Metric
            label="Meals recorded"
            value={logs.flatMap((x) => x.meals).length}
          />
          <Metric
            label="Supplements taken"
            value={
              logs.flatMap((x) => x.supplements).filter((s) => s.taken).length
            }
            sub="Only explicitly marked doses"
          />
        </div>
        <div className="dashboard-grid">
          <Card title="Calories vs your target">
            <Chart
              logs={logs}
              field="calories"
              unit="kcal"
              target={data.goals.calories}
            />
          </Card>
          <Card title="Protein">
            <Chart
              logs={logs}
              field="protein"
              unit="g"
              target={data.goals.protein}
            />
          </Card>
        </div>
        <Card title="Meals & supplements">
          {logs.some((l) => l.meals.length || l.supplements.length) ? (
            [...logs]
              .reverse()
              .filter((l) => l.meals.length || l.supplements.length)
              .map((l) => (
                <div className="journal-row" key={l.id}>
                  <div>
                    <strong>{l.date}</strong>
                    {l.meals.map((m) => (
                      <p key={m.id}>
                        {m.category} · {m.food || "Unnamed meal"} ·{" "}
                        {fmt(m.quantity)} {m.unit} · {fmt(m.calories, 0)} kcal ·{" "}
                        {fmt(m.protein)} g protein{" "}
                        {m.estimated && <span className="chip">Estimated</span>}
                        <small className="muted"> {m.notes}</small>
                      </p>
                    ))}
                    {l.supplements.map((s) => (
                      <p key={s.id}>
                        {s.name || "Unnamed supplement"} · {fmt(s.dose)}{" "}
                        {s.unit} · {s.time} ·{" "}
                        {s.taken ? "Taken" : "Not marked taken"}{" "}
                        <small>{s.notes}</small>
                      </p>
                    ))}
                  </div>
                  <button className="text-button" onClick={() => edit(l)}>
                    Edit
                  </button>
                </div>
              ))
          ) : (
            <Empty action={newLogButton} />
          )}
        </Card>
      </>
    ),
    progress: (
      <>
        <PageHeading
          title="Look at how far you’re going."
          description="Measurements are information. They’re never a verdict."
          action={newLogButton}
        />
        <div className="metric-grid">
          <Metric
            label="Latest weight in range"
            value={summary.latest}
            unit="kg"
            icon="weight"
          />
          <Metric
            label="Change in range"
            value={summary.change == null ? null : fmt(summary.change)}
            unit="kg"
          />
          <Metric
            label="Weight goal"
            value={data.goals.weight}
            unit="kg"
            sub={data.goals.goalDate || "Confirm your goal in Goals"}
          />
          <Metric
            label="Average sleep"
            value={summary.sleep == null ? null : fmt(summary.sleep)}
            unit="hrs"
            icon="moon"
          />
        </div>
        <div className="dashboard-grid">
          <Card title="Weight trend">
            <Chart logs={logs} field="weight" unit="kg" />
          </Card>
          <Card title="Waist measurements">
            <Chart logs={logs} field="waist" unit="cm" />
          </Card>
          <Card title="Water intake">
            <Chart
              logs={logs}
              field="water"
              unit="L"
              target={data.goals.water}
            />
            <p className="muted small">
              Target achieved on{" "}
              {data.goals.water == null
                ? "—"
                : logs.filter(
                    (l) => l.water != null && l.water >= data.goals.water,
                  ).length}{" "}
              recorded days.
            </p>
          </Card>
          <Card title="Sleep & recovery">
            <Chart logs={logs} field="sleep" unit="hrs" />
          </Card>
        </div>
        <Card title="Measurement history">
          <LogRows logs={[...logs].reverse()} onEdit={edit} onView={setView} />
        </Card>
      </>
    ),
    history: (
      <History
        logs={logs}
        all={data.logs}
        onEdit={edit}
        onView={setView}
        onDelete={async (l) => {
          if (
            window.confirm(
              `Move the ${l.date} log (${l.id}) to trash? You can restore it in Settings.`,
            )
          )
            await mutate(
              { action: "delete", id: l.id, expectedVersion: l.version },
              "Log moved to recoverable trash.",
            );
        }}
        onDuplicate={(l) => {
          setSaveError("");
          setEditor(duplicateLog(l, today()));
        }}
        busy={busy}
      />
    ),
    analytics: (
      <Analytics
        logs={logs}
        summary={summary}
        goals={data.goals}
        range={range}
      />
    ),
    goals: (
      <Goals
        goals={data.goals}
        logs={logs}
        all={active}
        summary={summary}
        busy={busy}
        enabled={connected}
        onSave={(g) =>
          mutate(
            { action: "goals", goals: g },
            sandbox
              ? "Goals saved for this sandbox session only."
              : "Goals saved to Google Sheets.",
          )
        }
      />
    ),
    settings: (
      <Settings
        data={data}
        connected={connected}
        sandbox={sandbox}
        busy={busy}
        onSandbox={async () => {
          startSandbox();
          setSandbox(true);
          await reload();
          setNotice({
            text: "Unsaved sandbox started. Data disappears on refresh. Use Export JSON before leaving.",
          });
        }}
        onReload={reload}
        mutate={mutate}
        notify={setNotice}
      />
    ),
  };
  return (
    <div className="app">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            goto("overview");
          }}
        >
          <span className="brand-mark">
            <Icon name="activity" size={25} />
          </span>
          <span>
            SURYA<span className="brand-sub">FITNESS HQ</span>
          </span>
        </a>
        <p className="nav-label">YOUR COMMAND CENTRE</p>
        <nav aria-label="Main navigation">
          {NAV.map(([key, label, icon]) => (
            <button
              key={key}
              className={page === key ? "active" : ""}
              onClick={() => goto(key)}
              aria-current={page === key ? "page" : undefined}
            >
              <Icon name={icon} size={19} />
              <span>{label}</span>
              {page === key && <i />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <Icon name="heart" size={19} />
            <p>
              Consistency is personal.
              <br />
              <strong>Make it yours.</strong>
            </p>
          </div>
          <div className="profile">
            <span>S</span>
            <div>
              <strong>Surya</strong>
              <small>
                {isCloud()
                  ? "Private Google workspace"
                  : sandbox
                    ? "Unsaved sandbox"
                    : "Cloud setup required"}
              </small>
            </div>
            <Icon name="settings" size={16} />
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            Your space <Icon name="chevron" size={13} />
            <strong>{NAV.find((x) => x[0] === page)[1]}</strong>
          </div>
          <div className="top-actions">
            <span className={"connection " + (isCloud() ? "live" : "")}>
              <i />
              {isCloud()
                ? "Google Sheets"
                : sandbox
                  ? "Unsaved sandbox"
                  : "Not connected"}
            </span>
            <button
              className="avatar"
              onClick={() => goto("settings")}
              aria-label="Open settings"
            >
              S
            </button>
          </div>
        </header>
        <main className="main">
          <div className="page-toolbar">
            <div className="section-label">
              <Icon name={NAV.find((x) => x[0] === page)[2]} size={18} />
              {NAV.find((x) => x[0] === page)[1]}
            </div>
            <div className="toolbar-actions">
              <select
                aria-label="Date range"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
              >
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
                <option value="month">This month</option>
                <option value="previous">Previous month</option>
                <option value="custom">Custom range</option>
              </select>
              {page !== "checkin" && newLogButton}
            </div>
          </div>
          {period === "custom" && (
            <div className="custom-range">
              <Field
                label="From"
                type="date"
                value={customStart}
                onChange={setCustomStart}
              />
              <Field
                label="To"
                type="date"
                value={customEnd}
                onChange={setCustomEnd}
              />
              {(!validDate(customStart) ||
                !validDate(customEnd) ||
                customStart > customEnd) && (
                <p role="alert">Select a valid date range.</p>
              )}
            </div>
          )}
          {!isCloud() && (
            <div className={"connection-banner " + (sandbox ? "sandbox" : "")}>
              <Icon name="cloud" />
              <div>
                <strong>
                  {sandbox
                    ? "Unsaved sandbox · refresh clears all entries"
                    : "Private cloud setup is required"}
                </strong>
                <span>
                  {sandbox
                    ? "Try the interface safely. Export anything you want to keep."
                    : "Connect Google Sheets through your owner-only Apps Script deployment to save across devices."}
                </span>
              </div>
              <button onClick={() => goto("settings")} className="text-button">
                {sandbox ? "Export & settings" : "Set up cloud"}
                <Icon name="arrow" size={15} />
              </button>
            </div>
          )}
          {notice && (
            <div
              className={"notice " + (notice.error ? "error" : "")}
              role={notice.error ? "alert" : "status"}
            >
              <span>{notice.text}</span>
              <button
                className="icon-button"
                aria-label="Dismiss message"
                onClick={() => setNotice(null)}
              >
                <Icon name="close" size={16} />
              </button>
            </div>
          )}
          {loading ? (
            <div className="loading">Loading your private records…</div>
          ) : (
            sections[page]
          )}
          <footer className="footer">
            <span>SURYA FITNESS HQ</span>
            <span>Small steps. Lasting change.</span>
            <span>Dates · Asia/Kolkata</span>
          </footer>
        </main>
      </div>
      {(editor || view) && (
        <div className="modal-backdrop">
          <div
            className="modal"
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={editor ? "Daily log editor" : "Daily log details"}
          >
            {editor ? (
              <LogForm
                key={editor.id}
                initial={editor}
                busy={busy}
                error={saveError}
                onSave={save}
                onCancel={() => {
                  if (
                    !busy &&
                    window.confirm(
                      "Close this form? Unsaved changes will be lost.",
                    )
                  )
                    setEditor(null);
                }}
              />
            ) : (
              <div className="detail">
                <div className="row between">
                  <h2>{view.date}</h2>
                  <button
                    className="icon-button"
                    aria-label="Close details"
                    onClick={() => setView(null)}
                  >
                    <Icon name="close" />
                  </button>
                </div>
                <p>
                  {view.dayType || "Day type not recorded"} · updated{" "}
                  {view.updatedAt || "not yet saved"}
                </p>
                <div className="detail-grid">
                  {Object.entries({
                    weight: "Weight · kg",
                    water: "Water · L",
                    calories: "Calories",
                    protein: "Protein · g",
                    sleep: "Sleep · hours",
                    cardio: "Cardio · min",
                    steps: "Steps",
                    waist: "Waist · cm",
                  }).map(([k, label]) => (
                    <div key={k}>
                      <small>{label}</small>
                      <strong>{fmt(view[k])}</strong>
                    </div>
                  ))}
                </div>
                <p>{view.notes}</p>
                {[
                  "workouts",
                  "badminton",
                  "meals",
                  "supplements",
                  "sources",
                ].map(
                  (k) =>
                    view[k].length > 0 && (
                      <section key={k}>
                        <h3>{k}</h3>
                        <pre>{JSON.stringify(view[k], null, 2)}</pre>
                      </section>
                    ),
                )}
                <button className="button primary" onClick={() => edit(view)}>
                  Edit this record
                  <Icon name="edit" size={16} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
function PageHeading({ title, description, action }) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        <p className="muted">{description}</p>
      </div>
      {action}
    </div>
  );
}
function LogRows({ logs, onEdit, onView }) {
  if (!logs.length)
    return (
      <Empty
        title="No records in this period"
        text="Try another date range or log your first day."
      />
    );
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Your day</th>
            <th>Weight</th>
            <th>Water</th>
            <th>Calories</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((l) => (
            <tr key={l.id}>
              <td>
                <button className="text-button" onClick={() => onView(l)}>
                  {l.date}
                </button>
              </td>
              <td>
                <span className={"day-chip " + l.dayType}>
                  {l.dayType || "Not recorded"}
                </span>
                {l.sources.length > 0 && (
                  <span title="Source notes require review"> ◇</span>
                )}
              </td>
              <td>
                {fmt(l.weight)}
                {l.weight != null ? " kg" : ""}
              </td>
              <td>
                {fmt(l.water)}
                {l.water != null ? " L" : ""}
              </td>
              <td>{fmt(l.calories, 0)}</td>
              <td>
                <button className="text-button" onClick={() => onEdit(l)}>
                  <Icon name="edit" size={14} />
                  Edit
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function History({ logs, onEdit, onView, onDelete, onDuplicate, busy }) {
  const [search, setSearch] = useState(""),
    [type, setType] = useState(""),
    [sort, setSort] = useState("desc"),
    [limit, setLimit] = useState(20);
  const filtered = logs
    .filter(
      (l) =>
        (!type || type === "badminton"
          ? !type || l.badminton.length > 0 || l.badmintonPlayed
          : type === "workout"
            ? l.workouts.length > 0 || l.workoutCompleted
            : l.dayType === type) &&
        JSON.stringify(l).toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "asc"
        ? a.date.localeCompare(b.date)
        : b.date.localeCompare(a.date),
    );
  return (
    <>
      <PageHeading
        title="Your history, in your hands."
        description="View, edit, duplicate, or recoverably delete any day. The date range above applies here."
      />
      <Card title="All check-ins">
        <div className="history-filters">
          <Field
            label="Search notes, exercises, meals…"
            value={search}
            onChange={(v) => {
              setSearch(v);
              setLimit(20);
            }}
            placeholder="Search your records"
          />
          <Field
            label="Activity filter"
            value={type}
            onChange={(v) => {
              setType(v);
              setLimit(20);
            }}
            options={[
              { value: "", label: "All activities" },
              { value: "workout", label: "Workout recorded" },
              { value: "gym", label: "Gym day" },
              { value: "badminton", label: "Badminton" },
              { value: "rest", label: "Rest day" },
              { value: "recovery", label: "Recovery day" },
            ]}
          />
          <Field
            label="Sort"
            value={sort}
            onChange={setSort}
            options={[
              { value: "desc", label: "Newest first" },
              { value: "asc", label: "Oldest first" },
            ]}
          />
        </div>
        <p className="muted small">
          {filtered.length} records · blank values mean unknown
        </p>
        {filtered.slice(0, limit).map((l) => (
          <div className="history-item" key={l.id}>
            <div className="row between">
              <div>
                <strong>{l.date}</strong>
                <span className={"day-chip " + l.dayType}>
                  {l.dayType || "Not recorded"}
                </span>
                <p className="muted small">
                  {fmt(l.weight)} kg · {fmt(l.water)} L · {fmt(l.calories, 0)}{" "}
                  kcal · {l.workouts.length} workouts · {l.badminton.length}{" "}
                  court sessions
                </p>
              </div>
              <span className="muted tiny">Revision {l.version}</span>
            </div>
            {l.notes && <p>{l.notes}</p>}
            {l.sources.length > 0 && (
              <p className="review-flag">
                ◇ {l.sources.length} source notes / conflicts to review
              </p>
            )}
            <div className="row wrap">
              <button
                className="button secondary compact"
                onClick={() => onView(l)}
              >
                View
              </button>
              <button
                className="button secondary compact"
                onClick={() => onEdit(l)}
              >
                Edit record
              </button>
              <button className="text-button" onClick={() => onDuplicate(l)}>
                Duplicate to another date
              </button>
              <button
                className="text-button danger"
                disabled={busy}
                onClick={() => onDelete(l)}
              >
                Move to trash
              </button>
            </div>
          </div>
        ))}
        {!filtered.length && (
          <Empty
            title="No matching days"
            text="Change your search, filters, or date range."
          />
        )}
        {filtered.length > limit && (
          <button
            className="button secondary full"
            onClick={() => setLimit((x) => x + 20)}
          >
            Load 20 more
          </button>
        )}
      </Card>
    </>
  );
}
function WorkoutPage({ logs, onEdit, onNew }) {
  const [exercise, setExercise] = useState("");
  const sessions = logs.flatMap((l) =>
      l.workouts.map((w) => ({ ...w, log: l })),
    ),
    exercises = sessions.flatMap((w) => w.exercises),
    names = [...new Set(exercises.map((e) => e.name).filter(Boolean))];
  return (
    <>
      <PageHeading
        title="Put the work on record."
        description="Every session, every variation. No invented sets or reps."
        action={
          <button className="button primary" onClick={onNew}>
            <Icon name="plus" />
            Log a session
          </button>
        }
      />
      <div className="metric-grid">
        <Metric label="Sessions" value={sessions.length} icon="workout" />
        <Metric
          label="Workout minutes"
          value={total(sessions.map((x) => x.duration))}
          unit="min"
        />
        <Metric
          label="Personal records marked"
          value={exercises.filter((x) => x.pr).length}
        />
        <Metric
          label="Documented volume"
          value={fmt(
            total(
              exercises
                .filter(
                  (x) => x.sets != null && x.reps != null && x.weight != null,
                )
                .map((x) => x.sets * x.reps * x.weight),
            ),
            0,
          )}
          unit="kg·reps"
          sub="Only complete sets × reps × kg"
        />
      </div>
      <div className="dashboard-grid">
        <Card title="Workout frequency">
          <Bars items={weekBars(logs)} unit="sessions" />
        </Card>
        <Card title="Exercise progression">
          <Field
            label="Exercise"
            value={exercise}
            onChange={setExercise}
            options={[{ value: "", label: "Select an exercise" }, ...names]}
          />
          <Chart
            logs={logs.map((l) => {
              const e = l.workouts
                .flatMap((w) => w.exercises)
                .filter((e) => e.name === exercise && e.weight != null);
              return {
                ...l,
                lift: e.length ? Math.max(...e.map((x) => x.weight)) : null,
              };
            })}
            field="lift"
            label="documented exercise weight"
            unit="kg"
          />
          <p className="muted small">
            Highest recorded weight per day for the exact exercise name;
            variations should use distinct names.
          </p>
        </Card>
      </div>
      <Card title="Session journal">
        {sessions.length ? (
          sessions
            .slice()
            .reverse()
            .map((w) => (
              <div className="journal-row" key={w.id}>
                <div>
                  <span className="eyebrow">{w.log.date}</span>
                  <h3>{w.type || "Untitled session"}</h3>
                  <p className="muted small">
                    {fmt(w.duration)} minutes · effort {fmt(w.effort)}/10
                  </p>
                  {w.exercises.map((e) => (
                    <p key={e.id}>
                      {e.name || "Unnamed exercise"} · {fmt(e.sets, 0)} sets ×{" "}
                      {fmt(e.reps, 0)} reps · {fmt(e.weight)} kg{" "}
                      {e.pr && <span className="chip">Personal record</span>}
                      <small className="muted">
                        {" "}
                        {e.equipment} {e.notes}
                      </small>
                    </p>
                  ))}
                  <p>{w.notes}</p>
                </div>
                <button className="text-button" onClick={() => onEdit(w.log)}>
                  Edit session
                </button>
              </div>
            ))
        ) : (
          <Empty
            action={
              <button className="button primary" onClick={onNew}>
                Log a session
              </button>
            }
          />
        )}
      </Card>
    </>
  );
}
function Analytics({ logs, summary: s, goals, range }) {
  const supplements = logs.flatMap((l) => l.supplements),
    taken = supplements.filter((x) => x.taken).length,
    groups = new Map();
  for (const l of logs)
    for (const w of l.workouts)
      groups.set(
        w.type || "Unspecified",
        (groups.get(w.type || "Unspecified") || 0) + 1,
      );
  return (
    <>
      <PageHeading
        title="The bigger picture."
        description={`${range.start} → ${range.end} · Insights from recorded data only.`}
      />
      <div className="dashboard-grid">
        <Card title="Logging review" subtitle="For your selected period">
          <p className="review-text">
            You checked in on <strong>{s.days} days</strong>, recorded{" "}
            <strong>{s.sessions} workout sessions</strong> and{" "}
            <strong>{s.badminton} badminton sessions</strong>.{" "}
            {s.change != null
              ? `Your recorded weight changed by ${s.change > 0 ? "+" : ""}${fmt(s.change)} kg.`
              : "Two weight measurements are needed to describe a change."}
          </p>
          <p className="muted">
            These records show what you logged, not everything you did. They
            don’t establish what caused a change.
          </p>
          <div className="row between">
            <span>Current logging streak</span>
            <b>{s.current} days</b>
          </div>
          <div className="row between">
            <span>Best logging streak</span>
            <b>{s.best} days</b>
          </div>
        </Card>
        <Card title="Weekly workout frequency">
          <Bars items={weekBars(logs)} unit="sessions" />
        </Card>
        <Card title="Sessions by type / muscle group">
          <Bars
            items={[...groups].map(([label, value]) => ({ label, value }))}
          />
        </Card>
        <Card title="Supplement follow-through">
          <p className="big-number">
            {supplements.length
              ? Math.round((taken / supplements.length) * 100) + "%"
              : "—"}
          </p>
          <p className="muted">
            {taken} of {supplements.length} entered doses marked taken. Unlogged
            doses are unknown.
          </p>
          <h4>Recent personal records</h4>
          {s.prs.length ? (
            s.prs.slice(-5).map((e) => (
              <p key={e.id}>
                {e.name} · {fmt(e.weight)} kg · {fmt(e.reps, 0)} reps
              </p>
            ))
          ) : (
            <p className="muted">No personal records marked in this range.</p>
          )}
        </Card>
        <Card title="Water consistency">
          <Chart logs={logs} field="water" unit="L" target={goals.water} />
        </Card>
        <Card title="Calories vs target">
          <Chart
            logs={logs}
            field="calories"
            unit="kcal"
            target={goals.calories}
          />
        </Card>
        <Card title="Cardio minutes">
          <Chart logs={logs} field="cardio" unit="min" />
        </Card>
        <Card title="Badminton minutes">
          <Chart
            logs={logs.map((l) => ({
              ...l,
              court: total(l.badminton.map((b) => b.duration)),
            }))}
            field="court"
            unit="min"
          />
        </Card>
      </div>
    </>
  );
}
function Goals({ goals, logs, all, summary, busy, enabled, onSave }) {
  const [draft, setDraft] = useState(goals);
  useEffect(() => setDraft(goals), [goals]);
  const week = all.filter((l) => l.date >= weekStart() && l.date <= today()),
    activityDays = week.filter(
      (l) =>
        l.dayType === "gym" ||
        l.dayType === "active" ||
        l.workouts.length ||
        l.badminton.length,
    ).length;
  const badminton = week.flatMap((l) => l.badminton).length;
  const missions = [
    {
      label: "Active days this week",
      value: activityDays,
      target: goals.weeklyActivity,
    },
    {
      label: "Court sessions this week",
      value: badminton,
      target: goals.weeklyBadminton,
    },
    { label: "Days checked in this week", value: week.length, target: 7 },
  ];
  const weightProgress =
    goals.startWeight != null &&
    goals.weight != null &&
    summary.latest != null &&
    goals.startWeight !== goals.weight
      ? Math.max(
          0,
          Math.min(
            100,
            ((goals.startWeight - summary.latest) /
              (goals.startWeight - goals.weight)) *
              100,
          ),
        )
      : null;
  return (
    <>
      <PageHeading
        title="A direction, not a deadline."
        description="Choose goals that fit your life. Rest and recovery always belong."
      />
      <div className="dashboard-grid">
        <Card title="This week’s intentions">
          {missions.map((m) => (
            <div className="mission" key={m.label}>
              <div className="row between">
                <span>{m.label}</span>
                <b>
                  {m.value} / {m.target ?? "—"}
                </b>
              </div>
              <div className="progress-track">
                <i
                  style={{
                    width: m.target
                      ? Math.min(100, (m.value / m.target) * 100) + "%"
                      : "0%",
                  }}
                />
              </div>
            </div>
          ))}
          <p className="muted small">
            Targets are optional. A rest day still counts as a check-in.
          </p>
        </Card>
        <Card title="Milestones that matter">
          <div className="achievements">
            {[
              [
                all.length >= 1,
                "Your first check-in",
                "A little time for yourself.",
              ],
              [
                all.length >= 7,
                "Seven days recorded",
                "Building your own rhythm.",
              ],
              [
                summary.best >= 7,
                "A week-long logging streak",
                "Rest days included.",
              ],
              [
                all.some(
                  (l) => l.dayType === "rest" || l.dayType === "recovery",
                ),
                "Recovery is progress",
                "You made space to recharge.",
              ],
              [
                all.some((l) =>
                  l.workouts.some((w) => w.exercises.some((e) => e.pr)),
                ),
                "A personal best",
                "A recorded milestone worth noticing.",
              ],
            ].map(([earned, title, text]) => (
              <div className={earned ? "earned" : ""} key={title}>
                <Icon name={earned ? "check" : "target"} size={22} />
                <span>
                  <strong>{title}</strong>
                  <small>{earned ? text : "Ready when you are."}</small>
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <Card
        title="Your personal targets"
        subtitle="None are medical recommendations. Only confirmed values are saved."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSave(draft);
          }}
        >
          <div className="form-grid">
            {[
              ["water", "Water · L/day"],
              ["calories", "Calories · kcal/day"],
              ["protein", "Protein · g/day"],
              ["weeklyActivity", "Active days / week"],
              ["weeklyBadminton", "Badminton sessions / week"],
              ["weight", "Goal weight · kg"],
              ["startWeight", "Confirmed starting weight · kg"],
            ].map(([k, label]) => (
              <Field
                key={k}
                label={label}
                type="number"
                min="0"
                step="any"
                value={draft[k]}
                onChange={(v) => setDraft((x) => ({ ...x, [k]: v }))}
              />
            ))}
            <Field
              label="Goal date (optional)"
              type="date"
              value={draft.goalDate}
              onChange={(v) => setDraft((x) => ({ ...x, goalDate: v }))}
            />
          </div>
          <div className="notice">
            <span>
              Previously discussed: 128 kg by November 2027, 4 L water,
              approximately 2,540–2,600 kcal. These remain proposals until you
              save them. The historical profile and later log measurements
              reportedly differ; review the original backup before changing
              either. Neither is imported here.
            </span>
          </div>
          <div className="row wrap">
            <button
              type="button"
              className="button secondary"
              onClick={() => setDraft({ ...PROPOSED_GOALS })}
            >
              Review proposed targets
            </button>
            <button className="button primary" disabled={busy || !enabled}>
              {busy ? "Saving…" : "Confirm & save targets"}
            </button>
          </div>
        </form>
        {weightProgress != null && (
          <div className="mission">
            <p>
              Weight goal progress · {Math.round(weightProgress)}% from your
              confirmed starting weight
            </p>
            <div className="progress-track">
              <i style={{ width: weightProgress + "%" }} />
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
function Settings({
  data,
  connected,
  sandbox,
  busy,
  onSandbox,
  onReload,
  mutate,
  notify,
}) {
  const [preview, setPreview] = useState(null),
    [skip, setSkip] = useState(false),
    [report, setReport] = useState(null),
    [url, setUrl] = useState("");
  async function exportJSON() {
    try {
      const backup = await request({ action: "export" });
      download(
        "surya-fitness-" + today() + ".json",
        JSON.stringify(backup, null, 2),
      );
      notify({
        text: "Full backup exported, including recoverable deleted records and goals.",
      });
    } catch (e) {
      notify({ error: true, text: e.message });
    }
  }
  async function inspect(file) {
    setPreview(null);
    setReport(null);
    setSkip(false);
    if (!file) return;
    try {
      if (file.size > 10 * 1024 * 1024)
        throw new Error("Backup exceeds 10 MB. Use a smaller reviewed backup.");
      const backup = JSON.parse(await file.text());
      const report = importPreview(backup, data.logs);
      setPreview({ backup, report });
    } catch (e) {
      notify({ error: true, text: e.message });
    }
  }
  return (
    <>
      <PageHeading
        title="Your data stays yours."
        description="Private by default. Portable whenever you need it."
      />
      <div className="dashboard-grid">
        <Card
          title="Cloud connection"
          subtitle={isCloud() ? data.owner : "Google Sheets + Apps Script"}
        >
          {isCloud() ? (
            <>
              <p className="status-good">
                <Icon name="check" />
                Connected through the private Apps Script bridge.
              </p>
              <button className="button secondary" onClick={onReload}>
                Reload from Google Sheets
              </button>
            </>
          ) : (
            <>
              <p>
                This public interface cannot access your private Sheet. Deploy
                the generated Apps Script bundle to use the authenticated app.
              </p>
              <ol className="setup-steps">
                <li>Create a private Google Sheet.</li>
                <li>Open Extensions → Apps Script.</li>
                <li>Copy the generated Code.gs, Index.html and manifest.</li>
                <li>
                  Run initialize, authorize, then deploy for{" "}
                  <strong>Only myself</strong>.
                </li>
                <li>Embed the /exec app URL in Google Sites.</li>
              </ol>
              <a
                className="text-button"
                href="https://github.com/Yashaswisurya/Yashaswi-Surya-Workout-Repo/blob/main/docs/DEPLOYMENT.md"
                target="_blank"
                rel="noreferrer"
              >
                Read exact setup instructions <Icon name="arrow" size={15} />
              </a>
              <Field
                label="Your private Apps Script /exec URL"
                value={url}
                onChange={setUrl}
                placeholder="https://script.google.com/macros/s/…/exec"
              />
              <button
                className="button secondary"
                disabled={
                  !/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(
                    url,
                  )
                }
                onClick={() =>
                  window.open(url, "_blank", "noopener,noreferrer")
                }
              >
                Open private cloud app
              </button>
              {!sandbox && (
                <div className="sandbox-choice">
                  <p className="muted small">
                    Want to explore first? The sandbox uses temporary memory. It
                    clears on refresh and is not cloud storage.
                  </p>
                  <button className="button secondary" onClick={onSandbox}>
                    Try unsaved sandbox
                  </button>
                </div>
              )}
            </>
          )}
        </Card>
        <Card
          title="Backups & portability"
          subtitle="Keep a copy before bulk changes"
        >
          <div className="backup-actions">
            <button
              className="button secondary"
              disabled={!connected || busy}
              onClick={exportJSON}
            >
              <Icon name="download" />
              Export full JSON backup
            </button>
            <button
              className="button secondary"
              disabled={!connected}
              onClick={() =>
                download(
                  "surya-daily-summary.csv",
                  csvExport(data.logs.filter((l) => !l.deletedAt)),
                  "text/csv",
                )
              }
            >
              <Icon name="download" />
              Export daily summary CSV
            </button>
            <button
              className="button secondary"
              disabled={!isCloud() || busy}
              onClick={async () => {
                const result = await mutate(
                  { action: "driveBackup" },
                  "Private backup created in your Google Drive.",
                );
                if (result)
                  notify({
                    text: "Backup created. Find surya-fitness-*.json in your Google Drive.",
                  });
              }}
            >
              <Icon name="cloud" />
              Create private Drive backup
            </button>
          </div>
          <p className="muted small">
            JSON contains complete nested records. CSV is a daily summary, not a
            full restore file. Drive backups are user-triggered and remain
            private.
          </p>
          <a
            className="text-button"
            href="https://github.com/Yashaswisurya/Yashaswi-Surya-Workout-Repo/blob/main/docs/DATA-AND-RECOVERY.md"
            target="_blank"
            rel="noreferrer"
          >
            Backup & recovery guide
          </a>
        </Card>
      </div>
      <Card
        title="Import with a review first"
        subtitle="No automatic overwrites. Your existing records are protected."
      >
        <p>
          Historical HTML and merged JSON were not supplied. Provide the
          original backup for a reviewed migration. The dates described in the
          brief have not been invented or imported.
        </p>
        <label className="upload">
          Choose a Fitness HQ v1 JSON backup
          <input
            type="file"
            accept="application/json,.json"
            disabled={!connected || busy}
            onChange={(e) => inspect(e.target.files[0])}
          />
        </label>
        {preview && (
          <div className="import-preview">
            <h4>Import preview · nothing changed yet</h4>
            <p>
              {preview.report.new.length} new ·{" "}
              {preview.report.duplicates.length} duplicate ·{" "}
              {preview.report.conflicts.length} conflicting ·{" "}
              {preview.report.deleted.length} deleted records skipped
            </p>
            <p className="muted small">
              Existing IDs or dates are never overwritten. Goals and audit
              metadata stay in the backup; confirm targets separately in Goals.
              Missing values remain unknown.
            </p>
            {preview.report.conflicts.length > 0 && (
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={skip}
                  onChange={(e) => setSkip(e.target.checked)}
                />
                I reviewed the conflicts. Skip conflicting entries and preserve
                existing records.
              </label>
            )}
            <button
              className="button primary"
              disabled={
                busy ||
                !preview.report.new.length ||
                Boolean(preview.report.conflicts.length && !skip)
              }
              onClick={async () => {
                if (
                  !window.confirm(
                    `Import ${preview.report.new.length} new records? Existing and deleted records will not be overwritten.`,
                  )
                )
                  return;
                const result = await mutate(
                  {
                    action: "import",
                    backup: preview.backup,
                    conflictPolicy: "skip",
                  },
                  "Import completed. Download the report for details.",
                );
                if (result) {
                  setReport(result);
                  setPreview(null);
                }
              }}
            >
              Confirm import of new records
            </button>
            <details>
              <summary>Missing values & transformations</summary>
              <pre>
                {JSON.stringify(
                  {
                    missing: preview.report.missing,
                    transformations: preview.report.transformations,
                  },
                  null,
                  2,
                )}
              </pre>
            </details>
          </div>
        )}
        {report && (
          <div className="notice">
            <span>
              {report.imported} imported · {report.skipped} skipped
            </span>
            <button
              className="text-button"
              onClick={() =>
                download(
                  "surya-import-report.json",
                  JSON.stringify(report, null, 2),
                )
              }
            >
              Download import report
            </button>
          </div>
        )}
      </Card>
      <Card
        title="Recoverable trash"
        subtitle="Deleted logs retain their nested records. Restore a day without affecting other days."
      >
        {data.logs
          .filter((l) => l.deletedAt)
          .map((l) => (
            <div className="journal-row" key={l.id}>
              <div>
                <strong>{l.date}</strong>
                <p className="muted small">
                  Deleted {l.deletedAt} · {l.id}
                </p>
              </div>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => {
                  if (window.confirm(`Restore the ${l.date} record?`))
                    mutate(
                      {
                        action: "restore",
                        id: l.id,
                        expectedVersion: l.version,
                      },
                      "Record restored.",
                    );
                }}
              >
                Restore log
              </button>
            </div>
          ))}
        {!data.logs.some((l) => l.deletedAt) && (
          <p className="muted">No deleted records.</p>
        )}
      </Card>
    </>
  );
}
export default App;
