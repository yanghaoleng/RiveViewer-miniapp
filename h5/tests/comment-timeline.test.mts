import assert from "node:assert/strict";
import test from "node:test";
import { formatCommentTimeline, parseCommentTimeline } from "../lib/comment-timeline.ts";

test("stores the selected timeline as an editable comment prefix", () => {
  assert.equal(formatCommentTimeline("idol"), "【时间轴：idol】 ");
  assert.equal(formatCommentTimeline("映"), "【时间轴：映】 ");
  assert.equal(formatCommentTimeline(""), "");
});

test("parses a timeline prefix without changing ordinary comments", () => {
  assert.deepEqual(parseCommentTimeline("【时间轴：idol】 这里需要调整"), {
    timelineName: "idol",
    body: "这里需要调整",
  });
  assert.deepEqual(parseCommentTimeline("普通评论"), {
    timelineName: "",
    body: "普通评论",
  });
});

test("round-trips custom timeline names containing the suffix character", () => {
  const prefix = formatCommentTimeline("开场】开场");
  assert.deepEqual(parseCommentTimeline(`${prefix}确认一下`), {
    timelineName: "开场】开场",
    body: "确认一下",
  });
});
