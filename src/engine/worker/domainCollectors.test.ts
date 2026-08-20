import { describe, expect, test } from "vitest";
import { sessionId } from "../../domain/analysis";
import type { AdapterCanonicalEvidence } from "../adapter";
import { collectBrowserValues, collectBrowserValuesInterruptibly } from "./browserCandidates";
import type { DomainCollector, InterruptibleDomainCollector } from "./candidateCollector";
import { collectFrameValues, collectFrameValuesInterruptibly } from "./frameCandidates";
import { collectMetricValues, collectMetricValuesInterruptibly } from "./metricCandidates";
import { collectNetworkValues, collectNetworkValuesInterruptibly } from "./networkCandidates";

const id = sessionId("session:v1:collector-test");
const bounds = [0, 1_000] as const;

interface CollectorCase {
  name: string;
  evidence: AdapterCanonicalEvidence;
  collect: DomainCollector;
  collectInterruptibly: InterruptibleDomainCollector;
}

describe("chunked domain collectors", () => {
  test.each<CollectorCase>([
    {
      name: "browser events",
      evidence: evidenceWith({
        events: Array.from({ length: 129 }, (_, index) => ({
          key: `event-${index}`,
          name: "FunctionCall",
          category: "devtools.timeline",
          phase: "X",
          processId: 1,
          threadId: 1,
          startMs: index,
          durationMs: 1,
          data: {},
        })),
      }),
      collect: collectBrowserValues,
      collectInterruptibly: collectBrowserValuesInterruptibly,
    },
    {
      name: "network requests",
      evidence: evidenceWith({
        requests: Array.from({ length: 129 }, (_, index) => ({
          start: index,
          end: index + 1,
          url: "https://example.test/api",
          method: "GET",
          eventKey: `request-${index}`,
          renderBlocking: false,
        })),
      }),
      collect: collectNetworkValues,
      collectInterruptibly: collectNetworkValuesInterruptibly,
    },
    {
      name: "frames",
      evidence: evidenceWith({
        frames: Array.from({ length: 129 }, (_, index) => ({
          start: index,
          end: index + 1,
          dropped: index % 2 === 0,
          eventKey: `frame-${index}`,
        })),
      }),
      collect: collectFrameValues,
      collectInterruptibly: collectFrameValuesInterruptibly,
    },
    {
      name: "metrics",
      evidence: evidenceWith({
        metrics: Array.from({ length: 129 }, (_, index) => ({
          name: "LCP",
          label: "LCP",
          ts: index,
          eventKey: `metric-${index}`,
        })),
      }),
      collect: collectMetricValues,
      collectInterruptibly: collectMetricValuesInterruptibly,
    },
  ])("yields within a large $name scan without changing results", async ({
    evidence,
    collect,
    collectInterruptibly,
  }) => {
    const checkpoints: [number, number][] = [];
    const expected = collect(evidence, bounds, id);
    const actual = await collectInterruptibly(
      evidence,
      bounds,
      id,
      async (completed, total) => {
        checkpoints.push([completed, total]);
      },
    );

    expect(actual).toEqual(expected);
    expect(checkpoints).toEqual([[128, 129], [129, 129]]);
  });
});

function evidenceWith(
  overrides: Partial<AdapterCanonicalEvidence>,
): AdapterCanonicalEvidence {
  return {
    eventCount: 0,
    events: [],
    sourceFrames: [],
    sourceSamples: [],
    animationFrames: [],
    interactions: [],
    layoutShifts: [],
    userTimings: [],
    metrics: [],
    navigations: [],
    requests: [],
    frames: [],
    memory: [],
    screenshots: [],
    ...overrides,
  };
}
