import { buildHeaderMaps, findWorkdayGrid } from "../extraction/grid.js";
import { createRowCellReader } from "../extraction/rowCellReader.js";
import { debugFor, debugLog } from "../utilities/debugTool.js";
import {
  fetchSectionGradesWithFallback,
  parseCourseInfoFromPromptText,
  readTermCampus,
} from "./gradesApiCall.js";

const registrationRowSelector = "tr, [role='row'], .wd-GridRow, .grid-row";
const averageButtonSelector = "div.WHPF.WFPF, div.WHMF.WFMF";
const debug = debugFor("registrationAverageButtons");
debugLog({ local: { registrationAverageButtons: false } });

const extractAverage = (data) => {
  if (!data) return null;
  if (Array.isArray(data)) {
    for (const item of data) {
      const average = extractAverage(item);
      if (average != null) return average;
    }
    return null;
  }
  if (typeof data !== "object") return null;

  const direct =
    data.average ?? data.avg ?? data.average_grade ?? data.averagePercent ?? data.avgPercent ?? data.mean ?? null;
  if (typeof direct === "number") return direct;
  if (typeof direct === "string" && direct.trim()) return direct.trim();

  const nested = data?.grades?.average ?? data?.grades?.avg ?? data?.summary?.average ?? data?.summary?.avg ?? null;
  if (typeof nested === "number") return nested;
  if (typeof nested === "string" && nested.trim()) return nested.trim();

  return null;
};

const buildAverageLabel = (average) => {
  if (average == null) return "Average:\nN/A";
  if (typeof average === "number") return `Average:\n${average.toFixed(1)}%`;
  return `Average:\n${average}%`;
};

const hasValidAverage = (data) => extractAverage(data) != null;
const lectureLike = (text) => /\blecture\b/i.test(String(text || ""));
const labLike = (text) => /\b(laboratory)\b/i.test(String(text || ""));
const seminarLike = (text) => /\bseminar\b/i.test(String(text || ""));
const discussionLike = (text) => /\bdiscussion\b/i.test(String(text || ""));
const isLectureFormat = (text) => lectureLike(text) && !labLike(text) && !seminarLike(text) && !discussionLike(text);

