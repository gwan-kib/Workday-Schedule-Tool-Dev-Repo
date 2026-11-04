import { enableDiagnostics, diagnosticSummary } from "../../utilities/debugTool.js";
export function mountPrivacySettings(ui) {
  const root=ui.root||document;
  const mount=root.querySelector('.settings-section--display');
  if(!mount) return;
  const section=document.createElement("section"); section.className="settings-section privacy-summary";
  const heading=document.createElement("h3"); heading.textContent="Privacy & diagnostics";
  const text=document.createElement("p"); text.textContent="Schedules, notes and personal blocks are saved on this device. Course cards automatically request course/session data from UBCGrades and instructor names plus UBC campus from Rate My Professors. Lookups use a one-hour memory cache; an expired result may be labeled cached after a refresh failure. There is no lookup opt-out. Icons load from Google Fonts. No analytics or tracking code is included.";
  const calendar=document.createElement("p"); calendar.textContent="Chrome sends schedule event titles, times, locations and descriptions to your primary Google Calendar only after sign-in, preview and confirmation. Personal blocks are excluded unless you choose to include them. Signing out clears local sign-in state and cached access, but does not revoke Google's authorization or remove calendar events. Revoke access in your Google Account's third-party connections. Firefox supports ICS export only.";
  const exports=document.createElement("p"); exports.textContent="JSON schedule files include course details, notes and personal blocks. Share them only with people you intend. Tokens and account data are excluded; portable exports omit Workday section IDs and links. Saved plans remain until you delete them or remove the extension. Clear this device's extension data to remove preferences and cached sync previews too.";
  const label=document.createElement("label"); label.className="settings-tooltip-toggle";
  const toggle=document.createElement("input");toggle.type="checkbox";toggle.setAttribute("aria-label","Enable redacted diagnostics for this session");
  label.append(toggle,document.createTextNode("Enable redacted diagnostics for this session"));
  toggle.addEventListener("change",()=>enableDiagnostics(toggle.checked));
  const download=document.createElement("button");download.type="button";download.className="button";download.textContent="Download redacted diagnostics";
  download.addEventListener("click",()=>{
    const blob=new Blob([JSON.stringify(diagnosticSummary(),null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob); const a=document.createElement("a");a.href=url;a.download="WST-redacted-diagnostics.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  section.append(heading,text,calendar,exports,label,download);mount.after(section);
}
