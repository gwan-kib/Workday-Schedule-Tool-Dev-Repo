import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { personalBlockCourses, validatePersonalBlocks, scheduleItems, calendarExportItems } from "../src/core/personalBlocks.js";
import { normalizeSchedule } from "../src/core/meetings.js";
import { conflictDetails } from "../src/core/planner.js";
import { createBackup, parseBackup, planScheduleImport } from "../src/core/scheduleBackup.js";
import { buildICSFile } from "../src/exportLogic/exportIcs.js";
import { blockSignature, normalizeBlockLibrary, loadReusableBlocks, rememberReusableBlock, forgetReusableBlock, replaceReusableBlock, hasReusableBlock } from "../src/core/personalBlockLibrary.js";
import { getScheduleSaveState } from "../src/core/scheduleSaveState.js";
import { createScheduleUndoHistory, captureScheduleChange } from "../src/core/scheduleUndo.js";
import { renderPersonalBlockCards } from "../src/mainPanel/courses/personalBlockCards.js";
import { debugFor, enableDiagnostics, diagnosticSummary, debugLog } from "../src/utilities/debugTool.js";

const block=(extra={})=>({id:"block-a",title:"Work shift",category:"Work",color:"#64748b",startDate:"2026-09-07",endDate:"2026-09-28",startMinutes:570,endMinutes:630,days:["Mon"],recurrence:"weekly",exceptions:[],...extra});
const course={code:"COSC_O 310",section_number:"001",title:"Software engineering",workdayCourseId:"123456",workdayCourseLink:"https://wd10.myworkday.com/ubc/d/inst/1$15194/15194$123456.htmld",meetingLines:["2026-09-07 - 2026-09-28 | Mon | 9:00 a.m. - 10:00 a.m."]};
const plan=(blocks=[])=>({id:"plan-a",name:"Plan A",courses:[course],personalBlocks:blocks,notes:"Reminder",isFavorite:true});

