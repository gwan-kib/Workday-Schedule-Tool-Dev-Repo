import { scheduleLayout } from "../core/scheduleLayout.js";
import { courseDateRange } from "../core/meetings.js";
import {
  clock,
  sectionLabel,
  conflictDetails,
  conflictText,
  eventLanes,
} from "../core/planner.js";
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c],
  );
const defaults = [
  "#fbd1ce",
  "#ffe0b5",
  "#e5d4f5",
  "#cce4fc",
  "#fff1b0",
  "#cef0cf",
  "#c6ece8",
  "#fbd7e8",
];
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export function timetableFilename(courses, name = "Working Schedule") {
  const dates = courses
    .flatMap((c) => Object.values(courseDateRange(c)))
    .filter(Boolean)
    .sort();
  return `${name}-${dates[0] || "undated"}-${dates.at(-1) || "undated"}`
    .replace(/[^\p{L}\p{N} ._-]/gu, "_")
    .slice(0, 180);
}
// Self-contained SVG pages contain only display details, never links/Workday IDs.
export function timetablePages(
  courses,
  {
    name = "Working Schedule",
    orientation = "landscape",
    palette = defaults,
  } = {},
) {
  const w = orientation === "portrait" ? 794 : 1123,
    h = orientation === "portrait" ? 1123 : 794;
  const layout = scheduleLayout(courses),
    details = conflictDetails(courses);
  const pages = [],
    text = (x, y, s, size = 13, weight = 400) =>
      `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}">${esc(s)}</text>`;
  const headingLimit = Math.floor((w - 60) / 20);
  const heading =
    String(name).length > headingLimit
      ? String(name).slice(0, headingLimit - 1) + "…"
      : String(name);
  const page = (body, index) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="white"/><g font-family="Arial, sans-serif" fill="#172033">${text(30, 32, heading, 20, 700)}${body}${text(30, h - 18, `UBC Workday Schedule Tool · America/Vancouver · Page ${index}`, 11)}</g></svg>`;
  const x0 = 82,
    y0 = 95,
    gridW = w - 112,
    gridH = h - 200,
    dayW = gridW / layout.days.length;
  const start = layout.slots[0],
    end = layout.slots.at(-1),
    scale = gridH / (end - start);
  let body = text(
    30,
    58,
    "All teaching weeks and date ranges. See details for recurrence, instructors, rooms and exact clashes.",
    11,
  );
  layout.days.forEach((d, i) => {
    body += text(x0 + i * dayW + 5, y0 - 12, d, 14, 700);
  });
  for (let n = start; n <= end; n += 60) {
    const y = y0 + (n - start) * scale;
    body +=
      `<path d="M ${x0} ${y} H ${w - 30}" stroke="#d5dbe4"/>` +
      text(30, y + 4, clock(n), 11);
  }
  layout.days.forEach((d, i) => {
    body += `<path d="M ${x0 + i * dayW} ${y0} V ${y0 + gridH}" stroke="#d5dbe4"/>`;
  });
  for (const [day, events] of layout.eventsByDay) {
    const lanes = eventLanes(events);
    for (const ev of events) {
      const { lane, count } = lanes.get(ev.id),
        bw = dayW / count - 4,
        bh = Math.max(2, (ev.endMinutes - ev.startMinutes) * scale);
      const x =
          x0 + layout.days.indexOf(day) * dayW + (lane * dayW) / count + 2,
        y = y0 + (ev.startMinutes - start) * scale;
      const id = `clip-${ev.id}`,
        label = sectionLabel(ev.course),
        conflict = details.conflicts.some(
          (c) =>
            ev.sourceMeetingIds.includes(c.a.id) ||
            ev.sourceMeetingIds.includes(c.b.id),
        );
      const reference = `[${courses.indexOf(ev.course) + 1}]`,
        shortCode = String(ev.code).replace(/\s/g, "");
      const blockLabel =
        (conflict ? "! " : "") +
        reference +
        (bw > 110 && shortCode.length * 6 + 40 < bw ? " " + shortCode : "");
      let blockText = bh >= 13 ? text(x + 4, y + 11, blockLabel, 9, 700) : "";
      if (bh >= 25)
        blockText += text(
          x + 4,
          y + 22,
          bw >= 86
            ? `${clock(ev.startMinutes)}–${clock(ev.endMinutes)}`
            : clock(ev.startMinutes),
          9,
        );
      if (bw < 86 && bh >= 36)
        blockText += text(x + 4, y + 33, clock(ev.endMinutes), 9);
      body += `<defs><clipPath id="${esc(id)}"><rect x="${x + 2}" y="${y}" width="${Math.max(1, bw - 4)}" height="${bh}"/></clipPath></defs><rect x="${x}" y="${y}" width="${Math.max(1, bw)}" height="${bh}" rx="3" fill="${esc(palette[ev.colorIndex - 1] || defaults[0])}" stroke="${conflict ? "#8d2828" : "#506078"}"/><g clip-path="url(#${esc(id)})">${blockText}</g>`;
    }
  }
  body += text(
    30,
    h - 70,
    "[1], [2]… refer to numbered course details. ! Confirmed clash on shared dates; blocks may span different terms/weeks.",
    10,
  );
  body += text(
    30,
    h - 50,
    `${details.conflicts.length} conflicting meeting pair(s); ${details.diagnostics.length} unknown/uncertain meeting pattern(s). Full details follow.`,
    11,
  );
  pages.push(page(body, 1));
  const lines = [];
  const wrap = (s) => {
    // Conservative bound also accommodates wide glyphs and unbroken long titles.
    const width = Math.floor((w - 60) / 13);
    for (const paragraph of String(s).split("\n")) {
      let current = "";
      for (const word of paragraph.split(/\s+/)) {
        if ((current + " " + word).length > width && current) {
          lines.push(current);
          current = "";
        }
        if (word.length > width) {
          if (current) {
            lines.push(current);
            current = "";
          }
          for (let i = 0; i < word.length; i += width)
            lines.push(word.slice(i, i + width));
        } else current += (current ? " " : "") + word;
      }
      if (current) lines.push(current);
    }
  };
  wrap(`Schedule: ${name}`);
  lines.push("");
  courses.forEach((c, index) => {
    wrap(`[${index + 1}] ${sectionLabel(c)}`);
    wrap(c.title || "Title unavailable");
    wrap(`Instructor: ${c.instructor || "Unknown"}`);
    (c.meetingLines?.length
      ? c.meetingLines
      : ["Meeting times unknown"]
    ).forEach(wrap);
    if (c.meetingAnchors)
      wrap(`First meetings: ${c.meetingAnchors.filter(Boolean).join(", ")}`);
    if (c.meetingExceptions)
      wrap(
        `Excluded dates: ${c.meetingExceptions.flat().join(", ") || "None"}`,
      );
    lines.push("");
  });
  wrap("CONFLICT LEGEND AND DETAILS");
  details.conflicts.forEach((c) => {
    wrap(conflictText(c));
    wrap(`Affected dates: ${c.dates.join(", ")}`);
  });
  details.transitions.forEach((t) =>
    wrap(
      `Close transition (not a clash): ${sectionLabel(t.a.course)} → ${sectionLabel(t.b.course)}: ${t.minutes} min.`,
    ),
  );
  details.diagnostics.forEach((d) => {
    const c = courses.find((c) =>
      [
        c.workdayCourseId,
        [c.code, c.section_number].join("|").toLowerCase(),
      ].includes(d.courseId),
    );
    wrap(`Unknown/uncertain: ${c ? sectionLabel(c) : "Meeting"}: ${d.message}`);
  });
  const capacity = Math.floor((h - 105) / 18);
  for (let i = 0; i < lines.length; i += capacity)
    pages.push(
      page(
        lines
          .slice(i, i + capacity)
          .map((line, j) => text(30, 70 + j * 18, line))
          .join(""),
        pages.length + 1,
      ),
    );
  return { pages, width: w, height: h };
}
async function svgCanvas(svg, w, h) {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = w * 2;
    canvas.height = h * 2;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Image export is unavailable in this browser.");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}
const blobFromCanvas = (canvas, type = "image/png") =>
  new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) =>
        b
          ? resolve(b)
          : reject(new Error("Image export failed; try a smaller schedule.")),
      type,
      0.95,
    ),
  );
