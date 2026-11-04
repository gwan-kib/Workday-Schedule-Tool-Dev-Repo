import { scheduleLayout } from "../core/scheduleLayout.js";
import { courseDateRange, normalizeSchedule, DAYS } from "../core/meetings.js";
import { eventLanes } from "../core/planner.js";
const esc = (value) =>
  String(value ?? "").replace(
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
const backgrounds = [
  "#ffc2b5",
  "#ffd2a0",
  "#dfc4ff",
  "#b9d6ff",
  "#fff5ae",
  "#c9efa7",
  "#c6ffe8",
  "#ffc4df",
];
const subBackgrounds = [
  "#ffe3dd",
  "#ffe5c8",
  "#ede0ff",
  "#ddebff",
  "#fffbdf",
  "#e3ffca",
  "#e7fff5",
  "#ffe1ee",
];
const borders = [
  "#e1745c",
  "#db9140",
  "#8839e3",
  "#4887e1",
  "#ecd125",
  "#69d00a",
  "#1bdfd3",
  "#db4d8c",
];
const fullDays = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
const svgText = (x, y, value, size = 11, weight = 400, extra = "") =>
  `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" ${extra}>${esc(value)}</text>`;
const svg = (width, height, body, bg = "white") =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="${esc(bg)}"/><g font-family="Arial, sans-serif" fill="#000000">${body}</g></svg>`;
export function exportAppearance(target) {
  const style = target ? getComputedStyle(target) : null;
  const read = (key, fallback) =>
    style?.getPropertyValue(key).trim() || fallback;
  return {
    palette: backgrounds.map((v, i) => read(`--course-color-${i + 1}-bg`, v)),
    subPalette: subBackgrounds.map((v, i) =>
      read(`--course-color-${i + 1}-sub-bg`, v),
    ),
    borderPalette: borders.map((v, i) =>
      read(`--course-color-${i + 1}-border`, v),
    ),
    theme: {
      main: read("--hex-brand-main-1", "#3b45a4"),
      background: read("--hex-brand-accent-1", "#f6f7fe"),
      headerText: read("--hex-brand-accent-3", "#e1e5fb"),
      pill: read("--hex-brand-accent-5", "#8f98e0"),
    },
  };
}
export function timeLabel(minutes, format = "am/pm") {
  const hour = Math.floor(minutes / 60),
    minute = String(minutes % 60).padStart(2, "0");
  return format === "24h"
    ? `${String(hour).padStart(2, "0")}:${minute}`
    : `${hour % 12 || 12}:${minute} ${hour >= 12 ? "PM" : "AM"}`;
}
const proseTime = (minutes) =>
  `${Math.floor(minutes / 60) % 12 || 12}:${String(minutes % 60).padStart(2, "0")} ${minutes >= 720 ? "p.m." : "a.m."}`;
function textWidth(value, size) {
  return [...String(value)].reduce(
    (n, c) =>
      n +
      size *
        (/[MW@%]/.test(c)
          ? 0.92
          : /[ilI.,' :;!|]/.test(c)
            ? 0.3
            : /[A-Z0-9]/.test(c)
              ? 0.65
              : 0.55),
    0,
  );
}
function wrapText(value, width, size) {
  const result = [];
  for (const paragraph of String(value).split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (line && textWidth(line + " " + word, size) > width) {
        result.push(line);
        line = "";
      }
      if (textWidth(word, size) > width) {
        if (line) {
          result.push(line);
          line = "";
        }
        for (const ch of word) {
          if (line && textWidth(line + ch, size) > width) {
            result.push(line);
            line = "";
          }
          line += ch;
        }
      } else line += (line ? " " : "") + word;
    }
    result.push(line);
  }
  return result;
}
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

export function courseDetailLines(course) {
  const lines = [
    [course.code, course.section_number, course.instructionalFormat]
      .filter(Boolean)
      .join(" "),
    course.title || "Title unavailable",
    `Instructor: ${course.instructor || "Not listed"}`,
  ];
  const meetings = normalizeSchedule([course]).meetings,
    seen = new Set();
  for (const meeting of meetings) {
    const parts = meeting.location
      .split("|")
      .map((p) => p.trim())
      .filter(Boolean);
    const building = parts
      .filter((p) => !/^UBC[OV]?$/i.test(p) && !/^Floor\s*:|^Room\s*:/i.test(p))
      .join(" / ");
    const floor = parts.find((p) => /^Floor\s*:/i.test(p)),
      room = parts.find((p) => /^Room\s*:/i.test(p));
    const location = [
      `Building: ${building || (course.isOnline ? "Online" : "Not listed")}`,
      floor,
      room,
    ]
      .filter(Boolean)
      .join(" · ");
    const fields = [
      location,
      `Meeting Days: ${meeting.days.map((day) => fullDays[DAYS.indexOf(day)]).join(", ")}${meeting.interval === 2 ? " (alternate weeks)" : ""}`,
      `Meeting Time: ${proseTime(meeting.startMinutes)} - ${proseTime(meeting.endMinutes)}`,
    ];
    const signature = JSON.stringify(fields);
    if (!seen.has(signature)) {
      seen.add(signature);
      lines.push(...fields);
    }
  }
  if (!meetings.length) lines.push("Meeting details: Not listed");
  return lines;
}

// Use the same 30-minute rows, section labels, lane layout and theme as the UI.
export function timetablePages(courses, options = {}) {
  const {
    name = "Working Schedule",
    orientation = "landscape",
    palette = backgrounds,
    subPalette = subBackgrounds,
    borderPalette = borders,
    timeFormat = "am/pm",
    week = 1,
  } = options;
  const theme = {
    main: "#3b45a4",
    background: "#f6f7fe",
    headerText: "#e1e5fb",
    pill: "#8f98e0",
    ...options.theme,
  };
  const width = orientation === "portrait" ? 794 : 1123,
    height = orientation === "portrait" ? 1123 : 794;
  const layout = scheduleLayout(courses, week);
  const concurrent = Math.max(
    1,
    ...[...layout.eventsByDay.values()].flatMap((events) =>
      [...eventLanes(events).values()].map((l) => l.count),
    ),
  );
  const gridWidth = Math.max(660, 64 + layout.days.length * 100 * concurrent),
    dayWidth = (gridWidth - 64) / layout.days.length;
  const header = 34,
    rowHeight = 25,
    gridHeight = header + layout.slots.length * rowHeight + 2;
  let grid = `<rect x="0" y="0" width="${gridWidth}" height="${gridHeight}" fill="${esc(theme.background)}" stroke="${esc(theme.main)}" stroke-width="3"/><rect x="0" y="0" width="${gridWidth}" height="${header}" fill="${esc(theme.main)}"/>`;
  grid +=
    `<rect x="7" y="7" width="50" height="21" rx="11" fill="${esc(theme.pill)}"/>` +
    svgText(
      32,
      21,
      timeFormat === "24h" ? "24H" : "AM/PM",
      10,
      700,
      `fill="${esc(theme.main)}" text-anchor="middle"`,
    );
  layout.days.forEach((day, i) => {
    const x = 64 + i * dayWidth;
    grid += svgText(
      x + dayWidth / 2,
      23,
      day,
      13,
      600,
      `fill="${esc(theme.headerText)}" text-anchor="middle"`,
    );
    grid += `<path d="M ${x} 0 V ${gridHeight}" stroke="${esc(theme.main)}" stroke-width="0.8"/>`;
  });
  layout.slots.forEach((minutes, i) => {
    const y = header + i * rowHeight;
    grid += `<path d="M 0 ${y} H ${gridWidth}" stroke="${esc(theme.main)}" stroke-width="0.7"/>`;
    grid += svgText(
      32,
      y + 17,
      timeLabel(minutes, timeFormat),
      10,
      600,
      `fill="${esc(theme.main)}" text-anchor="middle"`,
    );
  });
  for (const [day, events] of layout.eventsByDay) {
    const lanes = eventLanes(events);
    for (const event of events) {
      const { lane, count } = lanes.get(event.id),
        x =
          64 +
          layout.days.indexOf(day) * dayWidth +
          (lane * dayWidth) / count +
          1,
        y = header + event.rowStart * rowHeight;
      const bw = dayWidth / count - 2,
        bh = event.rowSpan * rowHeight - 1,
        sub = Boolean(event.label),
        color = event.colorIndex - 1;
      grid += `<rect class="schedule-entry" x="${x}" y="${y}" width="${bw}" height="${bh}" fill="${esc((sub ? subPalette : palette)[color] || backgrounds[0])}" stroke="${esc(borderPalette[color] || borders[0])}" stroke-width="1"/>`;
      const label = [event.code, event.course.section_number]
        .filter(Boolean)
        .join(" ");
      const blockLines = [
        ...wrapText(label, bw - 6, 9),
        ...(event.label ? [event.label] : []),
        `${timeLabel(event.startMinutes, timeFormat)} - ${timeLabel(event.endMinutes, timeFormat)}`,
      ];
      const fontSize = Math.min(
        9,
        Math.max(4, (bh - 4) / blockLines.length - 1),
      );
      blockLines.forEach((line, i) => {
        grid += svgText(
          x + bw / 2,
          y + fontSize + 2 + i * (fontSize + 1),
          line,
          fontSize,
          i < blockLines.length - 1 ? 600 : 400,
          'text-anchor="middle"',
        );
      });
    }
  }
  const scheduleSvg = svg(gridWidth, gridHeight, grid, theme.background);
  const scale = Math.min((width - 48) / gridWidth, (height - 85) / gridHeight);
  const schedulePage = svg(
    width,
    height,
    svgText(24, 30, name, Math.min(18, (width - 48) / Math.max(1, textWidth(name, 1))), 700, `fill="${esc(theme.main)}"`) +
      `<g transform="translate(${(width - gridWidth * scale) / 2} 55) scale(${scale})">${grid}</g>`,
  );
  const columns = courses.length > 1 ? 2 : 1,
    gap = 18,
    margin = 24,
    columnWidth = (width - 2 * margin - gap * (columns - 1)) / columns;
  const positions = Array(columns).fill(84),
    cards = [];
  courses.forEach((course, index) => {
    const col = index % columns,
      x = margin + col * (columnWidth + gap),
      lines = courseDetailLines(course).flatMap((line, i) =>
        wrapText(line, columnWidth - 32, i < 2 ? 12 : 11).map((text) => ({
          text,
          size: i < 2 ? 12 : 11,
          weight: i === 0 ? 700 : i === 1 ? 600 : 400,
          color: i < 2 ? theme.main : "#303757",
        })),
      ),
      cardHeight = lines.length * 17 + 26,
      y = positions[col];
    cards.push({ x, y, lines, height: cardHeight, color: borderPalette[((course.colorIndex || index + 1) - 1) % borderPalette.length] });
    positions[col] += cardHeight + 12;
  });
  // Keep exactly two PDF pages. Unusually large plans use a taller details page
  // instead of discarding classes or reducing their details to unreadable text.
  const detailHeight = Math.max(height, Math.ceil(Math.max(...positions) + 24));
  let details = svgText(
    margin,
    30,
    "Course details",
    18,
    700,
    `fill="${esc(theme.main)}"`,
  );
  const subtitle = `${name} · ${courses.length} ${courses.length === 1 ? "class" : "classes"}`;
  details += svgText(margin, 53, subtitle, Math.min(11, (width - 48) / Math.max(1, textWidth(subtitle, 1))), 400, `fill="${esc(theme.main)}"`);
  cards.forEach((card) => {
    details += `<rect x="${card.x}" y="${card.y}" width="${columnWidth}" height="${card.height}" rx="10" fill="${esc(theme.background)}" stroke="#e1e5fb" stroke-width="1"/><rect x="${card.x}" y="${card.y + 12}" width="4" height="${card.height - 24}" rx="2" fill="${esc(card.color)}"/>`;
    card.lines.forEach((line, i) => {
      details += svgText(
        card.x + 16,
        card.y + 23 + i * 17,
        line.text,
        line.size,
        line.weight,
        `fill="${esc(line.color)}"`,
      );
    });
  });
  return {
    pages: [schedulePage, svg(width, detailHeight, details)],
    width,
    height,
    pageSizes: [
      { width, height },
      { width, height: detailHeight },
    ],
    scheduleSvg,
    scheduleWidth: gridWidth,
    scheduleHeight: gridHeight,
  };
}
async function svgCanvas(source, width, height) {
  const url = URL.createObjectURL(
    new Blob([source], { type: "image/svg+xml" }),
  );
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = width * 2;
    canvas.height = height * 2;
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error("Image export is unavailable in this browser.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}
const blobFromCanvas = (canvas, type = "image/png") =>
  new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Image export failed.")),
      type,
      0.95,
    ),
  );
// Minimal offline PDF writer: one high-resolution JPEG per A4 page.
export function jpegPdf(images, width, height, pageSizes = []) {
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
    const imageWidth = pageSizes[i]?.width || width;
    const imageHeight = pageSizes[i]?.height || height;
    const pageHeight = (ph * imageHeight) / height;
    const id = 3 + i * 3,
      stream = `q ${pw} 0 0 ${pageHeight} 0 0 cm /Im0 Do Q`;
    obj(
      id,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${pageHeight}] /Resources << /XObject << /Im0 ${id + 2} 0 R >> >> /Contents ${id + 1} 0 R >>`,
    );
    obj(id + 1, `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    offsets[id + 2] = length;
    push(
      `${id + 2} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imageWidth * 2} /Height ${imageHeight * 2} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.length} >>\nstream\n`,
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
  const result = timetablePages(courses, options);
  let blob;
  if (format === "png") {
    if (Math.max(result.scheduleWidth, result.scheduleHeight) * 2 > 30000)
      throw new Error(
        "This timetable is too large for a PNG. Try PDF instead.",
      );
    blob = await blobFromCanvas(
      await svgCanvas(
        result.scheduleSvg,
        result.scheduleWidth,
        result.scheduleHeight,
      ),
    );
  } else {
    const images = [];
    for (let i = 0; i < result.pages.length; i++) {
      const size = result.pageSizes[i],
        canvas = await svgCanvas(result.pages[i], size.width, size.height);
      images.push(
        new Uint8Array(
          await (await blobFromCanvas(canvas, "image/jpeg")).arrayBuffer(),
        ),
      );
    }
    blob = jpegPdf(images, result.width, result.height, result.pageSizes);
  }
  downloadBlob(blob, `${timetableFilename(courses, options.name)}.${format}`);
  return blob;
}
