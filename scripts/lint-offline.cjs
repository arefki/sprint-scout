// lint-offline.cjs — run Forge's own client-side linters WITHOUT logging in.
//
// `forge lint` refuses to run until you `forge login`, but the checks that
// matter locally (manifest schema, handler existence, scopes/permissions,
// Teamwork Graph rules, UI Kit checks) live in the bundled @forge/lint
// package and need no credentials. This script calls that package directly.
//
// Usage (after `npm install`):
//   npm run lint:offline
//
// It exits 0 and prints LINT CLEAN when there are no errors, warnings or
// approvals. It is a local validation aid only — run the real `forge lint`
// (and `forge deploy`) once logged in, before submitting.
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CLI = path.join(ROOT, "node_modules/@forge/cli");
const shared = require(path.join(CLI, "node_modules/@forge/cli-shared"));
const { lint, problemCount } = require(path.join(CLI, "node_modules/@forge/lint"));

async function main() {
  process.chdir(ROOT);
  const fileReader = { readFile: (p) => fs.readFileSync(path.join(ROOT, p), "utf-8") };
  const configFile = new shared.ConfigFile(fileReader, null);
  const manifest = await configFile.readConfig();
  console.log("manifest parsed OK; app id:", manifest.app?.id);

  const logger = {
    info: () => {},
    debug: () => {},
    warn: (...a) => console.warn("[warn]", ...a),
    error: (...a) => console.error("[error]", ...a),
    traceEnabled: false,
  };
  const credentialStore = {
    getCredentials: async () => {
      throw new Error("no credentials (expected: lint runs without login)");
    },
  };
  const appConfigReader = { readConfigSection: async () => "missing" };
  const statsig = new shared.StatsigService(logger, { version: "15.1.0" }, credentialStore, appConfigReader);

  const files = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(js|jsx|ts|tsx)$/.test(e.name)) files.push(p);
    }
  };
  walk("src");
  console.log("files to lint:", files.join(", "));

  const results = await lint(files, manifest, "development", logger, statsig, {
    linter: { mode: "client-side" },
  });
  console.log("counts:", problemCount(results));
  let total = 0;
  for (const r of results) {
    for (const e of r.errors) {
      total++;
      console.log(`ERROR ${r.file}:${e.line}:${e.column} ${e.message} [${e.reference}]`);
    }
    for (const w of r.warnings) {
      total++;
      console.log(`WARN  ${r.file}:${w.line}:${w.column} ${w.message} [${w.reference}]`);
    }
    for (const a of r.approvals) {
      total++;
      console.log(`APPROVAL ${r.file}:${a.line}:${a.column} ${a.message} [${a.reference}]`);
    }
  }
  console.log(total === 0 ? "LINT CLEAN" : `LINT REPORTED ${total} ITEM(S)`);
  process.exit(total === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("DRIVER FAILED", e);
  process.exit(1);
});
