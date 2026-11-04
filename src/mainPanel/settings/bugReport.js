import { enableDiagnostics, diagnosticSummary } from "../../utilities/debugTool.js";
export function mountBugReportSettings(ui) {
  const root=ui.root||document, mount=root.querySelector('.settings-section--display');
  if(!mount) return;
  const section=document.createElement("section");section.className="settings-section bug-report-help";
  const heading=document.createElement("h3");heading.textContent="Report a problem";
  const intro=document.createElement("p");intro.textContent="Something not working? These steps help you send the developer a useful report.";
  const steps=document.createElement("ol");
  for(const instruction of ["Turn on Record what happens below.","Try the action that went wrong again.","Click Download bug report. Attach the file when emailing the address in Help, and explain what you expected and what happened. A screenshot can help too."]) {
    const item=document.createElement("li");item.textContent=instruction;steps.append(item);
  }
  const note=document.createElement("p");note.textContent="The report leaves out names and personal schedule details. It saves to your computer and is not sent automatically. Refreshing this page stops the recording.";
  const controls=document.createElement("div");controls.className="diagnostic-controls";
  const label=document.createElement("label");label.className="diagnostic-toggle";
  const toggle=document.createElement("input");toggle.type="checkbox";toggle.setAttribute("aria-label","Record what happens");
  label.append(toggle,document.createTextNode("Record what happens"));
  const state=document.createElement("p");state.className="diagnostics-state";state.setAttribute("role","status");state.setAttribute("aria-live","polite");state.textContent="Recording is off. Turn it on before trying the problem again.";
  const download=document.createElement("button");download.type="button";download.className="button";download.textContent="Download bug report";download.disabled=true;
  toggle.addEventListener("change",()=>{
    enableDiagnostics(toggle.checked);download.disabled=!toggle.checked;
    state.textContent=toggle.checked?"Recording is on. Try the problem again, then download the report.":"Recording is off. The recorded steps have been cleared.";
  });
  download.addEventListener("click",()=>{
    const url=URL.createObjectURL(new Blob([JSON.stringify(diagnosticSummary(),null,2)],{type:"application/json"}));
    const link=document.createElement("a");link.href=url;link.download="WST-bug-report.json";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  controls.append(label,download,state);section.append(heading,intro,steps,controls,note);mount.after(section);
}
