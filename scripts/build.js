const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "dist");
const appDirectories = ["admin", "css", "customer", "js", "main", "stall"];
const appFiles = ["index.html", "404.html", "_headers", "_redirects"];

function assertInsideRoot(target) {
  const resolved = path.resolve(target);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`Refusing to touch path outside project: ${resolved}`);
  }
  return resolved;
}

function copyDirectory(source, destination) {
  fs.mkdirSync(destination, { recursive: true });

  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(from, to);
    } else if (entry.isFile()) {
      fs.copyFileSync(from, to);
    }
  }
}

function loadDotEnv() {
  const envFile = path.join(root, ".env");
  if (!fs.existsSync(envFile)) return;

  const lines = fs.readFileSync(envFile, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key && process.env[key] == null) {
      process.env[key] = value;
    }
  }
}

function jsString(value) {
  return JSON.stringify(String(value || ""));
}

function applyEnvironmentConfig() {
  const configFile = path.join(output, "js", "shared", "config.js");
  let content = fs.readFileSync(configFile, "utf8");

  const supabaseUrl = process.env.SUPABASE_URL || "your-supabase-url";
  const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY ||
    "your-supabase-publishable-key";
  const timeout = Number(process.env.SUPABASE_REQUEST_TIMEOUT_MS || 2500);
  const timeoutMs = Number.isFinite(timeout) && timeout > 0 ? timeout : 2500;

  content = content
    .replace(/supabaseUrl:\s*"[^"]*"/, `supabaseUrl: ${jsString(supabaseUrl)}`)
    .replace(/supabasePublishableKey:\s*"[^"]*"/, `supabasePublishableKey: ${jsString(supabasePublishableKey)}`)
    .replace(/supabaseRequestTimeoutMs:\s*\d+/, `supabaseRequestTimeoutMs: ${timeoutMs}`);

  fs.writeFileSync(configFile, content);
}

loadDotEnv();
assertInsideRoot(output);
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

for (const directory of appDirectories) {
  const source = path.join(root, directory);
  if (fs.existsSync(source)) {
    copyDirectory(source, path.join(output, directory));
  }
}

for (const file of appFiles) {
  fs.copyFileSync(path.join(root, file), path.join(output, file));
}

applyEnvironmentConfig();

console.log(`Publish files prepared in ${path.relative(root, output)}/`);
