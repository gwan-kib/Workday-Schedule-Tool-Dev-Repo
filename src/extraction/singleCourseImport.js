import { debugFor, debugLog } from "../utilities/debugTool.js";
import { parseSectionLinkString } from "./parsers/sectionLinkInfo.js";
import {
  extractMeetingLines,
  extractStartDate,
  formatMeetingLineForPanel,
  isOnlineDelivery,
  normalizeMeetingPatternsText,
} from "./parsers/meetingPatternsInfo.js";

const debug = debugFor("singleCourseImport");
debugLog({ local: { singleCourseImport: false } });

const SECTION_PROMPT_SELECTOR = '[data-automation-id="promptOption"]';
const COMPOSITE_SUBHEADER_SELECTOR = '[data-automation-id="compositeSubHeaderOne"]';
const WORKDAY_HOST_RE = /(^|\.)myworkday\.com$/i;
const WORKDAY_JSON_LABELS = new Set(["Course", "Instructor Teaching", "Instructional Formats", "Meeting Patterns"]);
const MEETING_LINE_RE =
  /\b\d{4}-\d{2}-\d{2}\s*-\s*\d{4}-\d{2}-\d{2}\b(?:(?!\b\d{4}-\d{2}-\d{2}\s*-\s*\d{4}-\d{2}-\d{2}\b)[\s\S])*?\b\d{1,2}:\d{2}\s*[ap]\.?m\.?\s*-\s*\d{1,2}:\d{2}\s*[ap]\.?m\.?/gi;

const readElementLabel = (el) =>
  (
    el?.getAttribute?.("data-automation-label") ||
    el?.getAttribute?.("title") ||
    el?.getAttribute?.("aria-label") ||
    el?.textContent ||
    ""
  ).trim();

const normalizeSpaces = (value) =>
  String(value || "")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const getReadableLines = (root) =>
  String(root?.innerText || root?.textContent || "")
    .replace(/\u00A0/g, " ")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

const hasText = (value, pattern) => pattern.test(String(value || ""));
const labLike = (text) => hasText(text, /\b(laboratory|lab)\b/i);
const seminarLike = (text) => hasText(text, /\bseminar\b/i);
const discussionLike = (text) => hasText(text, /\bdiscussion\b/i);

function readInstanceText(instance) {
  if (!instance || typeof instance !== "object") return normalizeSpaces(instance);
  return normalizeSpaces(instance.text || instance.value || instance.descriptor || instance.label || "");
}

function readNodeInstances(node) {
  return Array.isArray(node?.instances) ? node.instances.map(readInstanceText).filter(Boolean) : [];
}

function collectWorkdayNodesWithLabels(root) {
  const results = [];
  const stack = Array.isArray(root) ? [...root] : [root];

  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== "object") continue;

    if (typeof node.label === "string" && WORKDAY_JSON_LABELS.has(node.label)) results.push(node);
    if (Array.isArray(node.children)) stack.push(...node.children);
  }

  return results;
}

function getWorkdayJsonChildren(data) {
  const bodyChildren = data?.body?.children;
  if (!Array.isArray(bodyChildren)) return [];
  return bodyChildren[0]?.children || bodyChildren;
}

function readWorkdayJsonTitle(data) {
  return readNodeInstances(data?.title)?.[0] || readInstanceText(data?.title?.instances?.[0]);
}

function getCourseIdFromUrl(url) {
  const parts = String(url || "").split("$");
  return parts[2]?.split(".")?.[0] || "";
}

function getTenantPath(url) {
  try {
    return new URL(url).pathname.split("/").filter(Boolean)[0] || "ubc";
  } catch (error) {
    return "ubc";
  }
}

function normalizeWorkdayJsonUrl(url) {
  const parsed = new URL(url);
  // Workday copied URLs often include /d/, which returns a document response.
  // Removing that segment asks the same endpoint for the JSON payload.
  parsed.pathname = parsed.pathname.replace("/d/", "/");
  return parsed.href;
}

function buildWorkdayJsonUrlFromId(courseId, baseUrl = window.location.href) {
  const base = new URL(baseUrl);
  const tenant = getTenantPath(base.href);
  return `${base.origin}/${tenant}/inst/1$15194/15194$${courseId}.htmld`;
}

