export const WORKDAY_SELECTORS = {
  selectedCourse: '[data-automation-id^="selectedItem_15194$"]',
  sectionLink: 'a[href*="15194$"]',
  registrationCard: 'li[data-automation-id="compositeContainer"]',
  coursePrompt: '[data-automation-id="compositeHeader"] [data-automation-id="promptOption"]',
  compositeSubHeader: '[data-automation-id="compositeSubHeaderOne"]',
  emptySchedule: '[data-automation-id="noDataMessage"]',
  login: 'input[data-automation-id="username"], input[type="password"]',
};
export function sectionId(value) {
  return String(value || "").match(/(?:selectedItem_15194\$|\/15194\$)(\d+)(?:\.htmld)?(?:$|[?#])/i)?.[1] || "";
}
export function collectSectionEntries(root) {
  const entries = new Map();
  const nodes = root?.querySelectorAll?.(`${WORKDAY_SELECTORS.selectedCourse}, ${WORKDAY_SELECTORS.sectionLink}`) || [];
  for (const node of nodes) {
    const id = sectionId(node.getAttribute("data-automation-id")) || sectionId(node.getAttribute("href"));
    if (id) entries.set(id, { courseId: id, label: node.textContent || "" });
  }
  return [...entries.values()];
}
