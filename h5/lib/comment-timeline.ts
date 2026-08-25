const COMMENT_TIMELINE_PREFIX = "【时间轴：";
const COMMENT_TIMELINE_SUFFIX = "】";

export type ParsedCommentTimeline = {
  timelineName: string;
  body: string;
};

export function formatCommentTimeline(timelineName: string): string {
  const normalizedName = timelineName.replace(/[\r\n]+/g, " ").trim();
  if (!normalizedName) return "";
  const escapedName = normalizedName.replaceAll(COMMENT_TIMELINE_SUFFIX, `${COMMENT_TIMELINE_SUFFIX}${COMMENT_TIMELINE_SUFFIX}`);
  return `${COMMENT_TIMELINE_PREFIX}${escapedName}${COMMENT_TIMELINE_SUFFIX} `;
}

export function parseCommentTimeline(body: string): ParsedCommentTimeline {
  if (!body.startsWith(COMMENT_TIMELINE_PREFIX)) return { timelineName: "", body };

  let timelineName = "";
  let index = COMMENT_TIMELINE_PREFIX.length;
  while (index < body.length) {
    const character = body[index];
    if (character !== COMMENT_TIMELINE_SUFFIX) {
      timelineName += character;
      index += 1;
      continue;
    }
    if (body[index + 1] === COMMENT_TIMELINE_SUFFIX) {
      timelineName += COMMENT_TIMELINE_SUFFIX;
      index += 2;
      continue;
    }
    const normalizedName = timelineName.trim();
    if (!normalizedName) return { timelineName: "", body };
    return {
      timelineName: normalizedName,
      body: body.slice(index + 1).replace(/^[\t ]+/, ""),
    };
  }

  return { timelineName: "", body };
}
