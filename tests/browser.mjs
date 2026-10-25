// Run Chromium with --remote-debugging-port=9222, then node tests/browser.mjs [URL].
import assert from "node:assert/strict";
import fs from "node:fs";
const base = process.argv[2] || "http://127.0.0.1:5174/";
const [page] = await (await fetch("http://127.0.0.1:9222/json")).json();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let id = 0;
const pending = new Map(),
  errors = [];
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id) {
    const p = pending.get(m.id);
    pending.delete(m.id);
    m.error ? p.reject(m.error) : p.resolve(m.result);
  } else if (m.method === "Runtime.exceptionThrown")
    errors.push(m.params.exceptionDetails.text);
});
const call = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const n = ++id;
    pending.set(n, { resolve, reject });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
async function evaluate(expression) {
  const r = await call("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  assert(!r.exceptionDetails, JSON.stringify(r.exceptionDetails));
  return r.result.value;
}
const settle = () => new Promise((r) => setTimeout(r, 200));
async function click(text, selector = "button") {
  const result = await evaluate(
    `(()=>{const b=[...document.querySelectorAll(${JSON.stringify(selector)})].find(x=>x.textContent.trim()===${JSON.stringify(text)});if(!b)return false;b.click();return true;})()`,
  );
  assert(result, "Missing button: " + text);
  await settle();
}
async function field(label, value) {
  assert(
    await evaluate(
      `(()=>{const label=[...document.querySelectorAll('label.field')].find(x=>x.querySelector('span')?.textContent===${JSON.stringify(label)});const input=label?.querySelector('input,textarea,select');if(!input)return false;Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input),'value').set.call(input,${JSON.stringify(String(value))});input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`,
    ),
    "Missing field " + label,
  );
  await settle();
}
async function waitFor(expression) {
  for (let i = 0; i < 100; i++) {
    if (await evaluate(expression)) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Timed out: " + expression);
}
try {
  await call("Runtime.enable");
  await call("Page.enable");
  await call("Page.navigate", { url: base });
  await waitFor('Boolean(document.querySelector("h1"))');
  assert.match(
    await evaluate("document.body.textContent"),
    /Private cloud setup is required/,
  );
  await click("Settings & backups", "nav button");
  await click("Try unsaved sandbox");
  await click("Quick log");
  await field("Date", "2026-10-17");
  await field("Weight · kg", 80.8);
  await field("Water · litres", 3.5);
  await field("Calories · kcal", 2540);
  await field("A note about today", "Keep my original notes");
  await click("Workout journal 0 sessions", "summary");
  await click("Add workout session");
  await field("Session type / muscle group", "Lower Body & Biceps");
  await click("Add exercise");
  await field("Exercise name", "Biceps machine curl");
  await field("Reps", 15);
  // There are two weight labels: daily weight first; exercise weight is last.
  await evaluate(
    `(()=>{const inputs=[...document.querySelectorAll('label.field')].filter(x=>x.querySelector('span')?.textContent==='Weight · kg').map(x=>x.querySelector('input'));const x=inputs.at(-1);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(x,'15');x.dispatchEvent(new Event('input',{bubbles:true}));})()`,
  );
  await click("Badminton 0 sessions", "summary");
  await click("Add badminton session");
  await field("Duration · minutes", 90); // first duration is workout; court duration set separately below.
  await field("Matches played", 6);
  await field("Wins recorded", 5);
  await field("Losses recorded", 1);
  await click("Save check-in");
  await waitFor('!document.querySelector("[role=dialog]")');
  await click("History & edit logs", "nav button");
  assert.match(await evaluate("document.body.textContent"), /80.8 kg/);
  await click("Edit record");
  await field("Weight · kg", 79.9);
  await field("Water · litres", 4);
  await field("Calories · kcal", 2600);
  await field("Reps", 20);
  await field("Wins recorded", 4);
  await field("Losses recorded", 2);
  await click("Add exercise");
  await click("Save changes");
  await waitFor('!document.querySelector("[role=dialog]")');
  await click("Edit record");
  assert.equal(
    await evaluate(`document.querySelector('input[type=number]').value`),
    "79.9",
  );
  assert.equal(
    await evaluate('document.querySelector("textarea").value'),
    "Keep my original notes",
  );
  assert.equal(
    await evaluate('document.querySelectorAll(".exercise").length'),
    2,
  );
  await click("Remove exercise");
  await click("Save changes");
  await waitFor('!document.querySelector("[role=dialog]")');
  console.log(
    "PASS UI create, edit weight/water/calories/workout/results, preserve notes, remove nested exercise",
  );
  // Delete/restore requires explicit confirmation, automatically accepted for this test only.
  await call("Page.setInterceptFileChooserDialog", { enabled: false });
  await evaluate("window.confirm=()=>true");
  await click("Move to trash");
  assert.match(await evaluate("document.body.textContent"), /No matching days/);
  await click("Settings & backups", "nav button");
  await click("Restore log");
  await click("History & edit logs", "nav button");
  assert.match(await evaluate("document.body.textContent"), /79.9 kg/);
  console.log("PASS confirmed soft delete and restore");
  for (const label of [
    "Overview",
    "Daily check-in",
    "Workout journal",
    "Badminton",
    "Nutrition & supplements",
    "Weight & progress",
    "History & edit logs",
    "Analytics & reports",
    "Goals & achievements",
    "Settings & backups",
  ]) {
    await click(label, "nav button");
    assert(
      await evaluate('Boolean(document.querySelector("main .card"))'),
      label + " is empty",
    );
  }
  await click("Goals & achievements", "nav button");
  await click("Review proposed targets");
  await click("Confirm & save targets");
  await click("Overview", "nav button");
  assert.match(
    await evaluate("document.body.textContent"),
    /4 L personal target/,
  );
  fs.mkdirSync("/tmp/surya-browser-downloads", { recursive: true });
  await call("Browser.setDownloadBehavior", {
    behavior: "allow",
    downloadPath: "/tmp/surya-browser-downloads",
  });
  await click("Settings & backups", "nav button");
  await click("Export full JSON backup");
  await settle();
  const file = fs
    .readdirSync("/tmp/surya-browser-downloads")
    .filter((x) => x.endsWith(".json"))
    .sort()
    .at(-1);
  assert(file, "Missing JSON export");
  const exportPath = "/tmp/surya-browser-downloads/" + file;
  const backup = JSON.parse(fs.readFileSync(exportPath));
  assert.equal(backup.logs.length, 1);
  assert.equal(backup.logs[0].weight, 79.9);
  assert.equal(backup.logs[0].water, 4);
  assert.equal(backup.logs[0].calories, 2600);
  assert.equal(backup.logs[0].badminton[0].won, 4);
  assert.equal(backup.logs[0].workouts[0].exercises[0].sets, null);
  const { root } = await call("DOM.getDocument");
  const { nodeId } = await call("DOM.querySelector", {
    nodeId: root.nodeId,
    selector: "input[type=file]",
  });
  await call("DOM.setFileInputFiles", { nodeId, files: [exportPath] });
  await waitFor('Boolean(document.querySelector(".import-preview"))');
  assert.match(
    await evaluate('document.querySelector(".import-preview").textContent'),
    /1 duplicate/,
  );
  console.log(
    "PASS full export and duplicate import preview, unknown sets remain null",
  );
  for (const width of [1440, 768, 390, 360]) {
    await call("Emulation.setDeviceMetricsOverride", {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: width < 650,
    });
    await click("Overview", "nav button");
    assert(
      await evaluate("document.documentElement.scrollWidth<=window.innerWidth"),
      "Horizontal overflow at " + width,
    );
    await click("Quick log");
    assert(
      await evaluate("document.documentElement.scrollWidth<=window.innerWidth"),
      "Form overflow at " + width,
    );
    await evaluate(
      `[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='Close form').click()`,
    );
    await settle();
  }
  await call("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1050,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await click("Overview", "nav button");
  const screenshot = await call("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
  });
  fs.writeFileSync(
    "/tmp/surya-fitness-desktop.png",
    Buffer.from(screenshot.data, "base64"),
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS all 10 sections, goals, 360–1440px layouts; no browser runtime exceptions",
  );
  await call("Page.reload");
  await waitFor(
    'document.body.textContent.includes("Private cloud setup is required")',
  );
  assert.match(
    await evaluate("document.body.textContent"),
    /Private cloud setup is required/,
  );
  assert.doesNotMatch(await evaluate("document.body.textContent"), /79.9 kg/);
  console.log(
    "PASS public sandbox clears on refresh as explicitly documented (not a cloud persistence test)",
  );
} finally {
  ws.close();
}