function parseSectionTitleText(titleText, courseText = "") {
  const direct = parseSectionLinkString(titleText);
  if (direct) return direct;

  const match = normalizeSpaces(titleText).match(/^(.+?)-(\S+)\s*-\s*(.+)$/);
  if (match) {
    return {
      code: normalizeSpaces(match[1]),
      section_number: normalizeSpaces(match[2]),
      title: normalizeSpaces(match[3]).replace(/\s*:\s*/g, ":\n"),
      full: titleText,
    };
  }

  const courseParts = normalizeSpaces(courseText).split(/\s+-\s+/);
  const sectionMatch = normalizeSpaces(titleText).match(/^[^-]+-(\S+)/);
  if (courseParts[0] && sectionMatch?.[1]) {
    return {
      code: courseParts[0],
      section_number: sectionMatch[1],
      title: courseParts.slice(1).join(" - "),
      full: titleText || courseText,
    };
  }

  return null;
}

function createCourseObject({
  sectionDetails,
  instructors = [],
  instructionalFormat = "",
  meetingLines = [],
  isOnline = false,
  workdayCourseId = "",
}) {
  const format = normalizeSpaces(instructionalFormat);
  const isLab = labLike(format);
  const isSeminar = seminarLike(format);
  const isDiscussion = discussionLike(format);
  const uniqueMeetingLines = [...new Set(meetingLines.map(normalizeSpaces).filter(Boolean))];

  return {
    code: sectionDetails.code,
    title: sectionDetails.title,
    section_number: sectionDetails.section_number,
    instructor: instructors.length ? instructors.join(", ") : "N/A",
    meeting: buildMeetingDisplay(uniqueMeetingLines, isOnline),
    instructionalFormat: format,
    startDate: extractStartDate(uniqueMeetingLines[0]) || "",
    meetingLines: uniqueMeetingLines,
    isLab,
    isSeminar,
    isDiscussion,
    workdayCourseId,
  };
}

function findSectionDetails(root) {
  const prompts = Array.from(root?.querySelectorAll?.(SECTION_PROMPT_SELECTOR) || []);

  for (const prompt of prompts) {
    const details = parseSectionLinkString(readElementLabel(prompt));
    if (details) return { details, prompt };
  }

  const textDetails = parseSectionLinkString(normalizeSpaces(root?.innerText || root?.textContent || ""));
  return textDetails ? { details: textDetails, prompt: null } : null;
}

export function extractWorkdayCourseIdFromElement(root) {
  const selectedCourseEl = root?.querySelector?.('[data-automation-id^="selectedItem_15194"]');
  const automationId = selectedCourseEl?.getAttribute?.("data-automation-id") || "";
  const courseId = automationId.split("_")[1]?.split("$")[1] || "";

  return courseId;
}

function splitCompositeSubHeader(root) {
  const subHeaderText = readElementLabel(root?.querySelector?.(COMPOSITE_SUBHEADER_SELECTOR));
  return subHeaderText
    .split("|")
    .map((part) => normalizeSpaces(part))
    .filter(Boolean);
}

function readValueAfterLabel(lines, labels) {
  const labelSet = new Set(labels.map((label) => label.toLowerCase()));
  const stopLabelRe = /^(instructor|instructors|meeting patterns?|delivery mode|instructional format|status|section|credits?)\b/i;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const compact = line.replace(/:$/, "").toLowerCase();

    if (labelSet.has(compact)) {
      const next = lines.slice(index + 1).find((candidate) => candidate && !stopLabelRe.test(candidate));
      if (next) return next;
    }

    const inlineMatch = line.match(new RegExp(`^(${labels.join("|")})\\s*:?\\s+(.+)$`, "i"));
    if (inlineMatch?.[2]) return inlineMatch[2].trim();
  }

  return "";
}

function readInstructionalFormat(root, lines) {
  const compositeFormat = splitCompositeSubHeader(root)[0] || "";
  const labelText = readValueAfterLabel(lines, ["Instructional Format", "Format"]);
  const source = normalizeSpaces(compositeFormat || labelText || "");

  if (labLike(source)) return "Lab";
  if (seminarLike(source)) return "Seminar";
  if (discussionLike(source)) return "Discussion";
  if (/\blecture\b/i.test(source)) return "Lecture";

  return source;
}

function extractMeetingLinesFromText(lines) {
  const text = lines.join("\n");
  const matches = text.match(MEETING_LINE_RE) || [];

  return matches
    .map((line) => normalizeSpaces(line.replace(/\n/g, " ")))
    .filter((line) => /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/i.test(line));
}

function buildMeetingDisplay(meetingLines, isOnline) {
  if (!meetingLines.length) return isOnline ? "No meeting time listed\nOnline" : "No meeting time listed";

  const meetingObj = formatMeetingLineForPanel(meetingLines[0]);
  if (isOnline) meetingObj.location = "Online";

  const meeting = [meetingObj.days, meetingObj.time].filter(Boolean).join(" | ");
  return normalizeMeetingPatternsText(`${meeting}\n${meetingObj.location || (isOnline ? "Online" : "")}`);
}

