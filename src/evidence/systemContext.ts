import type { ConnectionGraph, LaneMeta, NetworkRequestInfo, ParsedTraceModel } from "../engine/types";

export interface ComponentContext {
  title: string;
  domain: string;
  description: string;
  relationship: string;
  basis: string;
  evidence: string[];
  source?: string;
}

function parseUrl(value: string): URL | null {
  try { return new URL(value); } catch { return null; }
}

/** Roles describe the hosting browser process, not the authorship of every script inside it. */
export function componentContext(model: ParsedTraceModel, laneId: number, t0: number, t1: number): ComponentContext {
  const lane = model.lanes[laneId]?.meta;
  const process = model.processes.find((process) => process.id === lane?.processId);
  const base = { domain: "", relationship: "", basis: "", evidence: [] as string[] };
  if (lane?.kind === "network") return { ...base, title: "Network requests", description: "Resources requested by the page and its embedded components." };
  if (lane?.kind === "gpu" || process?.isGpu) return { ...base, title: "GPU / graphics", description: "Chrome's graphics process contributes to drawing the page." };
  if (process?.isBrowser) return { ...base, title: "Browser services", description: "Chrome's browser process coordinates browser services." };
  const frames = model.documentFrames.flatMap((frame) => frame.processWindows
    .filter((window) => window.processId === lane?.processId && window.start < t1 && window.end > t0)
    .map((window) => ({ frame, url: parseUrl(window.url) })));
  const urls = frames.flatMap(({ url }) => url ? [url] : []);
  const webUrls = urls.filter((url) => url.protocol === "https:" || url.protocol === "http:");
  const hosts = [...new Set(urls.map((url) => url.host).filter(Boolean))];
  const domain = hosts.join(", ");
  // Omit query strings and fragments. These evidence strings are displayed, never fetched.
  const evidence = [...new Set(webUrls.map((url) => `${url.origin}${url.pathname}`))];
  const main = frames.some(({ frame }) => frame.id === model.mainFrameId);
  if (main || (!model.documentFrames.some((frame) => frame.processWindows.some((window) => window.processId === lane?.processId)) && process?.isOnMainFrame)) {
    return { ...base, title: "Your page", domain: domain || parseUrl(process?.url ?? "")?.host || "", description: "Runs the page's scripts and rendering, including scripts from other sites.", relationship: "Top-level page", basis: "Recorded main-frame process.", evidence };
  }
  const relationship = frames.some(({ frame }) => frame.parentId === model.mainFrameId) ? "Embedded in your page" : frames.some(({ frame }) => frame.parentId) ? "Embedded in another frame" : "Parent not recorded";
  const role = (url: URL) => url.hostname === "challenges.cloudflare.com" && (url.pathname.startsWith("/turnstile/") || /^\/cdn-cgi\/challenge-platform\/[^/]+\/[^/]+\/turnstile\//.test(url.pathname)) ? "turnstile"
    : url.hostname === "vercel.live" && url.pathname.startsWith("/_next-live/feedback/") ? "feedback" : "unknown";
  const roles = new Set(webUrls.map(role));
  if (roles.size === 1 && roles.has("turnstile")) return {
    title: "Cloudflare bot check", domain, description: "Turnstile checks whether a visitor is human.", relationship,
    basis: "Role inferred from the recorded frame URL.", evidence, source: "https://developers.cloudflare.com/turnstile/",
  };
  if (roles.size === 1 && roles.has("feedback")) return {
    title: "Vercel feedback widget", domain, description: "Provides Vercel's in-page feedback tools.", relationship,
    basis: "Role inferred from the recorded frame URL.", evidence, source: "https://vercel.com/docs/vercel-toolbar",
  };
  return { ...base, title: hosts.length > 1 ? "Shared page process" : frames.length ? "Embedded page" : `Browser process ${lane?.processId ?? laneId}`,
    domain, description: "The trace does not establish a more specific role.", relationship, basis: frames.length ? "Recorded frame ownership. Role unknown." : "Frame ownership unavailable in this window.", evidence };
}

export function requestOwner(model: ParsedTraceModel, request: Pick<NetworkRequestInfo, "requesterLane" | "start" | "end">): ComponentContext {
  return request.requesterLane === null || !model.lanes[request.requesterLane]
    ? { title: "Unknown requester", domain: "", description: "No requester thread is available in this trace.", relationship: "", basis: "", evidence: [] }
    : componentContext(model, request.requesterLane, request.start, request.start + 0.001);
}

export function threadLabel(lane: LaneMeta): string {
  if (lane.kind === "main") return "Main thread";
  if (lane.kind === "gpu") return "Graphics thread";
  if (lane.name.startsWith("ThreadPool")) return "Background worker";
  return lane.name.split(" — ")[0];
}

export const CONNECTION_MEANING: Record<ConnectionGraph["edges"][number]["kind"], { label: string; description: string }> = {
  flow: { label: "Recorded event flow", description: "Chrome recorded a flow between these events. This does not establish a page-load bottleneck." },
  initiator: { label: "Task initiation", description: "DevTools inferred which event initiated later work." },
  request: { label: "Resource request", description: "The request has recorded initiator metadata. Its requester thread is resolved from frame or process ownership." },
  consumer: { label: "Resource use (URL match)", description: "The latest request with the same URL started before this work. The match does not prove a dependency." },
};

export function connectionLabel(model: ParsedTraceModel, edge: ConnectionGraph["edges"][number], t0: number, t1: number): string {
  const endpoint = (lane: number) => `${componentContext(model, lane, t0, t1).title} / ${threadLabel(model.lanes[lane].meta)}`;
  return `${endpoint(edge.fromLane)} → ${endpoint(edge.toLane)}`;
}
