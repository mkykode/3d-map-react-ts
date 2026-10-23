import { describe, expect, it } from "vitest";
import { sceneLane, sceneModel } from "../test/sceneFixtures";
import { componentContext, requestOwner } from "./systemContext";
import { readFileSync } from "node:fs";
import { parseTrace } from "../engine/adapter";

function frameModel(url = "https://challenges.cloudflare.com/turnstile/v0/widget") {
  const model = sceneModel([sceneLane([])]);
  model.lanes[0].meta.processId = 42;
  model.mainFrameId = "page";
  model.documentFrames = [{ id: "widget", parentId: "page", name: "", processWindows: [{ processId: 42, url, start: 0, end: 100 }] }];
  return model;
}

describe("System component context", () => {
  it("explains the real demo's embedded products, including Cloudflare's blank helper frames", async () => {
    const raw = JSON.parse(readFileSync(new URL("../../public/demo-trace.json", import.meta.url), "utf8"));
    const model = await parseTrace(raw.traceEvents);
    const roles = model.lanes.filter((lane) => lane.meta.kind === "main").map((lane) => componentContext(model, lane.meta.id, 0, model.rangeMs));
    expect(roles.map((role) => role.title)).toEqual(expect.arrayContaining(["Your page", "Cloudflare bot check", "Vercel feedback widget"]));
    expect(roles.find((role) => role.title === "Cloudflare bot check")?.relationship).toBe("Embedded in your page");
    expect(roles.find((role) => role.title === "Vercel feedback widget")?.relationship).toBe("Embedded in your page");
  });
  it("identifies a bot check from its frame path and explains its recorded parent", () => {
    expect(componentContext(frameModel(), 0, 0, 100)).toMatchObject({ title: "Cloudflare bot check", domain: "challenges.cloudflare.com", relationship: "Embedded in your page", basis: "Role inferred from the recorded frame URL." });
  });

  it("does not infer a product from its domain alone or an unrelated request", () => {
    const model = frameModel("https://challenges.cloudflare.com/unknown");
    model.requests = [{ start: 1, end: 5, url: "https://vercel.live/_next-live/feedback/feedback.js", requesterLane: 0, initiatorType: null, renderBlocking: false }];
    expect(componentContext(model, 0, 0, 100).title).toBe("Embedded page");
    expect(componentContext(frameModel("https://vercel.live.evil.test/_next-live/feedback/feedback.html"), 0, 0, 100).title).toBe("Embedded page");
  });

  it("uses the selected frame window and avoids assigning one role to a shared process", () => {
    const model = frameModel();
    model.documentFrames[0].processWindows.push({ processId: 42, url: "https://vercel.live/_next-live/feedback/feedback.html", start: 100, end: 200 });
    expect(componentContext(model, 0, 100, 200).title).toBe("Vercel feedback widget");
    expect(componentContext(model, 0, 0, 200).title).toBe("Shared page process");
    expect(componentContext(model, 0, 200, 300).title).toBe("Browser process 42");
  });

  it("keeps unknown ownership explicit rather than guessing from the download host", () => {
    const model = frameModel();
    expect(requestOwner(model, { requesterLane: null, start: 1, end: 5 }).title).toBe("Unknown requester");
    expect(requestOwner(model, { requesterLane: 0, start: 1, end: 5 }).title).toBe("Cloudflare bot check");
  });
});
