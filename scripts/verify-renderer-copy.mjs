import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const rendererRoot = path.resolve('src/renderer');
const mojibake = /[\u00c2\u00c3]|â€|ðŸ/u;
const failures = [];
// Retired generic demo records must never appear in shipped renderer copy.
// Test/legacy migration fixtures are excluded below because they are not
// bundled into the operator UI.
const retiredDemoCopy = /Northstar|Northbank Foods|Valence Energy|Atlas Biotech|Kestrel Fabrication|Luma Hotels|Orchard Capital|Solace Consumer|Global back-office transformation/iu;

function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(filePath);
      continue;
    }
    if (!/\.(css|ts|tsx)$/u.test(entry.name)) continue;
    if (/\.test\.(css|ts|tsx)$/u.test(entry.name)) continue;
    const lines = readFileSync(filePath, 'utf8').split(/\r?\n/u);
    lines.forEach((line, index) => {
      if (mojibake.test(line)) failures.push(`${path.relative(process.cwd(), filePath)}:${index + 1}`);
      if (retiredDemoCopy.test(line)) failures.push(`${path.relative(process.cwd(), filePath)}:${index + 1} (retired demo copy)`);
    });
  }
}

walk(rendererRoot);
if (failures.length) {
  console.error(`Renderer copy contains invalid encoding markers:\n${failures.join('\n')}`);
  process.exit(1);
}

console.log(`Renderer copy encoding check passed (${rendererRoot}).`);
