// UBC's production tenant only. No arbitrary Workday tenant, credentials or ports.
export function trustedSectionLink(value) {
  try {
    const u = new URL(String(value));
    if (
      u.protocol !== "https:" ||
      u.hostname !== "wd10.myworkday.com" ||
      u.port ||
      u.username ||
      u.password ||
      !/^\/ubc\/(?:d\/)?inst\/1\$15194\/15194\$\d+\.htmld$/.test(u.pathname)
    )
      return "";
    u.search = "";
    u.hash = "";
    u.pathname = u.pathname.replace("/ubc/inst/", "/ubc/d/inst/");
    return u.href;
  } catch {
    return "";
  }
}

export function courseWorkdayLink(
  course,
  base = globalThis.location?.href || "",
) {
  if (course.workdayCourseLink)
    return trustedSectionLink(course.workdayCourseLink);
  if (!/^\d+$/.test(String(course.workdayCourseId || ""))) return "";
  try {
    const u = new URL(base);
    return trustedSectionLink(
      `${u.origin}/ubc/d/inst/1$15194/15194$${course.workdayCourseId}.htmld`,
    );
  } catch {
    return "";
  }
}
