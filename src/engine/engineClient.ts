import type { ParseRequest, ParseResponse } from "./worker";
import type { ParsedTraceModel } from "./types";

/** Main-thread facade over the parse worker. */
class EngineClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<
    number,
    { resolve: (m: ParsedTraceModel) => void; reject: (e: Error) => void }
  >();

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    this.worker = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    });
    this.worker.onmessage = (event: MessageEvent<ParseResponse>) => {
      const { id, ok, model, error } = event.data;
      const entry = this.pending.get(id);
      if (!entry) return;
      this.pending.delete(id);
      if (ok && model) entry.resolve(model);
      else entry.reject(new Error(error ?? "Unknown parse error"));
    };
    this.worker.onerror = (event) => {
      const failure = new Error(`Parse worker failed: ${event.message}`);
      for (const entry of this.pending.values()) entry.reject(failure);
      this.pending.clear();
    };
    return this.worker;
  }

  private request(
    payload: Omit<ParseFileMessage, "id"> | Omit<ParseUrlMessage, "id">,
  ): Promise<ParsedTraceModel> {
    const worker = this.ensureWorker();
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      worker.postMessage({ ...payload, id } satisfies ParseRequest);
    });
  }

  parseFile(file: File): Promise<ParsedTraceModel> {
    return this.request({ type: "parse-file", file });
  }

  parseUrl(url: string): Promise<ParsedTraceModel> {
    return this.request({ type: "parse-url", url });
  }
}

type ParseFileMessage = Extract<ParseRequest, { type: "parse-file" }>;
type ParseUrlMessage = Extract<ParseRequest, { type: "parse-url" }>;

export const engineClient = new EngineClient();
