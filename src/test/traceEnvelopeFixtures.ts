export interface TraceEventFixture {
  name: string;
  cat: string;
  ph: "X" | "M";
  pid: number;
  tid: number;
  ts: number;
  dur?: number;
  callFrame?: {
    functionName: string;
    scriptId: string;
    url: string;
    lineNumber: number;
    columnNumber: number;
  };
  args?: Record<string, unknown>;
}

export interface TraceResourceFixture {
  url: string;
  mimeType: string;
  content: string;
  sourceMapUrl?: string;
}

export interface TraceEnvelopeFixture {
  traceEvents: TraceEventFixture[];
  metadata: {
    source: "trace-topography-test";
    scenario: string;
    runId: string;
    captureContext: {
      browserContext: string;
      throttling: string;
      navigationOwnership: string;
    };
  };
  settings: {
    captureScreenshots: boolean;
    includeResources: boolean;
  };
  resources: TraceResourceFixture[];
  sourceMaps: Record<string, string>;
}

export interface SourceMapFixture {
  generatedUrl: string;
  mapUrl: string;
  generatedContent: string;
  authoredContent: string;
  map: string;
}

export function makeSourceMapFixture(
  kind: "regular" | "index" = "regular",
): SourceMapFixture {
  const generatedUrl = "https://example.test/assets/app.a1b2c3.js";
  const mapUrl = `${generatedUrl}.map`;
  const authoredContent = "export function work() { return 42; }\n";
  const regularMap = {
    version: 3,
    file: "app.a1b2c3.js",
    sources: ["webpack:///src/work.ts"],
    sourcesContent: [authoredContent],
    names: ["work"],
    mappings: "AAAA,SAASA,IAAI",
  };
  const map =
    kind === "regular"
      ? regularMap
      : {
          version: 3,
          file: "app.a1b2c3.js",
          sections: [{ offset: { line: 0, column: 0 }, map: regularMap }],
        };

  return {
    generatedUrl,
    mapUrl,
    generatedContent: "function work(){return 42}\n//# sourceMappingURL=app.a1b2c3.js.map\n",
    authoredContent,
    map: JSON.stringify(map),
  };
}

export function makeFullEnvelopeFixture(options?: {
  runId?: string;
  scenario?: string;
  eventCount?: number;
  sourceMapKind?: "regular" | "index";
  captureContext?: Partial<TraceEnvelopeFixture["metadata"]["captureContext"]>;
  taskDurationUs?: number;
  taskSpacingUs?: number;
}): TraceEnvelopeFixture {
  const runId = options?.runId ?? "baseline-1";
  const scenario = options?.scenario ?? "checkout";
  const eventCount = options?.eventCount ?? 4;
  const source = makeSourceMapFixture(options?.sourceMapKind);
  const traceEvents: TraceEventFixture[] = [
    {
      name: "thread_name",
      cat: "__metadata",
      ph: "M",
      pid: 100,
      tid: 101,
      ts: 0,
      args: { name: "CrRendererMain" },
    },
    ...Array.from({ length: eventCount }, (_, index): TraceEventFixture => ({
      name: `FixtureTask${index}`,
      cat: "devtools.timeline",
      ph: "X",
      pid: 100,
      tid: 101,
      ts: 1_000 + index * (options?.taskSpacingUs ?? 2_000),
      dur: options?.taskDurationUs ?? 1_000 + index * 10,
      callFrame: {
        functionName: "work",
        scriptId: "1",
        url: source.generatedUrl,
        lineNumber: 0,
        columnNumber: 9,
      },
      args: {
        data: {
          scenario,
          runId,
          url: source.generatedUrl,
        },
      },
    })),
  ];

  return {
    traceEvents,
    metadata: {
      source: "trace-topography-test",
      scenario,
      runId,
      captureContext: {
        browserContext: "regular",
        throttling: "none",
        navigationOwnership: "main-frame",
        ...options?.captureContext,
      },
    },
    settings: { captureScreenshots: true, includeResources: true },
    resources: [
      {
        url: source.generatedUrl,
        mimeType: "text/javascript",
        content: source.generatedContent,
        sourceMapUrl: source.mapUrl,
      },
      {
        url: source.mapUrl,
        mimeType: "application/json",
        content: source.map,
      },
    ],
    sourceMaps: { [source.mapUrl]: source.map },
  };
}

export function encodeEnvelopeFixture(
  envelope: TraceEnvelopeFixture,
): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(envelope));
}
