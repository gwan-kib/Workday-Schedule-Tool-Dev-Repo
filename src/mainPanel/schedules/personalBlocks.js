import { DAYS } from "../../core/meetings.js";
import { validatePersonalBlocks, personalBlockCourses } from "../../core/personalBlocks.js";
import { plannerDialog } from "./plannerController.js";
import { node } from "./plannerOverview.js";

const clock = n => `${String(Math.floor(n/60)).padStart(2,"0")}:${String(n%60).padStart(2,"0")}`;
const action = (text,fn) => {const b=node("button",text);b.type="button";b.addEventListener("click",fn);return b;};
export function openPersonalBlocks(ui,{getSchedules,saveSchedules,scheduleId}) {
  if(!getSchedules().length) throw new Error("Save a schedule first, then add personal blocks to that plan.");
  const d=plannerDialog(ui,"Personal blocks");
  let selected=scheduleId || getSchedules()[0].id;
  const current=()=>getSchedules().find(s=>s.id===selected);
  async function persist(next) {
    const latest=getSchedules();
    if(!latest.some(s=>s.id===selected)) throw new Error("This saved schedule was deleted. Close and reopen Personal blocks.");
    validatePersonalBlocks(next);personalBlockCourses(next);
    await saveSchedules(latest.map(s=>s.id===selected?{...s,personalBlocks:next}:s));
  }
  function show() {
    d.content.replaceChildren(); d.actions.replaceChildren();
    const label=node("label",null,"planner-field"), picker=node("select");picker.setAttribute("aria-label","Saved plan for personal blocks");
    for(const s of getSchedules()) {const o=node("option",s.name);o.value=s.id;picker.append(o);} picker.value=selected;
    picker.addEventListener("change",()=>{selected=picker.value;d.setStatus("");show();});
    label.append(node("span","Saved plan","planner-field-label"),picker); d.content.append(label);
    d.content.append(node("p","Personal blocks are saved directly to this plan. They appear in its timetable and conflicts, but are excluded from calendar exports unless you explicitly include them.","planner-hint"));
    const s=current();if(!s){d.setStatus("This schedule is no longer available.","error");return;}
    const list=node("div",null,"personal-block-list");
    for(const b of s.personalBlocks||[]) {
      const card=node("section",null,"personal-block-card");card.style.setProperty("--personal-color",b.color);
      card.append(node("strong",b.title),node("p",`${b.recurrence === "once"?"One date":b.recurrence === "alternate"?"Every other week":"Weekly"} · ${b.days.join(", ")} · ${clock(b.startMinutes)}–${clock(b.endMinutes)} · ${b.startDate} to ${b.endDate}${b.category?` · ${b.category}`:""}${b.exceptions.length?` · ${b.exceptions.length} skipped date(s)`:""}`));
      card.append(action("Edit",()=>edit(b)));
      let confirming=false;
      const remove=action("Delete",d.run(async()=>{
        if(!confirming) {confirming=true;remove.textContent="Confirm delete";return;}
        const latest=current();if(!latest) throw new Error("This schedule was deleted.");
        const now=latest.personalBlocks?.find(x=>x.id===b.id);
        if(JSON.stringify(now)!==JSON.stringify(b)) throw new Error("This block changed in another window. Reopen it before deleting.");
        await persist(latest.personalBlocks.filter(x=>x.id!==b.id));show();d.setStatus("Personal block deleted.","success");
      }));
      card.append(remove);list.append(card);
    }
    if(!s.personalBlocks?.length) list.append(node("p","No personal blocks in this plan yet.","planner-hint"));
    d.content.append(list);d.actions.append(action("Add personal block",()=>edit()));
  }
  function edit(original) {
    d.content.replaceChildren();d.actions.replaceChildren();d.setStatus("");
    const s=current();if(!s){d.setStatus("This schedule was deleted.","error");return;}
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
      const latest=current();if(!latest) throw new Error("This schedule was deleted.");
      const blocks=latest.personalBlocks||[];
      if(original && JSON.stringify(blocks.find(b=>b.id===original.id))!==JSON.stringify(original)) throw new Error("This block changed in another window. Cancel and reopen it to keep the newer changes.");
      await persist(original?blocks.map(b=>b.id===original.id?validated:b):[...blocks,validated]);
      show();d.setStatus("Personal block saved.","success");
    });
    form.addEventListener("submit",e=>{e.preventDefault();});
    d.content.append(node("h3",original?"Edit personal block":"Add personal block"),form);
    d.actions.append(action("Cancel",show),action("Save block",save));fields.title.focus();
  }
  show();return d;
}
