import fs from "node:fs";
import path from "node:path";
const root = path.resolve("dist");
let html = fs.readFileSync(path.join(root, "index.html"), "utf8");
html = html.replace(
  /<script\b[^>]*src="([^"]+)"[^>]*><\/script>/g,
  (_, src) =>
    `<script type="module">${fs.readFileSync(path.join(root, src.replace(/^\.\//, "")), "utf8").replace(/<\/script/gi, "<\\/script")}</script>`,
);
html = html.replace(
  /<link\b[^>]*href="([^"]+\.css)"[^>]*>/g,
  (_, src) =>
    `<style>${fs.readFileSync(path.join(root, src.replace(/^\.\//, "")), "utf8")}</style>`,
);
html = html.replace("<head>", '<head><base target="_top">');
fs.mkdirSync("deploy/apps-script", { recursive: true });
fs.writeFileSync("deploy/apps-script/Index.html", html);
fs.writeFileSync(
  "deploy/apps-script/Code.gs",
  fs.readFileSync("shared/domain.js", "utf8").replace(/^export /gm, "") +
    "\n" +
    fs.readFileSync("apps-script/Server.js", "utf8"),
);
fs.copyFileSync(
  "apps-script/appsscript.json",
  "deploy/apps-script/appsscript.json",
);
console.log(
  "Generated Apps Script bundle: deploy/apps-script/{Code.gs,Index.html,appsscript.json}",
);