// Minimal offline PDF writer: one high-resolution JPEG per A4 page.
export function jpegPdf(images, width, height) {
  const enc = new TextEncoder(),
    chunks = [],
    offsets = [0];
  let length = 0;
  const push = (v) => {
    const b = typeof v === "string" ? enc.encode(v) : v;
    chunks.push(b);
    length += b.length;
  };
  const obj = (id, body) => {
    offsets[id] = length;
    push(`${id} 0 obj\n`);
    push(body);
    push("\nendobj\n");
  };
  push("%PDF-1.4\n");
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(
    2,
    `<< /Type /Pages /Count ${images.length} /Kids [${images.map((_, i) => `${3 + i * 3} 0 R`).join(" ")}] >>`,
  );
  const pw = width > height ? 841.89 : 595.28,
    ph = width > height ? 595.28 : 841.89;
  images.forEach((img, i) => {
    const id = 3 + i * 3,
      stream = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`;
    obj(
      id,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 ${id + 2} 0 R >> >> /Contents ${id + 1} 0 R >>`,
    );
    obj(id + 1, `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    offsets[id + 2] = length;
    push(
      `${id + 2} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width * 2} /Height ${height * 2} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.length} >>\nstream\n`,
    );
    push(img);
    push("\nendstream\nendobj\n");
  });
  const xref = length;
  push(`xref\n0 ${offsets.length}\n`);
  push("0000000000 65535 f\r\n");
  for (let i = 1; i < offsets.length; i++)
    push(`${String(offsets[i]).padStart(10, "0")} 00000 n\r\n`);
  push(
    `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`,
  );
  return new Blob(chunks, { type: "application/pdf" });
}
export async function exportTimetable(courses, format, options = {}) {
  if (!courses.length) throw new Error("Add or load courses before exporting.");
  if (!["png", "pdf"].includes(format))
    throw new Error("Unsupported export format.");
  const { pages, width, height } = timetablePages(courses, options);
  let blob;
  if (format === "png") {
    if (height * pages.length * 2 > 30000)
      throw new Error(
        "This schedule is too large for one PNG. Download the paginated PDF instead.",
      );
    const canvas = document.createElement("canvas");
    canvas.width = width * 2;
    canvas.height = height * pages.length * 2;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Image export is unavailable.");
    for (let i = 0; i < pages.length; i++)
      ctx.drawImage(
        await svgCanvas(pages[i], width, height),
        0,
        i * height * 2,
      );
    blob = await blobFromCanvas(canvas);
  } else {
    const images = [];
    for (const svg of pages)
      images.push(
        new Uint8Array(
          await (
            await blobFromCanvas(
              await svgCanvas(svg, width, height),
              "image/jpeg",
            )
          ).arrayBuffer(),
        ),
      );
    blob = jpegPdf(images, width, height);
  }
  downloadBlob(blob, `${timetableFilename(courses, options.name)}.${format}`);
  return blob;
}
