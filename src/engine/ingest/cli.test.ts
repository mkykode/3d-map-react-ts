import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const exec = promisify(execFile);
describe("trace preparation CLI", () => {
  it("prepares windowed JSON, reports provenance, and refuses overwrites", async () => {
    const scratch = await mkdtemp(join(tmpdir(), "trace-prepare-test-"));
    try {
      const input = join(scratch, "input.json");
      const output = join(scratch, "output.json");
      const original = JSON.stringify({ traceEvents: [{ name: "RunTask", ph: "X", ts: 1000, dur: 10_000_000, pid: 1, tid: 1 }] });
      await writeFile(input, original);
      const result = await exec(process.execPath, ["scripts/trace-prepare.ts", input, "--window", "1s-2s", "--output", output]);
      const prepared = JSON.parse(await readFile(output, "utf8"));
      expect(prepared.traceEvents[0]).toMatchObject({ ts: 1_001_000, dur: 1_000_000 });
      expect(prepared.metadata.traceTopographyReduction.window).toEqual([1_001_000, 2_001_000]);
      expect(result.stdout).toContain("payloadSha256");
      await expect(exec(process.execPath, ["scripts/trace-prepare.ts", input, "--output", output])).rejects.toThrow(/EEXIST/);
      expect(await readFile(input, "utf8")).toBe(original);
      expect(JSON.parse(await readFile(output, "utf8"))).toEqual(prepared);
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  });
});
