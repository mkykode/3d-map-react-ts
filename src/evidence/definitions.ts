import type { LaneMeta } from "../engine/types";

export interface ReviewedDefinition {
  term: string;
  text: string;
  source: { title: string; url: string };
}

const THREADS = "https://chromium.googlesource.com/chromium/src/+/main/docs/threading_and_tasks.md";
const definitions: Record<string, ReviewedDefinition> = {
  main: { term: "Renderer main thread", text: "The renderer main thread runs most of Blink, Chromium's rendering engine.", source: { title: "Chromium: Threading and Tasks", url: THREADS } },
  pool: { term: "Thread pool worker", text: "A thread pool worker runs tasks from a shared queue. Each Chrome process has its own thread pool.", source: { title: "Chromium: Threading and Tasks", url: THREADS } },
};

export function threadDefinition(lane: LaneMeta): ReviewedDefinition | null {
  if (lane.kind === "main") return definitions.main;
  if (lane.name.startsWith("ThreadPool")) return definitions.pool;
  return null;
}
