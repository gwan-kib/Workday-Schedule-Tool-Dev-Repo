import { cleanCourse } from "./scheduleBackup.js";
import { courseDateRange } from "./meetings.js";
import { MAX_PERSONAL_BLOCKS, validatePersonalBlocks } from "./personalBlocks.js";
import { formatMeetingLineForPanel } from "../extraction/meetingPatternsInfo.js";

export const SHARE_PAGE = "https://wd10.myworkday.com/ubc/home.htmld";
export const SHARE_PREFIX = "#wst-share-v1=";
export const MAX_SHARE_LINK = 4096;
export const MAX_SHARE_FILE = 512 * 1024;

const FORMAT = "ubc-workday-shared-schedule";
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const textFields = ["code", "section_number", "title", "instructionalFormat", "instructor"];
const stripLinks = value => typeof value === "string"
  ? value.replace(/https?:\/\/[^\s]+/gi, "[link removed]")
  : value;

function portableCourse(course) {
  if (!course || typeof course !== "object")
    throw new Error("The shared schedule contains an invalid course.");

  const fields = Object.fromEntries(textFields.map(key => [key, stripLinks(course[key])]));
  if (!Array.isArray(course.meetingLines ?? []))
    throw new Error("The shared schedule contains invalid meeting lines.");

  return cleanCourse({
    ...fields,
    isOnline: course.isOnline ?? false,
    meetingLines: (course.meetingLines || []).map(stripLinks),
    meetingAnchors: course.meetingAnchors,
    meetingExceptions: course.meetingExceptions,
  });
}

function portableBlocks(blocks) {
  if (!Array.isArray(blocks) || blocks.length > MAX_PERSONAL_BLOCKS)
    throw new Error("The shared personal blocks are invalid.");
  return validatePersonalBlocks(blocks.map((block, index) => ({
    ...block,
    id: "block-" + (index + 1),
    title: stripLinks(block?.title),
    category: stripLinks(block?.category),
  })));
}

export function createSharedSchedule(courses, blocks = []) {
  if (!Array.isArray(courses) || courses.length > 200)
    throw new Error("A share can contain up to 200 courses.");
  if (!courses.length && !blocks.length)
    throw new Error("Add a course or include a personal block before sharing.");
  return {
    format: FORMAT,
    version: 1,
    courses: courses.map(portableCourse),
    personalBlocks: portableBlocks(blocks),
  };
}

export function serializeSharedSchedule(payload) {
  const text = JSON.stringify(payload);
  if (encoder.encode(text).length > MAX_SHARE_FILE)
    throw new Error("This share exceeds 512 KB. Share a smaller schedule.");
  return text;
}

export function parseSharedSchedule(text) {
  if (typeof text !== "string" || text.length > MAX_SHARE_FILE ||
    encoder.encode(text).length > MAX_SHARE_FILE)
    throw new Error("A shared schedule file must be 512 KB or smaller.");

  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error("The shared schedule contains invalid JSON.");
  }
  if (payload?.format !== FORMAT || payload.version !== 1)
    throw new Error("Use a WST shared schedule file or link from this extension.");
  return createSharedSchedule(payload.courses, payload.personalBlocks ?? []);
}

export async function encodeSharedLink(text) {
  const compressed = await new Response(new Blob([text]).stream()
    .pipeThrough(new CompressionStream("deflate"))).arrayBuffer();
  const prefix = SHARE_PAGE + SHARE_PREFIX;
  if (compressed.byteLength > (MAX_SHARE_LINK - prefix.length) * 3 / 4) return null;
  const binary = Array.from(new Uint8Array(compressed), byte => String.fromCharCode(byte)).join("");
  const token = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return prefix + token;
}

export async function decodeSharedLink(input) {
  const text = input.trim();
  const prefix = SHARE_PAGE + SHARE_PREFIX;
  if (text.length > MAX_SHARE_LINK || !text.startsWith(prefix))
    throw new Error("Paste a valid WST share link or choose a shared schedule file.");
  const token = text.slice(prefix.length);
  if (!/^[A-Za-z0-9_-]+$/.test(token))
    throw new Error("The WST share link is incomplete or invalid.");

  let data;
  try {
    const binary = atob(token.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate")).getReader();
    const chunks = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_SHARE_FILE) {
          await reader.cancel();
          throw new Error("Expanded share is too large.");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    data = decoder.decode(await new Blob(chunks).arrayBuffer());
  } catch {
    throw new Error("The WST share link is damaged or exceeds the size limit.");
  }
  return parseSharedSchedule(data);
}

export function sharedScheduleForImport(payload) {
  const courses = payload.courses.map(course => {
    const first = formatMeetingLineForPanel(course.meetingLines[0] || "");
    const format = course.instructionalFormat || "";
    const time = [first.days, first.time].filter(Boolean).join(" | ") || "No meeting time listed";
    const location = course.isOnline ? "Online" : first.location || "No location listed";
    return {
      ...course,
      ...courseDateRange(course),
      meeting: time + "\n" + location,
      isLab: /\b(laboratory|lab)\b/i.test(format),
      isSeminar: /\bseminar\b/i.test(format),
      isDiscussion: /\bdiscussion\b/i.test(format),
      isExperiential: /\bexperiential\b/i.test(format),
    };
  });
  return {
    id: "shared",
    name: "Shared schedule",
    savedAt: new Date().toISOString(),
    courses,
    personalBlocks: payload.personalBlocks.map(block => ({ ...block, id: crypto.randomUUID() })),
  };
}
