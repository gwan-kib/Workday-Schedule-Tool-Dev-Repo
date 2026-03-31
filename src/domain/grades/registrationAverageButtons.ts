import { debugFor } from "../../lib/debug";
import { fetchSectionGradesWithFallback, parseCourseInfoFromPromptText, readTermCampus } from "./gradesApi";

const debug = debugFor("registrationAverageButtons");

const registrationCardSelector = 'li[data-automation-id="compositeContainer"]';
const averageButtonSelector = "div.WHPF.WFPF, div.WHMF.WFMF";
const compositeSubHeaderSelector = '[data-automation-id="compositeSubHeaderOne"]';

function extractAverage(data: unknown): number | string | null {
  if (!data) return null;

  if (Array.isArray(data)) {
    for (const item of data) {
      const average = extractAverage(item);
      if (average != null) return average;
    }
    return null;
  }

  if (typeof data !== "object") return null;

  const record = data as Record<string, unknown>;
  const direct =
    record.average ??
    record.avg ??
    record.average_grade ??
    record.averagePercent ??
    record.avgPercent ??
    record.mean ??
    null;

  if (typeof direct === "number") return direct;
  if (typeof direct === "string" && direct.trim()) return direct.trim();

  const nested =
    (record.grades as Record<string, unknown> | undefined)?.average ??
    (record.grades as Record<string, unknown> | undefined)?.avg ??
    (record.summary as Record<string, unknown> | undefined)?.average ??
    (record.summary as Record<string, unknown> | undefined)?.avg ??
    null;

  if (typeof nested === "number") return nested;
  if (typeof nested === "string" && nested.trim()) return nested.trim();
  return null;
}

const buildAverageLabel = (average: number | string | null) => {
  if (average == null) return "Average:\nN/A";
  if (typeof average === "number") return `Average:\n${average.toFixed(1)}%`;
  return `Average:\n${average}%`;
};

const hasValidAverage = (data: unknown) => extractAverage(data) != null;
const lectureLike = (text: string) => /\blecture\b/i.test(String(text || ""));
const labLike = (text: string) => /\b(laboratory)\b/i.test(String(text || ""));
const seminarLike = (text: string) => /\bseminar\b/i.test(String(text || ""));
const discussionLike = (text: string) => /\bdiscussion\b/i.test(String(text || ""));
const isLectureFormat = (text: string) =>
  lectureLike(text) && !labLike(text) && !seminarLike(text) && !discussionLike(text);

function getRegistrationContainer(headerWrapper: Element | null): Element | null {
  return headerWrapper?.closest(registrationCardSelector) || headerWrapper || null;
}

function getStaticButtonLabel(reason: "not-lecture" | "unavailable"): string {
  return reason === "not-lecture" ? "Not a lecture" : "Average:\nunavailable";
}

export function setupRegistrationAverageButtons(): (() => void) | undefined {
  let termCampus = readTermCampus();

  const getRegistrationAverageButtonState = (headerWrapper: Element) => {
    const row = getRegistrationContainer(headerWrapper);
    if (!row) {
      return {
        buttonMode: "static" as const,
        staticReason: "not-lecture" as const,
      };
    }

    const compositeInstructionalFormat =
      row.querySelector(compositeSubHeaderSelector)?.getAttribute("title") ||
      row.querySelector(compositeSubHeaderSelector)?.textContent ||
      "";

    if (compositeInstructionalFormat) {
      const lecture = isLectureFormat(compositeInstructionalFormat);
      return {
        buttonMode: lecture ? ("interactive" as const) : ("static" as const),
        staticReason: lecture ? null : ("not-lecture" as const),
      };
    }

    const fallbackInstructionalText = row.textContent || headerWrapper.textContent || "";
    const lecture = isLectureFormat(fallbackInstructionalText);
    return {
      buttonMode: lecture ? ("interactive" as const) : ("static" as const),
      staticReason: lecture ? null : ("not-lecture" as const),
    };
  };

  const createAverageButton = ({
    courseInfo = null,
    mode = "interactive",
    staticReason = null,
  }: {
    courseInfo?: ReturnType<typeof parseCourseInfoFromPromptText>;
    mode?: "interactive" | "static";
    staticReason?: "not-lecture" | "unavailable" | null;
  }) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "registration__avg-button";

    if (mode === "static") {
      button.classList.add("registration__avg-button--static");
      button.textContent = getStaticButtonLabel(staticReason ?? "unavailable");
      button.disabled = true;
      button.tabIndex = -1;
      return button;
    }

    button.textContent = "Class Average\n(past 5 years)";

    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      if (button.dataset.loading === "true" || !courseInfo) return;

      button.dataset.loading = "true";
      button.textContent = "loading...";
      button.disabled = true;

      void (async () => {
        termCampus = readTermCampus() || termCampus;
        if (!termCampus) {
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

          button.textContent = data ? buildAverageLabel(extractAverage(data)) : "Average:\nunavailable";
        } catch (error) {
          debug.error({ id: "registrationAverageButtons.fetchFailed" }, "Failed to load average data", error);
          button.textContent = "Average:\nunavailable";
        } finally {
          button.disabled = false;
          button.dataset.loading = "false";
        }
      })();
    });

    return button;
  };

  const ensureAverageButton = (headerWrapper: Element) => {
    if (headerWrapper.previousElementSibling?.classList.contains("registration__avg-button")) return;

    const buttonState = getRegistrationAverageButtonState(headerWrapper);
    const parentElement = headerWrapper.parentElement;

    if (parentElement) {
      parentElement.style.display = "flex";
      parentElement.style.alignItems = "center";
    }

    if (buttonState.buttonMode === "static") {
      headerWrapper.parentNode?.insertBefore(
        createAverageButton({ mode: "static", staticReason: buttonState.staticReason }),
        headerWrapper,
      );
      return;
    }

    const promptOption = headerWrapper.querySelector('[data-automation-id="promptOption"]') || headerWrapper;
    const promptText =
      promptOption.getAttribute("data-automation-label") ||
      promptOption.getAttribute("title") ||
      promptOption.getAttribute("aria-label") ||
      promptOption.textContent ||
      "";

    const courseInfo = parseCourseInfoFromPromptText(promptText);
    if (!courseInfo) {
      headerWrapper.parentNode?.insertBefore(
        createAverageButton({ mode: "static", staticReason: "unavailable" }),
        headerWrapper,
      );
      return;
    }

    headerWrapper.parentNode?.insertBefore(
      createAverageButton({ courseInfo, mode: "interactive" }),
      headerWrapper,
    );
  };

  const handleAverageButtonNodes = (node: Node) => {
    if (!(node instanceof Element)) return;

    if (node.matches(averageButtonSelector)) ensureAverageButton(node);
    node.querySelectorAll(averageButtonSelector).forEach((el) => ensureAverageButton(el));
  };

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type !== "childList" || mutation.addedNodes.length === 0) return;
      mutation.addedNodes.forEach((node) => handleAverageButtonNodes(node));
    });
  });

  handleAverageButtonNodes(document.body);
  observer.observe(document.body, { childList: true, subtree: true });

  return () => observer.disconnect();
}