test("personal one-off, weekly and alternating dates honor exceptions and detect course clashes",()=>{
  const weekly=normalizeSchedule(personalBlockCourses([block({exceptions:["2026-09-14"]})])).meetings[0];
  assert.deepEqual(weekly.dates,["2026-09-07","2026-09-21","2026-09-28"]);
  const alternate=normalizeSchedule(personalBlockCourses([block({recurrence:"alternate"})])).meetings[0];
  assert.deepEqual(alternate.dates,["2026-09-07","2026-09-21"]);
  const once=normalizeSchedule(personalBlockCourses([block({recurrence:"once",startDate:"2026-09-15",endDate:"2026-09-15"})])).meetings[0];
  assert.deepEqual(once.days,["Tue"]);assert.deepEqual(once.dates,["2026-09-15"]);
  const conflicts=conflictDetails(scheduleItems([course],[block()]));
  assert.equal(conflicts.conflicts.length,1);assert.equal(conflicts.conflicts[0].start,570);assert.equal(conflicts.conflicts[0].end,600);
  assert.equal(course.isPersonalBlock,undefined);
});
test("invalid, empty-occurrence, duplicate, excessive and daylight-saving blocks are rejected",()=>{
  for(const extra of [{title:""},{startMinutes:650,endMinutes:600},{endDate:"2026-08-01"},{days:[]},{days:["Monday"]},{exceptions:["2027-01-01"]},{color:"url(secret)"},{startMinutes:1.5},{recurrence:"daily"}]) assert.throws(()=>validatePersonalBlocks([block(extra)]));
  assert.throws(()=>validatePersonalBlocks([block(),block()]));
  assert.throws(()=>validatePersonalBlocks(Array.from({length:51},(_,i)=>block({id:String(i)}))));
  assert.throws(()=>personalBlockCourses([block({startDate:"2026-09-08",endDate:"2026-09-08"})]),/no valid occurrences/);
  assert.throws(()=>personalBlockCourses([block({recurrence:"once",startDate:"2026-03-08",endDate:"2026-03-08",startMinutes:150,endMinutes:210})]),/daylight-saving/);
});
test("portable files retain blocks and notes, isolate plans and strip Workday/account secrets",()=>{
  const backup=createBackup([plan([block()]),{...plan(),id:"plan-b",name:"Plan B",isFavorite:false}],{wdAppearance:{theme:"dark",density:"compact"},token:"secret"});
  const text=JSON.stringify(backup);
  for(const privateValue of ["123456","myworkday.com","secret"]) assert.ok(!text.includes(privateValue));
  const restored=parseBackup(text);assert.equal(restored.schedules[0].personalBlocks[0].title,"Work shift");assert.deepEqual(restored.schedules[1].personalBlocks,[]);
  assert.equal(restored.settings.wdAppearance,undefined);
  const imported=planScheduleImport([plan()],restored.schedules[0],()=>"new");assert.equal(imported.imported.personalBlocks.length,1);assert.equal(imported.imported.notes,"Reminder");assert.equal(imported.imported.isFavorite,false);
  const legacy=parseBackup(JSON.stringify({format:"ubc-workday-schedules",version:1,schedules:[{...plan(),personalBlocks:undefined}],settings:{}}));assert.deepEqual(legacy.schedules[0].personalBlocks,[]);
});
test("personal commitments are excluded from ICS unless explicitly selected",()=>{
  const excluded=buildICSFile(calendarExportItems([course],[block()]));
  assert.ok(!excluded.includes("Work shift"));assert.equal((excluded.match(/BEGIN:VEVENT/g)||[]).length,1);
  const included=buildICSFile(calendarExportItems([course],[block()],true));
  assert.ok(included.includes("Work shift"));assert.ok(included.includes("Personal block"));assert.equal((included.match(/BEGIN:VEVENT/g)||[]).length,2);
});
test("diagnostics default off; opt-in cannot expose arbitrary messages, payloads or secrets",()=>{
  enableDiagnostics(false);const logger=debugFor("test");const original=console.log;const printed=[];console.log=(...v)=>printed.push(v);
  try {
    logger.error({id:"safe.failure",on:true},"Bearer SECRET",{token:"SECRET",name:"Private Name",url:"https://secret.test"});
    assert.equal(printed.length,0);assert.equal(diagnosticSummary().events.length,0);
    enableDiagnostics(true);debugLog({local:{test:true}});
    logger.error({id:"safe.failure"},new Error("SECRET"),{payload:{token:"SECRET"}});
    assert.equal(printed.length,1);const text=JSON.stringify([printed,diagnosticSummary()]);assert.ok(!text.includes("SECRET"));assert.ok(text.includes("safe.failure"));
    for(let i=0;i<150;i++) logger.log({id:"bounded"});assert.equal(diagnosticSummary().events.length,100);
    enableDiagnostics(false);assert.equal(diagnosticSummary().events.length,0);
  } finally { console.log=original;enableDiagnostics(false); }
});
test("Average links use newest available course-wide session, even for an older saved term",async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async url=>new Response(JSON.stringify(String(url).includes("yearsessions")?["2025W","2024W","2026S"]:String(url).includes("2026S")?[]:[{section:"OVERALL",average:78,reported:40}]),{status:200});
  try {
    const {fetchCourseStatistics}=await import("../src/api/averageGrades/courseStatistics.js?phase4");
    const result=await fetchCourseStatistics({campus:"UBCO",subject:"TEST",course:"310",yearsession:"2024W"});
    assert.equal(result.source,"https://ubcgrades.com/#UBCO-2025W-TEST-310-OVERALL");
    assert.equal(result.latest.year,2025);
  } finally {globalThis.fetch=original;}
});
test("browser packages inject only on the supported UBC tenant; Firefox has no Google identity grant",async()=>{
  for(const browser of ["chrome","firefox"]) {
    const manifest=JSON.parse(await readFile(new URL(`../manifest.${browser}.json`,import.meta.url)));
    assert.deepEqual(manifest.content_scripts[0].matches,["https://wd10.myworkday.com/ubc/*"]);
    assert.ok(!manifest.host_permissions.some(p=>p.includes("*.myworkday")));
    // WAR matches use origins only; a tenant path prevents Chrome from loading.
    for (const resource of manifest.web_accessible_resources)
      for (const pattern of resource.matches || []) assert.equal(new URL(pattern).pathname,"/*","Web-accessible resources require an origin-level match");
    if(browser==="firefox") {assert.ok(!manifest.permissions.includes("identity"));assert.ok(!manifest.host_permissions.some(p=>p.includes("googleapis")));}
  }
});