// Sets up registration average buttons on Workday pages. Input: none. Output: cleanup function.
export function setupRegistrationAverageButtons() {
  debug.log({ id: "setupRegistrationAverageButtons.start" }, "Initializing registration average buttons");
  let termCampus = readTermCampus();
  let registrationGridContext = null;

  const getRegistrationGridContext = () => {
    if (registrationGridContext?.root?.isConnected) return registrationGridContext;

    const grid = findWorkdayGrid();
    if (!grid?.root) return null;

    registrationGridContext = {
      root: grid.root,
      headerMaps: buildHeaderMaps(grid.root),
    };
    debug.log({ id: "setupRegistrationAverageButtons.gridContext" }, "Cached registration grid context");

    return registrationGridContext;
  };

  const shouldShowAverageButtonForRegistration = (headerWrapper) => {
    const row = headerWrapper?.closest?.(registrationRowSelector);
    if (!row) return false;

    const gridContext = getRegistrationGridContext();
    if (gridContext?.root?.contains(row)) {
      const { readCellTextByHeader } = createRowCellReader(row, gridContext.headerMaps);
      const instructionalFormat = readCellTextByHeader("instructionalFormat");
      if (instructionalFormat) {
        const shouldShow = isLectureFormat(instructionalFormat);
        debug.log({ id: "setupRegistrationAverageButtons.shouldShow.grid" }, "Checked row instructional format", {
          instructionalFormat,
          shouldShow,
        });
        return shouldShow;
      }
    }

    const shouldShow = isLectureFormat(row.innerText || headerWrapper.innerText || "");
    debug.log({ id: "setupRegistrationAverageButtons.shouldShow.fallback" }, "Checked fallback row text", {
      shouldShow,
    });
    return shouldShow;
  };

  const createAverageButton = (courseInfo) => {
    debug.log({ id: "setupRegistrationAverageButtons.createButton" }, "Creating average button", { courseInfo });
    const button = document.createElement("button");
    button.type = "button";
    button.className = "registration__avg-button";
    button.textContent = "Class Average\n(past 5 years)";

    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();

      if (button.dataset.loading === "true") return;
      button.dataset.loading = "true";
      button.textContent = "loading...";
      button.disabled = true;
      debug.log({ id: "setupRegistrationAverageButtons.fetch.start" }, "Fetching average data", { courseInfo });

      termCampus = readTermCampus() || termCampus;
      if (!termCampus) {
        debug.warn({ id: "setupRegistrationAverageButtons.fetch.noTermCampus" }, "Could not determine term campus");
        button.textContent = "Average:\nunavailable";
        button.disabled = false;
        button.dataset.loading = "false";
        return;
      }

      try {
        const data = await fetchSectionGradesWithFallback(
          {
            campus: termCampus.campus,
            yearsession: termCampus.yearsession,
            subject: courseInfo.subject,
            course: courseInfo.course,
            section: courseInfo.section,
          },
          { isValid: hasValidAverage },
        );

        if (!data) {
          debug.warn({ id: "setupRegistrationAverageButtons.fetch.noData" }, "No average data returned", { courseInfo });
          button.textContent = "Average:\nunavailable";
        } else {
          const average = extractAverage(data);
          debug.log({ id: "setupRegistrationAverageButtons.fetch.success" }, "Average data loaded", {
            courseInfo,
            average,
          });
          button.textContent = buildAverageLabel(average);
        }
      } catch (error) {
        debug.error({ id: "setupRegistrationAverageButtons.fetch.error" }, "Failed to load average data", {
          courseInfo,
          error: String(error),
        });
        button.textContent = "Average:\nunavailable";
      } finally {
        button.disabled = false;
        button.dataset.loading = "false";
      }
    });

    return button;
  };

  const ensureAverageButton = (headerWrapper) => {
    if (!headerWrapper || !(headerWrapper instanceof Element)) return;
    if (headerWrapper.previousElementSibling?.classList?.contains("registration__avg-button")) return;
    if (!shouldShowAverageButtonForRegistration(headerWrapper)) return;

    const parentElement = headerWrapper.parentElement;
    if (parentElement) {
      parentElement.style.display = "flex";
      parentElement.style.alignItems = "center";
    }

    const promptOption = headerWrapper.querySelector?.('[data-automation-id="promptOption"]') || headerWrapper;
    const promptText =
      promptOption.getAttribute?.("data-automation-label") ||
      promptOption.getAttribute?.("title") ||
      promptOption.getAttribute?.("aria-label") ||
      promptOption.textContent ||
      "";

    const courseInfo = parseCourseInfoFromPromptText(promptText);
    if (!courseInfo) {
      debug.warn({ id: "setupRegistrationAverageButtons.ensureButton.noCourseInfo" }, "Could not parse course info");
      return;
    }

    const button = createAverageButton(courseInfo);
    headerWrapper.parentNode?.insertBefore(button, headerWrapper);
    debug.log({ id: "setupRegistrationAverageButtons.ensureButton.inserted" }, "Inserted average button", {
      courseInfo,
    });
  };

  const handleAverageButtonNodes = (node) => {
    if (!(node instanceof Element)) return;
    debug.log({ id: "setupRegistrationAverageButtons.handleNodes" }, "Inspecting node for average buttons", {
      tagName: node.tagName,
    });
    if (node.matches?.(averageButtonSelector)) {
      ensureAverageButton(node);
    }
    node.querySelectorAll?.(averageButtonSelector).forEach((el) => ensureAverageButton(el));
  };

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type !== "childList" || mutation.addedNodes.length === 0) return;
      mutation.addedNodes.forEach((node) => handleAverageButtonNodes(node));
    });
  });

  handleAverageButtonNodes(document.body);
  observer.observe(document.body, { childList: true, subtree: true });

  return () => {
    debug.log({ id: "setupRegistrationAverageButtons.cleanup" }, "Disconnecting average button observer");
    observer.disconnect();
  };
}
