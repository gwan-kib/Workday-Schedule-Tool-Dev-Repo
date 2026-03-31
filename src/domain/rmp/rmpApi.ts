import { debugFor } from "../../lib/debug";
import type { ProfessorRating } from "../../lib/types";

const debug = debugFor("rmpApi");

const RMP_BASE_URL = "https://www.ratemyprofessors.com";
const RMP_API_URL = "https://www.ratemyprofessors.com/graphql";
const BASIC_AUTH_KEY = "dGVzdDp0ZXN0";
export const RMP_MESSAGE_TYPE = "FETCH_RMP_RATING";

const UBCV_SCHOOL_ID = "U2Nob29sLTE0MTM=";
const UBCO_SCHOOL_ID = "U2Nob29sLTU0MzY=";

const HONORIFIC_RE = /^(dr|prof|professor|mr|mrs|ms)\.?\s+/i;
const MULTI_INSTRUCTOR_RE = /\s(?:and|&)\s|\/|;|\|/i;

const responseCache = new Map<string, ProfessorRating | null>();

function normalizeWhitespace(value: string): string {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripInstructorNoise(value: string): string {
  return normalizeWhitespace(value)
    .replace(/\([^)]*\)/g, " ")
    .replace(HONORIFIC_RE, "")
    .replace(/,$/, "")
    .trim();
}

export function normalizeProfessorName(
  value: string,
): { fullName: string; firstName: string; lastName: string } | null {
  const raw = stripInstructorNoise(value);
  if (!raw) return null;

  const upper = raw.toUpperCase();
  if (upper === "N/A" || upper === "TBA" || upper === "STAFF") return null;
  if (MULTI_INSTRUCTOR_RE.test(raw)) return null;

  let normalized = raw;
  if (raw.includes(",")) {
    const commaParts = raw.split(",").map(normalizeWhitespace).filter(Boolean);
    if (commaParts.length !== 2) return null;
    normalized = `${commaParts[1]} ${commaParts[0]}`;
  }

  const parts = normalized
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) return null;

  return {
    fullName: parts.join(" "),
    firstName: parts[0],
    lastName: parts[parts.length - 1],
  };
}

export function inferCampusFromCourseCode(code: string): "UBCV" | "UBCO" {
  const subject = String(code || "")
    .trim()
    .toUpperCase()
    .match(/^([A-Z][A-Z0-9_]{1,8})\s*\d/);

  return subject?.[1]?.endsWith("_O") ? "UBCO" : "UBCV";
}

function getSchoolId(campus: string): string {
  return String(campus || "").toUpperCase() === "UBCO" ? UBCO_SCHOOL_ID : UBCV_SCHOOL_ID;
}

function buildRmpQueryBody(profName: string, schoolID: string) {
  return {
    query:
      'query TeacherSearchResultsPageQuery(\n  $query: TeacherSearchQuery!\n  $schoolID: ID\n  $includeSchoolFilter: Boolean!\n) {\n  search: newSearch {\n    ...TeacherSearchPagination_search_1ZLmLD\n  }\n  school: node(id: $schoolID) @include(if: $includeSchoolFilter) {\n    __typename\n    ... on School {\n      name\n    }\n    id\n  }\n}\n\nfragment TeacherSearchPagination_search_1ZLmLD on newSearch {\n  teachers(query: $query, first: 8, after: "") {\n    didFallback\n    edges {\n      cursor\n      node {\n        ...TeacherCard_teacher\n        id\n        __typename\n      }\n    }\n    pageInfo {\n      hasNextPage\n      endCursor\n    }\n    resultCount\n    filters {\n      field\n      options {\n        value\n        id\n      }\n    }\n  }\n}\n\nfragment TeacherCard_teacher on Teacher {\n  id\n  legacyId\n  avgRating\n  numRatings\n  ...CardFeedback_teacher\n  ...CardSchool_teacher\n  ...CardName_teacher\n  ...TeacherBookmark_teacher\n}\n\nfragment CardFeedback_teacher on Teacher {\n  wouldTakeAgainPercent\n  avgDifficulty\n}\n\nfragment CardSchool_teacher on Teacher {\n  department\n  school {\n    name\n    id\n  }\n}\n\nfragment CardName_teacher on Teacher {\n  firstName\n  lastName\n}\n\nfragment TeacherBookmark_teacher on Teacher {\n  id\n  isSaved\n}\n',
    variables: {
      query: {
        text: profName,
        schoolID,
        fallback: false,
        departmentID: null,
      },
      schoolID,
      includeSchoolFilter: true,
    },
  };
}

function extractTeacherMatch(
  responseJson: unknown,
  normalizedName: { fullName: string; firstName: string; lastName: string },
): ProfessorRating | null {
  const edges = (
    responseJson as {
      data?: {
        search?: {
          teachers?: {
            edges?: Array<{
              node?: {
                avgRating?: number;
                firstName?: string;
                lastName?: string;
                legacyId?: string;
              };
            }>;
          };
        };
      };
    }
  )?.data?.search?.teachers?.edges;

  if (!Array.isArray(edges) || !edges.length) return null;

  const expectedFirst = normalizedName.firstName.toLowerCase();
  const expectedLast = normalizedName.lastName.toLowerCase();

  for (const edge of edges) {
    const teacher = edge?.node;
    if (!teacher || teacher.avgRating === 0) continue;

    const firstName = normalizeWhitespace(teacher.firstName || "").toLowerCase();
    const lastName = normalizeWhitespace(teacher.lastName || "").toLowerCase();

    if (firstName.startsWith(expectedFirst) && lastName.endsWith(expectedLast)) {
      return {
        rating: teacher.avgRating ?? "N/A",
        link: teacher.legacyId ? `${RMP_BASE_URL}/professor/${teacher.legacyId}` : null,
      };
    }
  }

  return null;
}

export async function queryProfRating({
  profName,
  campus,
}: {
  profName?: string;
  campus?: string;
} = {}): Promise<ProfessorRating | null> {
  const normalizedName = normalizeProfessorName(profName || "");
  if (!normalizedName) return null;

  const resolvedCampus = String(campus || "").toUpperCase() === "UBCO" ? "UBCO" : "UBCV";
  const schoolId = getSchoolId(resolvedCampus);
  const cacheId = `${resolvedCampus}|${normalizedName.fullName.toUpperCase()}`;
  if (responseCache.has(cacheId)) return responseCache.get(cacheId) ?? null;

  const response = await fetch(RMP_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${BASIC_AUTH_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildRmpQueryBody(normalizedName.fullName, schoolId)),
  });

  if (!response.ok) {
    const error = new Error(`RateMyProfessors request failed (${response.status})`) as Error & {
      status?: number;
    };
    error.status = response.status;
    throw error;
  }

  const json: unknown = await response.json();
  const result = extractTeacherMatch(json, normalizedName);
  responseCache.set(cacheId, result);
  return result;
}

export function fetchProfRating({
  profName,
  campus,
}: {
  profName?: string;
  campus?: string;
} = {}): Promise<ProfessorRating | null> {
  return new Promise<ProfessorRating | null>((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type: RMP_MESSAGE_TYPE,
        payload: { profName, campus },
      },
      (response: { ok?: boolean; data?: ProfessorRating | null; error?: string } | undefined) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        if (!response?.ok) {
          reject(new Error(response?.error || "RateMyProfessors request failed"));
          return;
        }

        resolve(response.data ?? null);
      },
    );
  }).catch((error) => {
    debug.error(
      { id: "rmpApi.fetchProfRatingFailed" },
      "Failed to resolve RMP rating from background",
      error,
    );
    throw error;
  });
}
