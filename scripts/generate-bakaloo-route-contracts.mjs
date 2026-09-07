/**
 * Generates the evidence-based Bakaloo route inventory and per-route visual
 * contracts from a pinned, read-only checkout of the Bakaloo dashboard.
 *
 * Usage:
 *   node scripts/generate-bakaloo-route-contracts.mjs --reference-root <path>
 *
 * This is deliberately a documentation generator, not an importer. It keeps
 * the route audit reproducible without copying Bakaloo source into Epic BOS.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const args = process.argv.slice(2);
const rootIndex = args.indexOf("--reference-root");
const referenceRoot = rootIndex >= 0 ? args[rootIndex + 1] : undefined;
if (!referenceRoot || !existsSync(referenceRoot)) {
  throw new Error("Provide an existing --reference-root path.");
}

const appRoot = join(referenceRoot, "src", "app", "(dashboard)");
if (!existsSync(appRoot)) throw new Error(`Bakaloo dashboard routes not found: ${appRoot}`);

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) return walk(absolute);
    return entry.name === "page.tsx" ? [absolute] : [];
  });
}

function routeFor(file) {
  const pieces = relative(appRoot, file).split(sep).slice(0, -1)
    .filter((piece) => !/^\(.+\)$/.test(piece))
    .map((piece) => piece.replace(/^\[(.+)\]$/, ":$1"));
  return `/${pieces.join("/")}`.replace(/\/$/, "") || "/";
}

function escapeCell(value) {
  return value.replaceAll("|", "\\|");
}

function classification(route) {
  if (route === "/dashboard") return { destination: "Home / retail command centre", scope: "Store", video: "Yes — dashboard (00:04)", family: "Dashboard" };
  if (route === "/abandoned-carts") return { destination: "Customers / cart recovery", scope: "Store", video: "Yes — abandoned carts (00:44)", family: "Commerce table" };
  if (route === "/analytics") return { destination: "Insights / retail analytics", scope: "HQ + store", video: "Yes — analytics (01:04)", family: "Analytics" };
  if (route === "/settings/tip-presets") return { destination: "Setup / checkout policy", scope: "Store", video: "Yes — tip presets (00:24)", family: "Settings form" };
  if (route.startsWith("/hq/")) return { destination: "HQ control plane", scope: "HQ", video: "No", family: "HQ control" };
  if (route.startsWith("/store/")) return { destination: "Store operations", scope: "Store", video: "No", family: "Store control" };
  if (route.startsWith("/settings/")) return { destination: "Setup / controlled configuration", scope: "Role controlled", video: "No", family: "Settings form" };
  if (route.startsWith("/shops")) return { destination: "Setup / shops and branches", scope: "HQ", video: "No", family: "Master/detail" };
  if (route.startsWith("/products")) return { destination: "Stock / catalogue", scope: "HQ + store", video: "No", family: "Master/detail" };
  if (route.startsWith("/orders")) return { destination: "Sell / unified orders", scope: "HQ + store", video: "No", family: "Operations table" };
  if (route.startsWith("/customers")) return { destination: "Customers / customer 360", scope: "HQ + store", video: "No", family: "Master/detail" };
  if (route.startsWith("/riders") || route.startsWith("/area-segments")) return { destination: "Deliver / dispatch controls", scope: "HQ + store", video: "No", family: "Dispatch" };
  if (route.startsWith("/shop-")) return { destination: "HQ / shop reporting", scope: "HQ", video: "No", family: "Analytics table" };
  if (route === "/me") return { destination: "Setup / personal profile", scope: "User", video: "No", family: "Profile" };
  return { destination: "Mapped in Phase 3 capability audit", scope: "Role controlled", video: "No", family: "Administrative workspace" };
}

const routes = walk(appRoot).map((file) => ({
  absolute: file,
  source: relative(referenceRoot, file).replaceAll("\\", "/"),
  route: routeFor(file),
})).sort((a, b) => a.route.localeCompare(b.route));

const docsRoot = join(process.cwd(), "docs");
const contractsRoot = join(docsRoot, "bakaloo-visual-contracts");
rmSync(contractsRoot, { recursive: true, force: true });
mkdirSync(contractsRoot, { recursive: true });

for (const entry of routes) {
  const details = classification(entry.route);
  const fileName = `${entry.route === "/" ? "root" : entry.route.slice(1).replaceAll("/", "--").replaceAll(":", "param-")}.md`;
  const content = `# ${entry.route}\n\n` +
`## Reference evidence\n\n` +
`- **Pinned Bakaloo source:** \`${entry.source}\`\n` +
`- **Live recording coverage:** ${details.video}\n` +
`- **Reference family:** ${details.family}\n` +
`- **Target Epic destination:** ${details.destination}\n` +
`- **Required scope:** ${details.scope}\n\n` +
`## Visual contract\n\n` +
`Use the shared fixed 260 px / collapsed 72 px sidebar, 64 px sticky header, white surfaces, calm neutral borders, Bakaloo green selected navigation, Lucide icons, and one vertical workspace scroll owner. Preserve the reference route's information hierarchy and table/chart placement when this route is implemented.\n\n` +
`## Data and governance contract\n\n` +
`Bind all values to governed Epic projections. Show loading, empty, permission-denied, unconfigured and error states distinctly; unknown is never rendered as zero. Mutations require Epic maker/checker, audit evidence, tenant/shop isolation and idempotency where applicable.\n\n` +
`## Acceptance checklist\n\n` +
`- [ ] Exact route and visual hierarchy implemented\n` +
`- [ ] Real governed projection connected\n` +
`- [ ] Loading, empty, error and permission states verified\n` +
`- [ ] HQ/store scope and role policy verified\n` +
`- [ ] Keyboard, focus, contrast and responsive review passed\n` +
`- [ ] Visual comparison recorded at 1366×768, 1440×900 and 1600×1000\n` +
`- [ ] Focused interaction/E2E test passed\n`;
  writeFileSync(join(contractsRoot, fileName), content);
}

const rows = routes.map((entry) => {
  const details = classification(entry.route);
  return `| \`${entry.route}\` | \`${entry.source}\` | ${details.video} | ${escapeCell(details.destination)} | ${details.scope} | Not started — legacy/partial Epic surface is not V4 parity |`;
});

const manifest = `# Bakaloo V4 UI Parity Manifest\n\n` +
`Generated from the pinned Bakaloo source checkout by \`scripts/generate-bakaloo-route-contracts.mjs\`. It is an evidence register, not a claim that a route is already complete.\n\n` +
`## Audit status\n\n` +
`- **Routes discovered from source:** ${routes.length}\n` +
`- **Live video evidence:** only the four noted surfaces were observed in the user-supplied recording. All other routes are source-inspected only.\n` +
`- **Epic implementation status:** every route starts as **not certified** under V4 until its data, states, scope, visual comparison and focused interaction test are recorded.\n` +
`- **Per-route visual contracts:** \`docs/bakaloo-visual-contracts/\`\n\n` +
`## Shared shell contract\n\n` +
`- 260 px expanded / 72 px collapsed left sidebar; 64 px sticky header; one vertical workspace scroll owner.\n` +
`- White app surfaces, calm neutral borders/shadows, Bakaloo-green selected navigation, Lucide iconography and accessible labelled actions.\n` +
`- Any unknown, unauthorized, unconfigured or failed value must be visible as that state—never fabricated and never silently rendered as zero.\n\n` +
`| Bakaloo route | Pinned source | Live recording | Epic destination | Scope | V4 certification status |\n` +
`| --- | --- | --- | --- | --- | --- |\n` + rows.join("\n") + "\n\n" +
`## Required completion evidence\n\n` +
`A route may move to certified only after its exact visual hierarchy, governed data binding, loading/empty/error/permission states, HQ/store scope, keyboard/accessibility path, three target viewport comparison and focused interaction/E2E evidence are recorded.\n`;
writeFileSync(join(docsRoot, "BAKALOO_UI_PARITY_MANIFEST.md"), manifest);

console.log(`Generated ${routes.length} route contracts in ${contractsRoot}`);
