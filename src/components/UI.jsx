import React from "react";
export function Icon({ name, size = 20 }) {
  const paths = {
    grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
    plus: "M12 5v14 M5 12h14",
    activity: "M2 12h5l3-8 4 16 3-8h5",
    workout: "M3 8v8 M6 5v14 M6 12h12 M18 5v14 M21 8v8",
    racket: "M15 3c-4-2-9 3-7 7s8 2 10-1 0-5-3-6z M9 11l-6 9 M3 18l3 2",
    meal: "M4 3v7c0 3 4 3 4 0V3 M6 3v18 M17 3c-5 5-3 10 1 10 M18 3v18",
    weight: "M5 7h14l2 14H3L5 7z M8 7a4 4 0 018 0 M12 10v4",
    history: "M3 11a9 9 0 119 10 M3 4v7h7 M12 7v5l3 2",
    chart: "M4 3v18h17 M8 16v-4 M13 16V8 M18 16V4",
    target: "M21 12a9 9 0 11-3-7 M17 12a5 5 0 11-5-5 M12 12l9-9",
    settings: "M4 7h16 M4 17h16 M8 4v6 M16 14v6",
    arrow: "M5 12h14 M14 7l5 5-5 5",
    check: "M5 12l4 4L19 6",
    close: "M6 6l12 12 M18 6L6 18",
    download: "M12 3v12 M7 10l5 5 5-5 M4 17v4h16v-4",
    water: "M12 3S5 11 5 15a7 7 0 0014 0c0-4-7-12-7-12z",
    moon: "M20 15A9 9 0 019 3a9 9 0 1011 12",
    cloud: "M6 18a5 5 0 01-1-10 7 7 0 0113-1 5 5 0 010 11H6z",
    chevron: "M9 5l7 7-7 7",
    trash: "M3 6h18 M9 6V3h6v3 M6 6l1 15h10l1-15 M10 10v7 M14 10v7",
    edit: "M4 16L16 4l4 4L8 20H4v-4z",
    heart: "M12 21S2 15 2 8a5 5 0 0110-2 5 5 0 0110 2c0 7-10 13-10 13z",
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] || paths.activity} />
    </svg>
  );
}
export function Metric({ label, value, unit, sub, icon }) {
  return (
    <div className="metric">
      <div className="metric-label">
        {label}
        <Icon name={icon || "activity"} size={17} />
      </div>
      <div className="metric-value">
        {value ?? "—"} <small>{value != null ? unit : ""}</small>
      </div>
      <div className="muted small">{sub || "Based on recorded data"}</div>
    </div>
  );
}
export function Card({ title, subtitle, children, action, className = "" }) {
  return (
    <section className={"card " + className}>
      <div className="card-head">
        <div>
          <h3>{title}</h3>
          {subtitle && <p className="muted small">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
export function Empty({
  title = "A fresh start, at your pace.",
  text = "Your recorded progress will appear here.",
  action,
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon name="activity" size={26} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
export function Field({
  label,
  value,
  onChange,
  type = "text",
  min,
  max,
  step,
  options,
  required,
  placeholder,
}) {
  const props = {
    value: value ?? "",
    onChange: (e) =>
      onChange(
        type === "number"
          ? e.target.value === ""
            ? null
            : Number(e.target.value)
          : e.target.value,
      ),
    type,
    min,
    max,
    step,
    required,
    placeholder,
  };
  return (
    <label className="field">
      <span>{label}</span>
      {options ? (
        <select value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
          {options.map((o) =>
            typeof o === "string" ? (
              <option key={o} value={o}>
                {o || "Not recorded"}
              </option>
            ) : (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ),
          )}
        </select>
      ) : type === "textarea" ? (
        <textarea
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          rows="3"
          maxLength="4000"
        />
      ) : (
        <input {...props} />
      )}
    </label>
  );
}
export function Chart({
  logs,
  field,
  color = "#b7f34a",
  unit = "",
  target,
  label,
}) {
  const known = logs.filter((x) => x[field] != null);
  if (!known.length)
    return (
      <div className="chart-empty">
        <span>No {label || field} recorded in this period</span>
        <div className="chart-grid" />
      </div>
    );
  const values = known.map((x) => x[field]);
  const min = Math.min(...values, target ?? Infinity),
    max = Math.max(...values, target ?? -Infinity);
  const span = max - min || 1;
  const X = (d) => {
    const start = Date.parse(logs[0].date),
      end = Date.parse(logs.at(-1).date);
    return (
      20 + (end === start ? 0.5 : (Date.parse(d) - start) / (end - start)) * 560
    );
  };
  const Y = (v) => 140 - ((v - min) / span) * 110;
  return (
    <div className="chart">
      <svg
        viewBox="0 0 600 175"
        role="img"
        aria-label={`${label || field} trend; ${known.length} recorded values`}
      >
        <path
          d="M20 30H580 M20 85H580 M20 140H580"
          stroke="#30362d"
          strokeWidth="1"
          strokeDasharray="3 5"
        />
        {target != null && (
          <>
            <line
              x1="20"
              x2="580"
              y1={Y(target)}
              y2={Y(target)}
              stroke="#a4aca1"
              strokeDasharray="5 5"
            />
            <text
              x="580"
              y={Y(target) - 5}
              fill="#a4aca1"
              fontSize="10"
              textAnchor="end"
            >
              target {target}
            </text>
          </>
        )}
        <polyline
          points={known.map((l) => `${X(l.date)},${Y(l[field])}`).join(" ")}
          stroke={color}
          strokeWidth="2.5"
          fill="none"
        />
        {known.map((l) => (
          <circle key={l.id} cx={X(l.date)} cy={Y(l[field])} r="4" fill={color}>
            <title>
              {l.date}: {l[field]} {unit}
            </title>
          </circle>
        ))}
        <text x="20" y="167" fill="#a4aca1" fontSize="11">
          {logs[0].date.slice(5)}
        </text>
        <text x="580" y="167" fill="#a4aca1" fontSize="11" textAnchor="end">
          {logs.at(-1).date.slice(5)}
        </text>
        <text x="20" y="18" fill="#a4aca1" fontSize="11">
          {min.toFixed(1)}–{max.toFixed(1)} {unit}
        </text>
      </svg>
      <p className="muted tiny">
        Lines connect recorded values; gaps contain no inferred measurements.
      </p>
    </div>
  );
}
export function Bars({ items, unit = "" }) {
  if (!items.length)
    return (
      <Empty
        title="No sessions yet"
        text="Record an activity to start your trend."
      />
    );
  const max = Math.max(...items.map((x) => x.value), 1);
  return (
    <div className="bars">
      {items.map((x, i) => (
        <div className="bar-row" key={i}>
          <span>{x.label}</span>
          <div>
            <i
              style={{
                width: `${(x.value / max) * 100}%`,
                background: x.color,
              }}
            />
          </div>
          <b>
            {x.value} {unit}
          </b>
        </div>
      ))}
    </div>
  );
}
export const fmt = (v, d = 1) =>
  v == null
    ? "—"
    : Number(v).toLocaleString(undefined, { maximumFractionDigits: d });
