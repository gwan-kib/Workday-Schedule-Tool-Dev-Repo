import { debugFor } from "../utilities/debugTool.js";
import { parsSectionLinkString } from "../extraction/parsers/sectionLinkInfo.js";

function getCourseInfo() {
document.addEventListener("mouseover", (e) => {
    const el = e.target.closest('[data-automation-id="promptOption"]');
    if (!el) return;

    const str = el.textContent?.trim();
    if (!str) return;

    const m = str.match(/^\s*([A-Z][A-Z0-9_]*\s*\d{3}[A-Z]?)\s*-\s*(.+?)\s*$/);

    if (m) {
        const courseCode = m[1];  // ACAM_V 100
        const title = m[2];

        console.log("Matched course:", courseCode);
        console.log("Title:", title);
    }
});
}

function readTermCampus(){
document.addEventListener("DOMContentLoaded", () => {
    const m = str.match(/^\s*(\d{4})-\d{2}\s+(Winter|Summer)\s+Term\s+\d+\s+\((UBC-[VO])\)\s*$/i);
    if (!m) return null;

    const startYear = m[1];
    const season = m[2].toLowerCase(); // winter/summer
    const campusRaw = m[3].toUpperCase(); // UBC-V / UBC-O

    const yearsession = `${startYear}${season === "winter" ? "W" : "S"}`;
    const campus = campusRaw === "UBC-V" ? "UBCV" : "UBCO";

    return { campus, yearsession };
})
}