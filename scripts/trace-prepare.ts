import { openAsBlob } from "node:fs";
import { open, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { prepareTrace, scanTrace } from "../src/engine/ingest/prepare.ts";
import type { TraceWindow } from "../src/engine/ingest/types.ts";

const usage = "Usage: pnpm trace:prepare input.json[.gz] --output prepared.json [--window 12s-24s] [--inspect]";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("--help")) { console.log(usage); return; }
  const input = args.shift()!;
  let output: string | undefined;
  let interval: [number, number] | null = null;
  let inspect = false;
  while (args.length) {
    const flag = args.shift();
    if (flag === "--output") output = args.shift();
    else if (flag === "--inspect") inspect = true;
    else if (flag === "--window") {
      const value = args.shift() ?? "";
      const match = /^(\d+(?:\.\d+)?)s?-(\d+(?:\.\d+)?)s?$/.exec(value);
      if (!match) throw new Error("Window must be start-end in seconds, for example 12s-24s.");
      interval = [Number(match[1]), Number(match[2])];
      if (interval[1] <= interval[0]) throw new Error("Window end must be after start.");
    } else throw new Error(`Unknown option: ${flag}. ${usage}`);
  }
  if (!inspect && !output) throw new Error(`An output path is required. ${usage}`);
  if (output && resolve(input) === resolve(output)) throw new Error("Input and output must be different files.");
  const controller = new AbortController();
  const cancel = () => controller.abort(new Error("Preparation canceled."));
  process.once("SIGINT", cancel);
  process.once("SIGTERM", cancel);
  try {
    const file = await openAsBlob(input);
    // Exclusive creation prevents overwriting an input alias or an existing
    // output, and it runs before any scan so a clash is reported immediately.
    const destination = inspect ? null : await open(output!, "wx");
    let complete = inspect;
    try {
      let window: TraceWindow | null = null;
      if (inspect || interval) {
        console.error("Scanning recording…");
        const overview = await scanTrace(file, { signal: controller.signal });
        const duration = (overview.endUs - overview.startUs) / 1e6;
        console.log(JSON.stringify({ durationSeconds: duration, events: overview.eventCount, retainedEvents: overview.retainedEventCount, retainedBytes: overview.retainedBytes }, null, 2));
        if (interval) {
          if (interval[1] > duration) throw new Error(`Window extends past the ${duration.toFixed(3)} second recording.`);
          window = [overview.startUs + interval[0] * 1e6, overview.startUs + interval[1] * 1e6];
        }
      }
      if (!destination) return;
      console.error("Streaming and filtering recording…");
      const prepared = await prepareTrace(file, window, { signal: controller.signal });
      await destination.writeFile('{"traceEvents":[');
      for (let i = 0; i < prepared.traceEvents.length; i++) {
        controller.signal.throwIfAborted();
        // Bounded batches keep writes efficient without another whole-file string.
        const batch = prepared.traceEvents.slice(i, i + 256).map((event) => JSON.stringify(event)).join(",");
        await destination.writeFile((i ? "," : "") + batch);
        i += 255;
      }
      await destination.writeFile(`],"metadata":${JSON.stringify(prepared.metadata)},"settings":${JSON.stringify(prepared.settings)}}\n`);
      complete = true;
      console.log(JSON.stringify({ output: resolve(output!), retainedBytes: prepared.retainedBytes, ...prepared.report }, null, 2));
    } finally {
      await destination?.close();
      if (destination && !complete) {
        await unlink(output!);
        console.error(`Removed incomplete output: ${output}`);
      }
    }
  } finally {
    process.removeListener("SIGINT", cancel);
    process.removeListener("SIGTERM", cancel);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