// Extracts one course from a Workday registration card/detail root. Input: Element/Document. Output: course object or null.
export function extractCourseFromRegistrationCard(root) {
  if (!root) return null;

  const sectionMatch = findSectionDetails(root);
  if (!sectionMatch?.details) {
    debug.warn({ id: "extractCourseFromRegistrationCard.noSection" }, "Could not find section link text");
    return null;
  }

  const lines = getReadableLines(root);
  const instructionalFormat = readInstructionalFormat(root, lines);
  const instructor = readValueAfterLabel(lines, ["Instructor", "Instructors"]) || "N/A";
  const meetingLines = extractMeetingLines(root).concat(extractMeetingLinesFromText(lines));
  const uniqueMeetingLines = [...new Set(meetingLines)];
  const isOnline = isOnlineDelivery(root) || lines.some((line) => /online learning/i.test(line));

  if (!uniqueMeetingLines.length) {
    debug.log({ id: "extractCourseFromRegistrationCard.noMeeting" }, "No meeting lines found; adding unscheduled course", {
      section: sectionMatch.details.full,
    });
  }

  const course = {
    ...createCourseObject({
      sectionDetails: sectionMatch.details,
      instructors: instructor && instructor !== "N/A" ? [instructor] : [],
      instructionalFormat,
      meetingLines: uniqueMeetingLines,
      isOnline,
      workdayCourseId: extractWorkdayCourseIdFromElement(root),
    }),
  };

  debug.log({ id: "extractCourseFromRegistrationCard.result" }, "Extracted single course", course);
  return course;
}

export function extractCourseFromWorkdayJson(data, { sourceUrl = "" } = {}) {
  if (!data || typeof data !== "object") throw new Error("Workday did not return course JSON.");

  const selectedNodes = collectWorkdayNodesWithLabels(getWorkdayJsonChildren(data));
  const findNode = (label) => selectedNodes.find((node) => node.label === label);

  const courseText = readNodeInstances(findNode("Course"))[0] || "";
  const titleText = readWorkdayJsonTitle(data) || courseText;
  const sectionDetails = parseSectionTitleText(titleText, courseText);
  if (!sectionDetails) throw new Error("Could not find a course section in the Workday JSON.");

  const instructors = readNodeInstances(findNode("Instructor Teaching"));
  const instructionalFormat = readNodeInstances(findNode("Instructional Formats"))[0] || "";
  const meetingLines = readNodeInstances(findNode("Meeting Patterns"));
  const workdayCourseId = getCourseIdFromUrl(sourceUrl);

  const course = createCourseObject({
    sectionDetails,
    instructors,
    instructionalFormat,
    meetingLines,
    isOnline: false,
    workdayCourseId,
  });

  debug.log({ id: "extractCourseFromWorkdayJson.result" }, "Extracted course from Workday JSON", course);
  return course;
}

// Validates that a user-entered link points to Workday. Input: string. Output: validation result.
export function validateWorkdayCourseLink(value) {
  const raw = String(value || "").trim();
  if (!raw) return { ok: false, error: "Paste a Workday course link first." };

  let url;
  try {
    url = new URL(raw);
  } catch (error) {
    return { ok: false, error: "That does not look like a valid URL." };
  }

  if (!/^https?:$/i.test(url.protocol) || !WORKDAY_HOST_RE.test(url.hostname)) {
    return { ok: false, error: "Use a Workday link from a myworkday.com page." };
  }

  return { ok: true, url: normalizeWorkdayJsonUrl(url.href) };
}

// Loads a Workday course link and parses it with the same course shape used by schedule imports.
export async function fetchCourseFromWorkdayLink(link) {
  const validation = validateWorkdayCourseLink(link);
  if (!validation.ok) throw new Error(validation.error);

  debug.log({ id: "fetchCourseFromWorkdayLink.start" }, "Fetching Workday course JSON link", { url: validation.url });
  const response = await fetch(validation.url, { credentials: "include" });
  if (!response.ok) throw new Error(`Workday returned ${response.status} for that course link.`);

  let data;
  try {
    data = await response.json();
  } catch (error) {
    throw new Error("Workday did not return course JSON. Use the URL copied from the course title.");
  }

  const course = extractCourseFromWorkdayJson(data, { sourceUrl: validation.url });

  debug.log({ id: "fetchCourseFromWorkdayLink.done" }, "Parsed course from Workday link", course);
  return course;
}

export async function fetchCourseFromWorkdayId(courseId, { baseUrl = window.location.href } = {}) {
  const normalizedId = normalizeSpaces(courseId);
  if (!normalizedId) throw new Error("Course ID not found.");

  return fetchCourseFromWorkdayLink(buildWorkdayJsonUrlFromId(normalizedId, baseUrl));
}
