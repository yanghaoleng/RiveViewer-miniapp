import assert from "node:assert/strict";
import test from "node:test";
import { organizeTimelines } from "../lib/timeline-groups.ts";

test("groups repeated first-level timeline prefixes and keeps deeper names", () => {
  assert.deepEqual(organizeTimelines([
    "TalkingEmotion_Normal_close",
    "idle",
    "TalkingEmotion_Happy",
    "Single_only",
  ]), [
    {
      type: "group",
      prefix: "TalkingEmotion",
      items: [
        { name: "TalkingEmotion_Normal_close", label: "Normal_close" },
        { name: "TalkingEmotion_Happy", label: "Happy" },
      ],
    },
    { type: "timeline", item: { name: "idle", label: "idle" } },
    { type: "timeline", item: { name: "Single_only", label: "Single_only" } },
  ]);
});

test("keeps invalid separators and exact full names selectable", () => {
  assert.deepEqual(organizeTimelines(["_intro", "Outro_", "A_one", "A_two_three"]), [
    { type: "timeline", item: { name: "_intro", label: "_intro" } },
    { type: "timeline", item: { name: "Outro_", label: "Outro_" } },
    {
      type: "group",
      prefix: "A",
      items: [
        { name: "A_one", label: "one" },
        { name: "A_two_three", label: "two_three" },
      ],
    },
  ]);
});
