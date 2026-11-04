import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { personalBlockCourses, validatePersonalBlocks, scheduleItems, calendarExportItems } from "../src/core/personalBlocks.js";
import { normalizeSchedule } from "../src/core/meetings.js";
import { conflictDetails } from "../src/core/planner.js";
import { createBackup, parseBackup, planScheduleImport } from "../src/core/scheduleBackup.js";
import { buildICSFile } from "../src/exportLogic/exportIcs.js";
import { normalizeAppearance, resolvedTheme, initializeAppearance } from "../src/mainPanel/settings/appearance.js";
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
  assert.deepEqual(restored.settings.wdAppearance,{theme:"dark",density:"compact"});
  const imported=planScheduleImport([plan()],restored.schedules[0],()=>"new");assert.equal(imported.imported.personalBlocks.length,1);assert.equal(imported.imported.notes,"Reminder");assert.equal(imported.imported.isFavorite,false);
  const legacy=parseBackup(JSON.stringify({format:"ubc-workday-schedules",version:1,schedules:[{...plan(),personalBlocks:undefined}],settings:{}}));assert.deepEqual(legacy.schedules[0].personalBlocks,[]);
});
test("personal commitments are excluded from ICS unless explicitly selected",()=>{
  const excluded=buildICSFile(calendarExportItems([course],[block()]));
  assert.ok(!excluded.includes("Work shift"));assert.equal((excluded.match(/BEGIN:VEVENT/g)||[]).length,1);
  const included=buildICSFile(calendarExportItems([course],[block()],true));
  assert.ok(included.includes("Work shift"));assert.ok(included.includes("Personal block"));assert.equal((included.match(/BEGIN:VEVENT/g)||[]).length,2);
});
test("appearance defaults follow system with safe fallback and explicit overrides",()=>{
  assert.deepEqual(normalizeAppearance(null),{theme:"system",density:"comfortable"});
  assert.equal(resolvedTheme("system",true),"dark");assert.equal(resolvedTheme("system"),"light");assert.equal(resolvedTheme("light",true),"light");assert.equal(resolvedTheme("dark",false),"dark");
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
    if(browser==="firefox") {assert.ok(!manifest.permissions.includes("identity"));assert.ok(!manifest.host_permissions.some(p=>p.includes("googleapis")));}
  }
});
test("block editor saves explicitly, preserves other metadata and refuses a stale edit",async()=>{
  const dom=new JSDOM('<button id="opener">Blocks</button>',{url:"https://fixture.test"});
  globalThis.window=dom.window;globalThis.document=dom.window.document;
  let plans=[plan()];
  const {openPersonalBlocks}=await import("../src/mainPanel/schedules/personalBlocks.js");
  const d=openPersonalBlocks({root:document.body},{scheduleId:"plan-a",getSchedules:()=>plans,saveSchedules:async next=>{plans=next;}});
  const click=text=>[...d.dialog.querySelectorAll("button")].find(b=>b.textContent===text).click();
  const wait=()=>new Promise(r=>setTimeout(r,10));
  click("Add personal block");document.querySelector('[name=title]').value="Lunch";document.querySelector('[name=startTime]').value="12:00";document.querySelector('[name=endTime]').value="13:00";
  click("Save block");await wait();assert.equal(plans[0].personalBlocks.length,1);assert.equal(plans[0].notes,"Reminder");
  click("Edit");document.querySelector('[name=title]').value="Edited";
  plans=[{...plans[0],personalBlocks:[{...plans[0].personalBlocks[0],title:"Newer elsewhere"}]}];
  click("Save block");await wait();assert.match(d.status.textContent,/changed in another window/);assert.equal(plans[0].personalBlocks[0].title,"Newer elsewhere");
  click("Cancel");click("Delete");await wait();assert.equal(plans[0].personalBlocks.length,1);click("Confirm delete");await wait();assert.equal(plans[0].personalBlocks.length,0);d.close();dom.window.close();
});
test("appearance persists only validated display preferences and tracks system changes",async()=>{
  const dom=new JSDOM('<section class="settings-section--display"></section>',{url:"https://fixture.test"});globalThis.document=dom.window.document;
  const listeners=[];const stored={wdAppearance:{theme:"system",density:"comfortable"}};let mediaChanged;
  globalThis.matchMedia=()=>({matches:true,addEventListener:(_,fn)=>{mediaChanged=fn;},removeEventListener(){}});
  globalThis.chrome={runtime:{},storage:{local:{get:(keys,cb)=>cb(stored),set:(v,cb)=>{Object.assign(stored,v);cb();}},onChanged:{addListener:fn=>listeners.push(fn),removeListener(){}}}};
  const cleanup=await initializeAppearance({root:document});assert.equal(document.documentElement.dataset.wstTheme,"dark");
  const select=document.querySelector('[aria-label=Appearance]');select.value="light";select.dispatchEvent(new dom.window.Event("change"));await new Promise(r=>setTimeout(r,0));
  assert.equal(stored.wdAppearance.theme,"light");mediaChanged();assert.equal(document.documentElement.dataset.wstTheme,"light");
  listeners[0]({wdAppearance:{newValue:{theme:"dark",density:"compact"}}},"local");assert.equal(document.documentElement.dataset.wstDensity,"compact");cleanup();dom.window.close();delete globalThis.chrome;delete globalThis.matchMedia;
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
