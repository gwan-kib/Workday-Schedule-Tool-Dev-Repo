import { blockSignature, loadReusableBlocks, rememberReusableBlock, forgetReusableBlock, replaceReusableBlock, hasReusableBlock } from "../../core/personalBlockLibrary.js";
import { DAYS } from "../../core/meetings.js";
import { validatePersonalBlocks, personalBlockCourses } from "../../core/personalBlocks.js";
import { plannerDialog } from "./plannerController.js";
import { node } from "./plannerOverview.js";

const clock = n => `${String(Math.floor(n/60)).padStart(2,"0")}:${String(n%60).padStart(2,"0")}`;
const action = (text,fn) => {const b=node("button",text);b.type="button";b.addEventListener("click",fn);return b;};

export function openPersonalBlocks(ui, {
  getCurrent, setBlocks, getKnownBlocks = () => [], editBlockId = null,
  saveHint = "Use Quick Save or Save As New in the main panel to keep the edited schedule.",
  loadLibrary = () => loadReusableBlocks(getKnownBlocks()),
  remember = block => rememberReusableBlock(block, getKnownBlocks()),
  forget = forgetReusableBlock,
  replaceSaved = replaceReusableBlock,
}) {
  const initial = getCurrent();
  if (!initial) throw new Error("Open a schedule before editing personal blocks.");
  const contextId = initial.id;
  const d = plannerDialog(ui, "Personal blocks");
  let library = [], editing = false, libraryLoaded = false;
  const current = () => { const s=getCurrent(); return s?.id === contextId ? s : null; };
  async function persist(next, expected) {
    if (!current()) throw new Error("The schedule being edited changed. Close and reopen Personal blocks.");
    const valid=validatePersonalBlocks(next);
    await setBlocks(valid, { contextId, expected });
  }
  const describe = b => `${b.recurrence === "once" ? "One date" : b.recurrence === "alternate" ? "Every other week" : "Weekly"} · ${b.days.join(", ")} · ${clock(b.startMinutes)}–${clock(b.endMinutes)} · ${b.startDate} to ${b.endDate}${b.category ? ` · ${b.category}` : ""}${b.exceptions.length ? ` · ${b.exceptions.length} skipped date(s)` : ""}`;
  function card(b) {
    const el=node("section",null,"personal-block-card");el.style.setProperty("--personal-color",b.color);
    el.append(node("strong",b.title),node("p",describe(b)));return el;
  }
  function show() {
    editing=false; d.content.replaceChildren(); d.actions.replaceChildren();
    const s=current();
    if(!s) {d.setStatus("The schedule being edited changed. Close and reopen Personal blocks.","error");return;}
    d.content.append(node("p",`Editing ${s.name || "Working Schedule"}. Block changes follow this schedule. ${saveHint}`,"planner-hint"));
    const active=node("div",null,"personal-block-list current-personal-blocks");active.append(node("h3","In this schedule"));
    for(const b of s.personalBlocks||[]) {
      const el=card(b);el.append(action("Edit",()=>edit(b)));
      el.append(action("Remove from schedule",d.run(async()=>{
        const latest=current();if(!latest) throw new Error("The schedule being edited changed.");
        const blocks=latest.personalBlocks||[];
        if(JSON.stringify(blocks.find(x=>x.id===b.id))!==JSON.stringify(b)) throw new Error("This block changed. Reopen it before removing.");
        await persist(blocks.filter(x=>x.id!==b.id),JSON.stringify(blocks));show();d.setStatus("Removed from this schedule. Any saved reusable copy is unchanged.","success");
      })));
      if(libraryLoaded && !hasReusableBlock(b,library)) el.append(action("Save for reuse",d.run(async()=>{
        const latest=current();
        if(!latest || JSON.stringify(latest.personalBlocks?.find(x=>x.id===b.id))!==JSON.stringify(b)) throw new Error("This block changed. Reopen it before saving for reuse.");
        library=await remember(b);show();d.setStatus("This version is saved for reuse.","success");
      })));
      active.append(el);
    }
    if(!s.personalBlocks?.length) active.append(node("p","No personal blocks in this schedule yet.","planner-hint"));
    d.content.prepend(action("Create new block",()=>edit()));
    d.content.append(active);
    const saved=node("div",null,"personal-block-list saved-personal-blocks");saved.append(node("h3","Saved personal blocks"));
    saved.append(node("p","Add a saved block to this schedule without creating it again. Each schedule gets its own editable copy.","planner-hint"));
    for(const b of library) {
      const el=card(b), already=(s.personalBlocks||[]).some(x=>blockSignature(x)===blockSignature(b));
      const add=action(already?"Already added":"Add to schedule",d.run(async()=>{
        const latest=current();if(!latest) throw new Error("The schedule being edited changed.");
        const blocks=latest.personalBlocks||[];
        if(blocks.some(x=>blockSignature(x)===blockSignature(b))) {show();return;}
        await persist([...blocks,{...structuredClone(b),id:crypto.randomUUID()}],JSON.stringify(blocks));
        show();d.setStatus("Saved block added to this schedule.","success");
      }));add.disabled=already;el.append(add,action("Edit",()=>edit(b,true)));
      let confirming=false;
      const remove=action("Remove saved copy",d.run(async()=>{
        if(!confirming) {confirming=true;remove.textContent="Confirm remove saved copy";return;}
        library=await forget(b.id);show();d.setStatus("Saved copy removed. Blocks already in schedules are unchanged.","success");
      }));el.append(remove);saved.append(el);
    }
    if(!library.length) saved.append(node("p","Use Save for reuse on a schedule block to keep its exact details here.","planner-hint"));
    d.content.append(saved);
  }
  function edit(original, libraryOnly = false) {
    editing=true;d.content.replaceChildren();d.actions.replaceChildren();d.setStatus("");
    const s=current();if(!s){d.setStatus("The schedule being edited changed.","error");return;}
    const form=node("form",null,"personal-block-form");
    const fields={};
    const input=(name,title,type,value)=>{
      const wrap=node("label"),el=node("input");el.type=type;el.value=value??"";el.setAttribute("aria-label",title);el.name=name;
      if(type!=="color") el.required=true;wrap.append(node("span",title),el);form.append(wrap);fields[name]=el;return el;
    };
    const dates=s.courses.flatMap(c=>c.meetingLines||[]).join(" ").match(/\d{4}-\d{2}-\d{2}/g)||[];
    const today=new Date().toLocaleDateString("en-CA",{timeZone:"America/Vancouver"});
    input("title","Block title","text",original?.title||"").maxLength=100;
    input("category","Category (optional)","text",original?.category||"").required=false;
    input("startDate","Start date","date",original?.startDate||dates.sort()[0]||today);
    input("endDate","End date","date",original?.endDate||dates.sort().at(-1)||today);
    input("startTime","Start time","time",clock(original?.startMinutes??540));
    input("endTime","End time","time",clock(original?.endMinutes??600));
    const recurrenceLabel=node("label"),recurrence=node("select");recurrence.setAttribute("aria-label","Repeats");
    for(const [id,title] of [["weekly","Every week"],["alternate","Every other week"],["once","One date"]]){const o=node("option",title);o.value=id;recurrence.append(o);}recurrence.value=original?.recurrence||"weekly";
    recurrenceLabel.append(node("span","Repeats"),recurrence);form.append(recurrenceLabel);
    input("color","Block color","color",original?.color||"#64748b");
    const days=node("fieldset",null,"personal-block-days block-wide");days.append(node("legend","Days"));
    const checks=DAYS.map(day=>{const label=node("label"),c=node("input");c.type="checkbox";c.value=day;c.checked=(original?.days||["Mon"]).includes(day);label.append(c,document.createTextNode(day));days.append(label);return c;});form.append(days);
    const exceptions=input("exceptions","Skip dates (YYYY-MM-DD, comma separated)","text",original?.exceptions.join(", ")||"");exceptions.required=false;exceptions.parentNode.classList.add("block-wide");exceptions.maxLength=1200;
    const explain=node("p","Times use America/Vancouver. For every-other-week blocks, the first selected weekday on or after the start date anchors the first week. Skip dates can remove holidays or individual occurrences.","planner-hint block-wide");form.append(explain);
    function once() { const single=recurrence.value==="once";fields.endDate.disabled=single;days.disabled=single;if(single) fields.endDate.value=fields.startDate.value; }
    recurrence.addEventListener("change",once);fields.startDate.addEventListener("change",once);once();
    const save=d.run(async()=>{
      if(!form.reportValidity()) return;
      const minutes=v=>{const [h,m]=v.split(":").map(Number);return h*60+m;};
      const block={id:original?.id||crypto.randomUUID(),title:fields.title.value,category:fields.category.value,color:fields.color.value,startDate:fields.startDate.value,endDate:recurrence.value==="once"?fields.startDate.value:fields.endDate.value,startMinutes:minutes(fields.startTime.value),endMinutes:minutes(fields.endTime.value),recurrence:recurrence.value,days:checks.filter(c=>c.checked).map(c=>c.value),exceptions:exceptions.value.split(",").map(s=>s.trim()).filter(Boolean)};
      // One-date day comes from the date, not the disabled weekday checkboxes.
      if(block.recurrence==="once" && !block.days.length) block.days=["Mon"];
      const [validated]=validatePersonalBlocks([block]);personalBlockCourses([validated]);
      if(libraryOnly) {
        library=await replaceSaved(original,validated);
        show();d.setStatus("Saved personal block updated. Existing schedules are unchanged.","success");
        return;
      }
      const latest=current();if(!latest) throw new Error("The schedule being edited changed.");
      const blocks=latest.personalBlocks||[];
      if(original && JSON.stringify(blocks.find(b=>b.id===original.id))!==JSON.stringify(original)) throw new Error("This block changed in another window. Cancel and reopen it to keep the newer changes.");
      if(!current()) throw new Error("The schedule being edited changed.");
      await persist(original?blocks.map(b=>b.id===original.id?validated:b):[...blocks,validated],JSON.stringify(blocks));
      show();d.setStatus(original ? "Personal block updated in this schedule." : "Personal block added to this schedule.","success");
    });
    form.addEventListener("submit",e=>{e.preventDefault();});
    d.content.append(node("h3",libraryOnly?"Edit saved personal block":original?"Edit personal block":"Add personal block"));
    if(libraryOnly) d.content.append(node("p","This edits the reusable saved copy only. Blocks already added to schedules keep their current details. Use Add to schedule to add the edited version.","planner-hint"));
    d.content.append(form);
    d.actions.append(action("Cancel",show),action(libraryOnly?"Save reusable block":"Save block",save));fields.title.focus();
  }
  show();
  if(editBlockId) { const block=current()?.personalBlocks?.find(b=>b.id===editBlockId);if(block) edit(block); }
  d.libraryReady=loadLibrary().then(items=>{library=items;libraryLoaded=true;if(!editing && d.dialog.isConnected) show();}).catch(error=>d.setStatus(error.message,"error"));
  return d;
}