test("editor follows the unsaved draft, saves reusable copies explicitly and rejects stale edits",async()=>{
  const dom=new JSDOM('<button id="opener">Blocks</button>',{url:"https://fixture.test"});globalThis.window=dom.window;globalThis.document=dom.window.document;
  let current={id:"draft-a",name:"Working Schedule",courses:[course],personalBlocks:[]}, library=[];
  const {openPersonalBlocks}=await import("../src/mainPanel/schedules/personalBlocks.js");
  const d=openPersonalBlocks({root:document.body},{getCurrent:()=>current,setBlocks:async next=>{current={...current,personalBlocks:next};},loadLibrary:async()=>library,remember:async b=>{library=normalizeBlockLibrary([...library,b]);return library;},forget:async id=>{library=library.filter(b=>b.id!==id);return library;}});
  await d.libraryReady;assert.equal(d.dialog.querySelector('[aria-label="Saved plan for personal blocks"]'),null);
  const click=text=>[...d.dialog.querySelectorAll("button")].find(b=>b.textContent===text).click();const wait=()=>new Promise(r=>setTimeout(r,10));
  click("Create new block");document.querySelector('[name=title]').value="Lunch";document.querySelector('[name=startTime]').value="12:00";document.querySelector('[name=endTime]').value="13:00";
  click("Save block");await wait();assert.equal(current.personalBlocks.length,1);assert.equal(library.length,0);
  click("Save for reuse");await wait();assert.equal(library.length,1);assert.equal([...d.dialog.querySelectorAll("button")].some(b=>b.textContent==="Save for reuse"),false);
  click("Edit");document.querySelector('[name=title]').value="Edited";current={...current,personalBlocks:[{...current.personalBlocks[0],title:"Newer elsewhere"}]};
  click("Save block");await wait();assert.match(d.status.textContent,/changed/);assert.equal(current.personalBlocks[0].title,"Newer elsewhere");click("Cancel");
  click("Remove from schedule");await wait();assert.equal(current.personalBlocks.length,0);assert.equal(library.length,1);
  click("Add to schedule");await wait();assert.equal(current.personalBlocks[0].title,"Lunch");assert.notEqual(current.personalBlocks[0].id,library[0].id);
  const snapshot=structuredClone(current);current={...current,id:"draft-b",personalBlocks:[]};click("Create new block");assert.match(d.status.textContent,/changed/);assert.equal(current.personalBlocks.length,0);assert.equal(snapshot.personalBlocks.length,1);
  d.close();dom.window.close();
});
test("reusable library persists across plans, deduplicates content and can remove saved copies independently",async()=>{
  const stored={};globalThis.chrome={runtime:{},storage:{local:{get:(keys,cb)=>cb(stored),set:(values,cb)=>{Object.assign(stored,structuredClone(values));cb();}}}};
  try {
    let library=await loadReusableBlocks([block()]);assert.equal(library.length,1);
    library=await rememberReusableBlock(block({id:"other-id"}));assert.equal(library.length,1);
    const copy={...structuredClone(library[0]),id:"copy-in-plan-b"};copy.title="Edited in B";
    assert.equal((await loadReusableBlocks())[0].title,"Work shift");
    const first=blockSignature(block());assert.equal(first,blockSignature(block({id:"another"})));
    await forgetReusableBlock(library[0].id);assert.equal((await loadReusableBlocks([block()])).length,0);assert.equal(copy.title,"Edited in B");
  } finally {delete globalThis.chrome;}
});
test("block-only working schedules can be saved; block edits participate in save status and Undo/Redo",()=>{
  const state={courses:[],personalBlocks:[],savedSchedules:[],currentSavedScheduleId:null};const history=createScheduleUndoHistory();
  const before=captureScheduleChange(state);state.personalBlocks=[block()];history.record(before,captureScheduleChange(state),"Add personal block");assert.equal(getScheduleSaveState(state).status,"working");
  state.savedSchedules=[{...plan([block()]),courses:[]}];state.currentSavedScheduleId="plan-a";assert.equal(getScheduleSaveState(state).status,"saved");
  state.personalBlocks[0].title="Changed";assert.equal(getScheduleSaveState(state).status,"working");
  state.currentSavedScheduleId=null;state.savedSchedules=[];state.personalBlocks=[block()];
  let operation=history.plan(state);Object.assign(state,operation.working);history.commit(operation);assert.deepEqual(state.personalBlocks,[]);
  operation=history.plan(state,"redo");Object.assign(state,operation.working);history.commit(operation);assert.equal(state.personalBlocks[0].title,"Work shift");
});
test("personal block cards appear in course view with edit/remove controls, filtering and conflicts",()=>{
  const dom=new JSDOM('<div id="list"></div>');globalThis.document=dom.window.document;
  const ui={tableBody:document.querySelector('#list'),conflictPartnersByCode:new Map([["WORK SHIFT",["COSC_O 310"]]])};let edited,removed;
  renderPersonalBlockCards(ui,[block()],{onEdit:id=>edited=id,onRemove:id=>removed=id});assert.equal(ui.tableBody.querySelectorAll('.course-personal-block').length,1);assert.match(ui.tableBody.textContent,/Clashes with: COSC_O 310/);
  ui.tableBody.querySelectorAll('button')[0].click();ui.tableBody.querySelectorAll('button')[1].click();assert.equal(edited,"block-a");assert.equal(removed,"block-a");
  renderPersonalBlockCards(ui,[block()],{query:"unmatched"});assert.equal(ui.tableBody.querySelectorAll('.course-personal-block').length,0);dom.window.close();
});
test("appearance controls are removed and the timetable retains baseline spacing",async()=>{
  const popup=await readFile(new URL('../src/popup.html',import.meta.url),'utf8');assert.ok(!popup.includes('popup-appearance'));
  const css=await readFile(new URL('../src/css/formatting/personal-blocks.css',import.meta.url),'utf8');assert.ok(!css.includes('wst-theme'));assert.ok(!css.includes('wst-density'));assert.ok(!css.includes('.schedule-table tbody tr'));
});

