import type { VitalMarker } from "./types";

export type WebVitalMetric =
  | {
      available: true;
      valueMs: number;
      markerTs: number;
      provenance: string;
    }
  | {
      available: false;
      reason: string;
      provenance: string;
    };

export interface WebVitalsSummary {
  navigationStart: number | null;
  criticalWindow: [number, number] | null;
  loadWindow: [number, number] | null;
  metrics: {
    lcp: WebVitalMetric;
    cls: WebVitalMetric;
    inp: WebVitalMetric;
    fcp: WebVitalMetric;
  };
  milestones: {
    domContentLoaded: number | null;
    load: number | null;
  };
}

const MARKER_PROVENANCE = "trace_engine PageLoadMetrics marker";
const DERIVATION_PROVENANCE = "Unavailable in the current canonical trace model";

export function summarizeWebVitals(markers: VitalMarker[]): WebVitalsSummary {
  const ordered = [...markers].sort((a, b) => a.ts - b.ts);
  const navigationIndex = ordered.findIndex((marker) => marker.name === "navigationStart");
  const navigation = navigationIndex >= 0 ? ordered[navigationIndex] : null;
  const nextNavigation = navigation
    ? ordered.slice(navigationIndex + 1).find((marker) => marker.name === "navigationStart")
    : null;
  const scoped = navigation
    ? ordered.filter(
        (marker) =>
          marker.ts >= navigation.ts &&
          (!nextNavigation || marker.ts < nextNavigation.ts),
      )
    : [];
  const first = (name: string) => scoped.find((marker) => marker.name === name) ?? null;
  const last = (name: string): VitalMarker | null => {
    for (let i = scoped.length - 1; i >= 0; i--) {
      if (scoped[i].name === name) return scoped[i];
    }
    return null;
  };
  const fcp = first("firstContentfulPaint");
  const lcp = last("largestContentfulPaint::Candidate");
  const domContentLoaded = first("MarkDOMContent");
  const load = first("MarkLoad");
  const unavailableMarker = (label: string): WebVitalMetric => ({
    available: false,
    reason: navigation
      ? `${label} marker is absent for this navigation.`
      : "No navigationStart marker is available.",
    provenance: MARKER_PROVENANCE,
  });
  const fromMarker = (marker: VitalMarker | null, label: string): WebVitalMetric =>
    navigation && marker
      ? {
          available: true,
          valueMs: marker.ts - navigation.ts,
          markerTs: marker.ts,
          provenance: MARKER_PROVENANCE,
        }
      : unavailableMarker(label);

  return {
    navigationStart: navigation?.ts ?? null,
    criticalWindow: navigation && lcp ? [navigation.ts, lcp.ts] : null,
    loadWindow: navigation && load ? [navigation.ts, load.ts] : null,
    metrics: {
      lcp: fromMarker(lcp, "LCP candidate"),
      cls: {
        available: false,
        reason: "Layout-shift clusters are not modeled yet.",
        provenance: DERIVATION_PROVENANCE,
      },
      inp: {
        available: false,
        reason: "Interaction timing is not modeled yet.",
        provenance: DERIVATION_PROVENANCE,
      },
      fcp: fromMarker(fcp, "FCP"),
    },
    milestones: {
      domContentLoaded:
        navigation && domContentLoaded ? domContentLoaded.ts - navigation.ts : null,
      load: navigation && load ? load.ts - navigation.ts : null,
    },
  };
}
