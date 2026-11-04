import { enableDiagnostics, diagnosticSummary } from "../../utilities/debugTool.js";
export function mountPrivacySettings(ui) {
  const root=ui.root||document;
  const mount=root.querySelector('.settings-section--display');
  if(!mount) return;
  const section=document.createElement("section"); section.className="settings-section privacy-summary";
  const heading=document.createElement("h3"); heading.textContent="Privacy & diagnostics";
  const text=document.createElement("p"); text.textContent="Saved schedules, notes and the reusable personal-block library stay on this device. Working schedule edits need Quick Save or Save As New; reusable block copies are kept automatically. Course cards automatically request course/session data from UBCGrades and instructor names plus UBC campus from Rate My Professors. Lookups use a one-hour memory cache; an expired result may be labeled cached after a refresh failure. There is no lookup opt-out. Icons load from Google Fonts. No analytics or tracking code is included.";
  const calendar=document.createElement("p"); calendar.textContent="Chrome sends schedule event titles, times, locations and descriptions to your primary Google Calendar only after sign-in, preview and confirmation. Personal blocks are excluded unless you choose to include them. Signing out clears local sign-in state and cached access, but does not revoke Google's authorization or remove calendar events. Revoke access in your Google Account's third-party connections. Firefox supports ICS export only.";
  const exports=document.createElement("p"); exports.textContent="JSON schedule files include course details, notes and personal blocks. Share them only with people you intend. Tokens and account data are excluded; portable exports omit Workday section IDs and links. Saved plans remain until you delete them or remove the extension. Removing a block from a schedule keeps its reusable copy; Remove saved copy only removes it from the library. Clear this device's extension data to remove the library, preferences and cached sync previews too.";
  const purpose=document.createElement("p");purpose.className="privacy-purpose";purpose.textContent="Privacy explains where your information goes. Diagnostics are optional troubleshooting tools: leave them off unless you are investigating a problem or preparing a bug report.";
  const help=document.createElement("p");help.textContent="To capture a problem: enable diagnostics, repeat the action that went wrong, then download the report. The file contains the extension version and up to 100 limited event labels and severity levels. It excludes names, course schedules, personal-block text, URLs, tokens and full error messages. Nothing is uploaded automatically; you choose whether to share the file.";
  const controls=document.createElement("div");controls.className="diagnostic-controls";
  const label=document.createElement("label");label.className="diagnostic-toggle";
  const toggle=document.createElement("input");toggle.type="checkbox";toggle.setAttribute("aria-label","Enable redacted diagnostics for this session");
  label.append(toggle,document.createTextNode("Enable redacted diagnostics for this session"));
  const state=document.createElement("p");state.className="diagnostics-state";state.setAttribute("role","status");state.setAttribute("aria-live","polite");state.textContent="Diagnostics are off. Normal use does not need them. Reloading turns them off; disabling clears the captured events.";
  const download=document.createElement("button");download.type="button";download.className="button";download.textContent="Download redacted diagnostics";download.disabled=true;
  toggle.addEventListener("change",()=>{
    enableDiagnostics(toggle.checked);download.disabled=!toggle.checked;
    state.textContent=toggle.checked?"Diagnostics are on for this page session. Reproduce the issue, then download the report. Nothing is uploaded.":"Diagnostics are off and captured events have been cleared. Normal use does not need them.";
  });
  download.addEventListener("click",()=>{
    const blob=new Blob([JSON.stringify(diagnosticSummary(),null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob); const a=document.createElement("a");a.href=url;a.download="WST-redacted-diagnostics.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  controls.append(label,download,state);
  section.append(heading,purpose,text,calendar,exports,help,controls);mount.after(section);
}