test("source links find an older last offering without pretending it belongs to the five-year window",async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async url=>{
    if(String(url).includes("yearsessions"))return new Response(JSON.stringify(["2025W","2024W","2018W"]));
    if(String(url).includes("2018W"))return new Response(JSON.stringify([{section:"OVERALL",average:70,reported:10}]));
    return new Response("No offering",{status:404});
  };
  try {
    const {fetchCourseStatistics}=await import("../src/api/averageGrades/courseStatistics.js?old-course");
    const result=await fetchCourseStatistics({campus:"UBCO",subject:"PAST",course:"400"});
    assert.equal(result.source,"https://ubcgrades.com/#UBCO-2018W-PAST-400-OVERALL");assert.equal(result.latest.year,2018);assert.equal(result.fiveYear.average,null);assert.ok(!result.fiveYear.covered.includes(2018));
  } finally { globalThis.fetch=original; }
});
test("missing course data never produces a fabricated source page",async()=>{
  const original=globalThis.fetch;globalThis.fetch=async url=>new Response(JSON.stringify(String(url).includes("yearsessions")?["2025W"]:[]));
  try {const {fetchCourseStatistics}=await import("../src/api/averageGrades/courseStatistics.js?no-course");const result=await fetchCourseStatistics({campus:"UBCO",subject:"NONE",course:"101"});assert.equal(result.source,"");assert.equal(result.latest,null);}finally{globalThis.fetch=original;}
});
test("unusable imported block occurrences are rejected before any plan can be saved",()=>{
  const data={format:"ubc-workday-schedules",version:1,schedules:[plan([block({startDate:"2026-09-08",endDate:"2026-09-08"})])],settings:{}};
  assert.throws(()=>parseBackup(JSON.stringify(data)),/no valid occurrences/);
});
test("visual exports distinguish personal blocks and preserve their descriptive labels",async()=>{
  const {timetablePages}=await import("../src/exportLogic/exportTimetable.js");
  const pages=timetablePages(scheduleItems([course],[block()]));assert.equal(pages.pages.length,2);assert.ok(pages.pages[0].includes('stroke-dasharray="4 2"'));assert.ok(pages.pages[0].includes("Work shift"));assert.ok(!pages.pages[0].includes("personal:block-a"));
});


test("course Undo preserves a later personal-block update from another window",()=>{
  const state={courses:[structuredClone(course)],personalBlocks:[],savedSchedules:[plan()],currentSavedScheduleId:"plan-a"};
  const history=createScheduleUndoHistory(),before=captureScheduleChange(state);
  state.courses=[];history.record(before,captureScheduleChange(state),"Remove course");
  state.personalBlocks=[block()];state.savedSchedules[0].personalBlocks=[block()];
  const restore=history.plan(state);assert.equal(restore.working.courses.length,1);assert.equal(restore.working.personalBlocks[0].title,"Work shift");
});


