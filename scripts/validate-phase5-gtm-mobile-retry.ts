import fs from "node:fs";
import path from "node:path";

const file = fs.readFileSync(path.join(process.cwd(), "app/(app)/agents/[code]/benchmark/BenchmarkConsole.tsx"), "utf8");
const failures: string[] = [];
const expect = (condition: boolean, message: string) => { if (!condition) failures.push(message); };

expect(file.includes("MAX_NETWORK_ATTEMPTS = 3"), "Benchmark client must retry transient mobile/network failures.");
expect(file.includes("RETRYABLE_STATUS"), "Benchmark client must classify retryable HTTP failures.");
expect(file.includes("Load failed") || file.includes("load failed"), "Benchmark client must recognize Safari/WebView Load failed errors.");
expect(file.includes("byScenario.has(scenario.id)"), "Benchmark client must skip already persisted scenarios on resume.");
expect(file.includes("inFlight.current"), "Benchmark client must block duplicate in-process starts.");
expect(file.includes("Retrying automatically"), "Benchmark UI must disclose automatic retry state.");

if (failures.length) {
  console.error("GTM mobile retry validation failed:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("GTM mobile retry validation passed.");
