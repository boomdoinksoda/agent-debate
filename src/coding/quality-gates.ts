import { execSync } from "child_process";

export interface GateResult {
  gate: string;
  passed: boolean;
  output: string;
}

export function runQualityGates(touchedFiles: string[]): GateResult[] {
  const results: GateResult[] = [];
  const goFiles = touchedFiles.filter((f) => f.endsWith(".go"));

  if (goFiles.length === 0) return results;

  const packages = [
    ...new Set(
      goFiles.map((f) => {
        const parts = f.split("/");
        parts.pop();
        return "./" + parts.join("/") + "/...";
      })
    ),
  ];

  results.push(runGate("go-fmt", `gofmt -l ${goFiles.join(" ")}`));

  for (const pkg of packages) {
    results.push(runGate("go-vet", `go vet ${pkg}`));
  }

  for (const pkg of packages) {
    results.push(runGate("go-test", `go test -race -count=1 ${pkg}`));
  }

  return results;
}

function runGate(name: string, command: string): GateResult {
  try {
    const output = execSync(command, {
      encoding: "utf-8",
      timeout: 120000,
      cwd: process.env.PROJECT_ROOT ?? process.cwd(),
    });
    return { gate: name, passed: true, output };
  } catch (err: unknown) {
    const error = err as { stdout?: string; stderr?: string };
    return {
      gate: name,
      passed: false,
      output: (error.stdout ?? "") + (error.stderr ?? ""),
    };
  }
}