test("editing a saved reusable block replaces that template, preserves plan copies and rejects stale writes",async()=>{
  const stored={};globalThis.chrome={runtime:{},storage:{local:{get:(keys,cb)=>cb(stored),set:(values,cb)=>{Object.assign(stored,structuredClone(values));cb();}}}};
  try {
    const original=(await loadReusableBlocks([block()]))[0], planCopy=structuredClone(original);
    const updated=await replaceReusableBlock(original,{...original,title:"New work shift",startMinutes:600,endMinutes:660});
    assert.equal(updated.length,1);assert.equal(updated[0].title,"New work shift");assert.notEqual(updated[0].id,original.id);assert.equal(planCopy.title,"Work shift");
    await assert.rejects(()=>replaceReusableBlock(original,{...original,title:"Stale overwrite"}),/changed or was removed/);
    assert.equal((await loadReusableBlocks())[0].title,"New work shift");
  }finally{delete globalThis.chrome;}
});
test("saved-block Edit uses the reusable editor without changing the working schedule",async()=>{
  const dom=new JSDOM('<div></div>');globalThis.window=dom.window;globalThis.document=dom.window.document;
  const current={...plan([block()]),id:"active-plan"};let library=normalizeBlockLibrary([block()]),applied=0;
  const {openPersonalBlocks}=await import("../src/mainPanel/schedules/personalBlocks.js");
  const d=openPersonalBlocks({root:document.body},{getCurrent:()=>current,setBlocks:async()=>applied++,loadLibrary:async()=>library,replaceSaved:async(original,next)=>{library=normalizeBlockLibrary(library.map(b=>b.id===original.id?next:b));return library;}});
  await d.libraryReady;const edit=d.dialog.querySelector('.saved-personal-blocks .personal-block-card').querySelectorAll('button')[1];assert.equal(edit.textContent,"Edit");edit.click();
  document.querySelector('[name=title]').value="Changed template";[...d.dialog.querySelectorAll('button')].find(b=>b.textContent==="Save reusable block").click();await new Promise(r=>setTimeout(r,10));
  assert.equal(library[0].title,"Changed template");assert.equal(current.personalBlocks[0].title,"Work shift");assert.equal(applied,0);assert.match(d.status.textContent,/Existing schedules are unchanged/);d.close();dom.window.close();
});


test("Save for reuse appears only without an exact content match, regardless of internal id",()=>{
  const dom=new JSDOM('<div id="list"></div>');globalThis.document=dom.window.document;
  const b=block(), library=normalizeBlockLibrary([b]);assert.equal(hasReusableBlock({...b,id:"a-different-plan-copy"},library),true);
  for(const different of [{title:"Changed title"},{startMinutes:571},{endDate:"2026-09-21"},{category:"Different"},{color:"#123456"},{exceptions:["2026-09-14"]}])assert.equal(hasReusableBlock({...b,...different},library),false);
  const ui={tableBody:document.querySelector('#list'),reusableBlocks:library};
  const draw=b=>renderPersonalBlockCards(ui,[b],{onSave:()=>{}});
  draw(b);assert.equal([...ui.tableBody.querySelectorAll('button')].some(n=>n.textContent==="Save for reuse"),false);
  draw({...b,title:"Changed title"});assert.equal([...ui.tableBody.querySelectorAll('button')].filter(n=>n.textContent==="Save for reuse").length,1);dom.window.close();
});
test("problem-report help uses short plain steps and enables a local report only after recording opt-in",async()=>{
  const dom=new JSDOM('<div class="settings-panel"><section class="settings-section--display"></section></div><div class="help-panel"></div>');globalThis.document=dom.window.document;
  const {mountBugReportSettings}=await import("../src/mainPanel/settings/bugReport.js");mountBugReportSettings({root:document});
  assert.ok(document.querySelector('.help-panel > .bug-report-help'));assert.equal(document.querySelector('.settings-panel .bug-report-help'),null);assert.equal(document.querySelector('h3').textContent,"Report a problem");assert.equal(document.querySelectorAll('ol li').length,3);assert.ok(!document.body.textContent.includes("Privacy & diagnostics"));
  const button=document.querySelector('button'),toggle=document.querySelector('input');assert.equal(button.textContent,"Download bug report");assert.equal(button.disabled,true);toggle.checked=true;toggle.dispatchEvent(new dom.window.Event('change'));assert.equal(button.disabled,false);toggle.checked=false;toggle.dispatchEvent(new dom.window.Event('change'));assert.equal(button.disabled,true);dom.window.close();
});
