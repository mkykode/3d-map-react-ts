import type { EngineProgress } from "../engine/engineClient";
import type { TraceOverview, TraceWindow } from "../engine/ingest/types";

export interface TraceImportState {
  file: File;
  slot: "primary" | "secondary";
  phase: "scanning" | "choosing" | "loading";
  overview: TraceOverview | null;
  progress: EngineProgress | null;
  error: string | null;
  selectedWindow?: TraceWindow;
}
