import { fetchReliable, TtlCache } from "../utilities/network.js";

export const CATALOG_MESSAGE_TYPE = "WST_LOOK_UP_COURSE_SECTIONS";
const ORIGIN = "https://courses.students.ubc.ca";
const SECTION_PATH = "/jsonapi/node/section";
const PAGE_SIZE = 50;
const MAX_PAGES = 6;
const cache = new TtlCache(5 * 60 * 1000);
const relationships = [
  "field_course",
  "field_academic_term",
  "field_instructional_method",
  "field_delivery_mode",
  "field_status",
];

export function catalogCourseCode(value) {
  const code = typeof value === "string" ? value.trim().replace(/\s+/g, " ").toUpperCase() : "";
  return /^[A-Z][A-Z0-9]*_[OV] \d{3}[A-Z]?$/.test(code) ? code : "";
}

export function catalogSectionLink(value) {
  try {
    const url = new URL(value);
    if (url.origin === ORIGIN && !url.username && !url.password &&
      /^\/courses\/[a-z0-9-]+\/[a-z0-9-]+\/?$/i.test(url.pathname)) {
      return ORIGIN + url.pathname;
    }
  } catch {
    // Invalid URLs never reach the section link control.
  }
  return "";
}

function catalogUrl(code, offset) {
  const url = new URL(SECTION_PATH, ORIGIN);
  const params = url.searchParams;
  params.set("filter[field_course.field_course_code]", code);
  params.set("filter[field_is_visible]", "1");
  params.set("include", relationships.join(","));
  params.set("fields[node--section]", [
    ...relationships, "field_section_number", "field_cluster_section_s", "field_section_comments",
    "field_time_varies", "field_instructors", "field_days", "field_start_time",
    "field_end_time", "field_start_date", "field_end_date", "path",
  ].join(","));
  params.set("fields[node--course]", "field_course_code,title");
  params.set("page[limit]", String(PAGE_SIZE));
  params.set("page[offset]", String(offset));
  return url;
}

function readPage(page, code) {
  if (!Array.isArray(page?.data) || page.data.length > PAGE_SIZE ||
    (page.included !== undefined && !Array.isArray(page.included)))
    throw new Error("UBC returned an incomplete section listing.");

  const resources = new Map((page.included || []).map(item => [item.type + ":" + item.id, item.attributes]));
  return page.data.map(row => {
    const a = row.attributes;
    const related = key => {
      const ref = row.relationships?.[key]?.data;
      return ref && resources.get(ref.type + ":" + ref.id);
    };
    const course = related("field_course");
    if (row.type !== "node--section" || !a || typeof row.id !== "string" ||
      catalogCourseCode(course?.field_course_code) !== code) {
      throw new Error("UBC returned a section for an unverified course.");
    }

    return {
      id: row.id,
      section: a.field_section_number,
      title: course.title,
      term: related("field_academic_term")?.name,
      format: related("field_instructional_method")?.name,
      mode: related("field_delivery_mode")?.name,
      status: related("field_status")?.name,
      startDate: a.field_start_date,
      endDate: a.field_end_date,
      days: a.field_days,
      startTime: a.field_start_time,
      endTime: a.field_end_time,
      varies: a.field_time_varies !== false,
      instructors: a.field_instructors,
      hasRestrictions: Boolean(a.field_cluster_section_s || a.field_section_comments),
      link: typeof a.path?.alias === "string" ? catalogSectionLink(ORIGIN + a.path.alias) : "",
    };
  });
}

async function fetchPage(url) {
  const response = await fetchReliable(url.href, {
    credentials: "omit",
    redirect: "error",
    headers: { Accept: "application/vnd.api+json" },
  }, { retries: 1, timeoutMs: 6000 });
  return response.json();
}

export async function readCourseCatalog(value, { loadPage = fetchPage } = {}) {
  const code = catalogCourseCode(value);
  if (!code) throw new Error("The UBC course code is missing or unsupported.");

  const sections = new Map();
  for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex++) {
    const offset = pageIndex * PAGE_SIZE;
    const page = await loadPage(catalogUrl(code, offset));
    for (const row of readPage(page, code)) sections.set(row.id, row);
    if (!page.links?.next) return [...sections.values()];

    const next = new URL(page.links.next.href);
    if (next.origin !== ORIGIN || next.pathname !== SECTION_PATH ||
      next.searchParams.get("filter[field_course.field_course_code]") !== code ||
      next.searchParams.get("page[offset]") !== String(offset + PAGE_SIZE)) {
      throw new Error("UBC returned an invalid section page.");
    }
  }
  throw new Error("The UBC catalog did not return a complete list within the search limit.");
}

export async function loadCourseCatalog(code) {
  const normalized = catalogCourseCode(code);
  if (!normalized) throw new Error("The UBC course code is missing or unsupported.");
  const sections = await cache.get(normalized, () => readCourseCatalog(normalized));
  if (sections.stale) throw new Error("The current UBC section listing could not be refreshed.");
  return sections;
}

export function requestCourseCatalog(code) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: CATALOG_MESSAGE_TYPE, code }, (result) => {
      if (chrome.runtime.lastError || !result?.ok || !Array.isArray(result.sections)) {
        reject(new Error("Could not load this course from UBC’s public catalog."));
        return;
      }
      resolve(result.sections);
    });
  });
}
