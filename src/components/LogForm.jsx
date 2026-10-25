import React, { useState } from "react";
import { Field, Icon } from "./UI.jsx";
import { DAILY_NUMBERS, id, validateLog } from "../../shared/domain.js";
const names = {
  weight: "Weight · kg",
  waist: "Waist · cm",
  cardio: "Cardio · minutes",
  water: "Water · litres",
  calories: "Calories · kcal",
  protein: "Protein · grams",
  sleep: "Sleep · hours",
  steps: "Steps",
  mood: "Mood · 1–5",
  energy: "Energy · 1–5",
};
function Num({ name, label, value, onChange }) {
  const [min, max] = DAILY_NUMBERS[name] || [0, 10000];
  return (
    <Field
      label={label || names[name] || name}
      value={value}
      onChange={onChange}
      type="number"
      min={min}
      max={max}
      step="any"
    />
  );
}
export default function LogForm({ initial, onSave, onCancel, busy, error }) {
  const [log, setLog] = useState(() => structuredClone(initial));
  const [localError, setLocalError] = useState("");
  const set = (k, v) => setLog((x) => ({ ...x, [k]: v }));
  const change = (kind, index, key, value) =>
    set(
      kind,
      log[kind].map((x, i) => (i === index ? { ...x, [key]: value } : x)),
    );
  function add(kind) {
    const presets = {
      workouts: {
        id: id(),
        type: "",
        duration: null,
        effort: null,
        notes: "",
        exercises: [],
      },
      badminton: {
        id: id(),
        duration: null,
        played: null,
        won: null,
        lost: null,
        intensity: "",
        opponent: "",
        notes: "",
      },
      meals: {
        id: id(),
        category: "Breakfast",
        food: "",
        quantity: null,
        unit: "",
        calories: null,
        protein: null,
        carbs: null,
        fat: null,
        notes: "",
        estimated: false,
      },
      supplements: {
        id: id(),
        name: "",
        dose: null,
        unit: "g",
        time: "",
        notes: "",
        taken: false,
      },
      sources: { id: id(), field: "", value: "", source: "", note: "" },
    };
    set(kind, [...log[kind], presets[kind]]);
  }
  function remove(kind, i) {
    set(
      kind,
      log[kind].filter((_, j) => i !== j),
    );
  }
  async function submit(e) {
    e.preventDefault();
    setLocalError("");
    try {
      const valid = validateLog(log);
      await onSave(valid);
    } catch (e) {
      setLocalError(e.message);
    }
  }
  const exerciseChange = (wi, ei, k, v) =>
    change(
      "workouts",
      wi,
      "exercises",
      log.workouts[wi].exercises.map((e, i) =>
        i === ei ? { ...e, [k]: v } : e,
      ),
    );
  return (
    <form onSubmit={submit} className="log-form">
      <fieldset disabled={busy}>
        <div className="form-heading">
          <div>
            <span className="eyebrow">YOUR DAILY CHECK-IN</span>
            <h2>
              {initial.version ? "Edit your day" : "A minute for yourself."}
            </h2>
            <p className="muted">
              Log what you know. Leave the rest blank. Rest days count.
            </p>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close form"
            onClick={onCancel}
          >
            <Icon name="close" />
          </button>
        </div>
        <div className="form-grid">
          <Field
            label="Date"
            type="date"
            required
            value={log.date}
            onChange={(v) => set("date", v)}
          />
          <Field
            label="Kind of day"
            value={log.dayType}
            onChange={(v) => set("dayType", v)}
            options={[
              { value: "", label: "Not recorded" },
              { value: "gym", label: "Gym session" },
              { value: "rest", label: "Planned rest" },
              { value: "recovery", label: "Recovery day" },
              { value: "active", label: "Active day" },
            ]}
          />
          {["weight", "water", "calories", "protein", "sleep", "cardio"].map(
            (k) => (
              <Num
                key={k}
                name={k}
                value={log[k]}
                onChange={(v) => set(k, v)}
              />
            ),
          )}
          {log.badminton.length <= 1 && (
            <Num
              label="Badminton · minutes"
              value={log.badminton[0]?.duration ?? null}
              onChange={(v) => {
                if (log.badminton.length) change("badminton", 0, "duration", v);
                else if (v != null)
                  set("badminton", [
                    {
                      id: id(),
                      duration: v,
                      played: null,
                      won: null,
                      lost: null,
                      intensity: "",
                      opponent: "",
                      notes: "",
                    },
                  ]);
              }}
            />
          )}
        </div>
        <Field
          label="A note about today"
          type="textarea"
          value={log.notes}
          onChange={(v) => set("notes", v)}
        />
        <div className="checks">
          {[
            ["workoutCompleted", "Workout completed"],
            ["cardioCompleted", "Cardio completed"],
            ["badmintonPlayed", "Badminton played"],
            ["nutritionLogged", "Nutrition logged"],
            ["waterAchieved", "Water target achieved"],
            ["supplementsTaken", "Supplements taken"],
          ].map(([k, label]) => (
            <label key={k}>
              <input
                type="checkbox"
                checked={log[k]}
                onChange={(e) => set(k, e.target.checked)}
              />
              {label}
            </label>
          ))}
        </div>
        <details>
          <summary>
            Recovery, measurements & energy <span>Optional</span>
          </summary>
          <div className="form-grid">
            {["waist", "steps", "mood", "energy"].map((k) => (
              <Num
                key={k}
                name={k}
                value={log[k]}
                onChange={(v) => set(k, v)}
              />
            ))}
            <Field
              label="Bedtime"
              type="time"
              value={log.sleepTime}
              onChange={(v) => set("sleepTime", v)}
            />
            <Field
              label="Wake time"
              type="time"
              value={log.wakeTime}
              onChange={(v) => set("wakeTime", v)}
            />
            <Field
              label="Sleep quality · 1–5"
              type="number"
              min="1"
              max="5"
              value={log.sleepQuality}
              onChange={(v) => set("sleepQuality", v)}
            />
          </div>
        </details>
        <details open={log.workouts.length > 0}>
          <summary>
            Workout journal <span>{log.workouts.length} sessions</span>
          </summary>
          {log.workouts.map((w, wi) => (
            <div className="nested" key={w.id}>
              <div className="row between">
                <h4>Session {wi + 1}</h4>
                <button
                  type="button"
                  className="text-button danger"
                  onClick={() => remove("workouts", wi)}
                >
                  Remove session
                </button>
              </div>
              <div className="form-grid">
                <Field
                  label="Session type / muscle group"
                  value={w.type}
                  onChange={(v) => change("workouts", wi, "type", v)}
                  placeholder="e.g. Chest & Triceps"
                />
                <Num
                  label="Duration · minutes"
                  value={w.duration}
                  onChange={(v) => change("workouts", wi, "duration", v)}
                />
                <Field
                  label="Effort · 1–10"
                  type="number"
                  min="1"
                  max="10"
                  value={w.effort}
                  onChange={(v) => change("workouts", wi, "effort", v)}
                />
                <Field
                  label="Session notes"
                  value={w.notes}
                  onChange={(v) => change("workouts", wi, "notes", v)}
                />
              </div>
              {w.exercises.map((x, ei) => (
                <div className="exercise" key={x.id}>
                  <div className="form-grid">
                    <Field
                      label="Exercise name"
                      value={x.name}
                      onChange={(v) => exerciseChange(wi, ei, "name", v)}
                    />
                    <Field
                      label="Equipment / variation"
                      value={x.equipment}
                      onChange={(v) => exerciseChange(wi, ei, "equipment", v)}
                    />
                    {[
                      ["sets", "Sets"],
                      ["reps", "Reps"],
                      ["weight", "Weight · kg"],
                      ["duration", "Duration · minutes"],
                    ].map(([k, label]) => (
                      <Num
                        key={k}
                        label={label}
                        value={x[k]}
                        onChange={(v) => exerciseChange(wi, ei, k, v)}
                      />
                    ))}
                    <Field
                      label="Exercise notes"
                      value={x.notes}
                      onChange={(v) => exerciseChange(wi, ei, "notes", v)}
                    />
                  </div>
                  <div className="row between">
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={x.pr || false}
                        onChange={(e) =>
                          exerciseChange(wi, ei, "pr", e.target.checked)
                        }
                      />
                      Personal record
                    </label>
                    <button
                      type="button"
                      className="text-button danger"
                      onClick={() =>
                        change(
                          "workouts",
                          wi,
                          "exercises",
                          w.exercises.filter((_, i) => i !== ei),
                        )
                      }
                    >
                      Remove exercise
                    </button>
                  </div>
                </div>
              ))}
              <button
                type="button"
                className="button secondary"
                onClick={() =>
                  change("workouts", wi, "exercises", [
                    ...w.exercises,
                    {
                      id: id(),
                      name: "",
                      equipment: "",
                      sets: null,
                      reps: null,
                      weight: null,
                      duration: null,
                      notes: "",
                      pr: false,
                    },
                  ])
                }
              >
                <Icon name="plus" size={16} />
                Add exercise
              </button>
            </div>
          ))}
          <button
            type="button"
            className="button secondary"
            onClick={() => add("workouts")}
          >
            <Icon name="plus" size={16} />
            Add workout session
          </button>
        </details>
        <details open={log.badminton.length > 0}>
          <summary>
            Badminton <span>{log.badminton.length} sessions</span>
          </summary>
          {log.badminton.map((b, i) => (
            <div className="nested" key={b.id}>
              <div className="form-grid">
                {[
                  ["duration", "Duration · minutes"],
                  ["played", "Matches played"],
                  ["won", "Wins recorded"],
                  ["lost", "Losses recorded"],
                ].map(([k, label]) => (
                  <Num
                    key={k}
                    label={label}
                    value={b[k]}
                    onChange={(v) => change("badminton", i, k, v)}
                  />
                ))}
                <Field
                  label="Intensity"
                  options={["", "Light", "Moderate", "High"]}
                  value={b.intensity}
                  onChange={(v) => change("badminton", i, "intensity", v)}
                />
                <Field
                  label="Partner / opponent"
                  value={b.opponent}
                  onChange={(v) => change("badminton", i, "opponent", v)}
                />
                <Field
                  label="Notes"
                  value={b.notes}
                  onChange={(v) => change("badminton", i, "notes", v)}
                />
              </div>
              <p className="muted small">
                Unknown outcomes stay blank. Win rate uses explicitly recorded
                wins and losses only.
              </p>
              <button
                type="button"
                className="text-button danger"
                onClick={() => remove("badminton", i)}
              >
                Remove badminton session
              </button>
            </div>
          ))}
          <button
            type="button"
            className="button secondary"
            onClick={() => add("badminton")}
          >
            <Icon name="plus" size={16} />
            Add badminton session
          </button>
        </details>
        <details open={log.meals.length > 0}>
          <summary>
            Meals & nutrition <span>{log.meals.length} meals</span>
          </summary>
          {log.meals.map((m, i) => (
            <div className="nested" key={m.id}>
              <div className="form-grid">
                <Field
                  label="Meal category"
                  options={[
                    "Breakfast",
                    "Lunch",
                    "Dinner",
                    "Snacks",
                    "Post-workout",
                    "Custom",
                  ]}
                  value={m.category}
                  onChange={(v) => change("meals", i, "category", v)}
                />
                <Field
                  label="Food name"
                  value={m.food}
                  onChange={(v) => change("meals", i, "food", v)}
                />
                <Num
                  label="Quantity"
                  value={m.quantity}
                  onChange={(v) => change("meals", i, "quantity", v)}
                />
                <Field
                  label="Units"
                  value={m.unit}
                  onChange={(v) => change("meals", i, "unit", v)}
                />
                {[
                  ["calories", "Calories"],
                  ["protein", "Protein · g"],
                  ["carbs", "Carbohydrates · g"],
                  ["fat", "Fat · g"],
                ].map(([k, label]) => (
                  <Num
                    key={k}
                    label={label}
                    value={m[k]}
                    onChange={(v) => change("meals", i, k, v)}
                  />
                ))}
                <Field
                  label="Meal notes"
                  value={m.notes}
                  onChange={(v) => change("meals", i, "notes", v)}
                />
              </div>
              <div className="row between">
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={m.estimated || false}
                    onChange={(e) =>
                      change("meals", i, "estimated", e.target.checked)
                    }
                  />
                  Nutrition is estimated
                </label>
                <button
                  type="button"
                  className="text-button danger"
                  onClick={() => remove("meals", i)}
                >
                  Remove meal
                </button>
              </div>
            </div>
          ))}
          <p className="muted small">
            Daily calories and protein are entered separately; meal estimates
            never silently overwrite them.
          </p>
          <button
            type="button"
            className="button secondary"
            onClick={() => add("meals")}
          >
            <Icon name="plus" size={16} />
            Add meal
          </button>
        </details>
        <details open={log.supplements.length > 0}>
          <summary>
            Supplements <span>{log.supplements.length} entries</span>
          </summary>
          {log.supplements.map((s, i) => (
            <div className="nested" key={s.id}>
              <div className="form-grid">
                <Field
                  label="Supplement name"
                  value={s.name}
                  onChange={(v) => change("supplements", i, "name", v)}
                  placeholder="Whey, creatine, or custom"
                />
                <Num
                  label="Dose"
                  value={s.dose}
                  onChange={(v) => change("supplements", i, "dose", v)}
                />
                <Field
                  label="Dose unit"
                  value={s.unit}
                  onChange={(v) => change("supplements", i, "unit", v)}
                />
                <Field
                  label="Time"
                  type="time"
                  value={s.time}
                  onChange={(v) => change("supplements", i, "time", v)}
                />
                <Field
                  label="Supplement notes"
                  value={s.notes}
                  onChange={(v) => change("supplements", i, "notes", v)}
                />
              </div>
              <div className="row between">
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={s.taken || false}
                    onChange={(e) =>
                      change("supplements", i, "taken", e.target.checked)
                    }
                  />
                  Taken on this day
                </label>
                <button
                  type="button"
                  className="text-button danger"
                  onClick={() => remove("supplements", i)}
                >
                  Remove supplement
                </button>
              </div>
            </div>
          ))}
          <button
            type="button"
            className="button secondary"
            onClick={() => add("supplements")}
          >
            <Icon name="plus" size={16} />
            Add supplement
          </button>
        </details>
        <details open={log.sources.length > 0}>
          <summary>
            Source notes & conflicts <span>Preserve original values</span>
          </summary>
          {log.sources.map((s, i) => (
            <div className="nested" key={s.id}>
              <div className="form-grid">
                {[
                  ["field", "Conflicting field"],
                  ["value", "Original recorded value"],
                  ["source", "Source / filename"],
                  ["note", "Review notes"],
                ].map(([k, label]) => (
                  <Field
                    key={k}
                    label={label}
                    value={s[k]}
                    onChange={(v) => change("sources", i, k, v)}
                  />
                ))}
              </div>
              <button
                type="button"
                className="text-button danger"
                onClick={() => remove("sources", i)}
              >
                Remove source note
              </button>
            </div>
          ))}
          <button
            type="button"
            className="button secondary"
            onClick={() => add("sources")}
          >
            Add source note
          </button>
        </details>
        {(localError || error) && (
          <div className="notice error" role="alert">
            {localError || error}
          </div>
        )}
        <div className="form-footer">
          <p className="muted small">
            {initial.version
              ? `Record ID stays ${initial.id}`
              : "Only the date is required."}
          </p>
          <div className="row">
            <button
              type="button"
              className="button secondary"
              onClick={onCancel}
            >
              Cancel
            </button>
            <button type="submit" className="button primary">
              {busy
                ? "Saving…"
                : initial.version
                  ? "Save changes"
                  : "Save check-in"}
              <Icon name="check" size={17} />
            </button>
          </div>
        </div>
      </fieldset>
    </form>
  );
}
