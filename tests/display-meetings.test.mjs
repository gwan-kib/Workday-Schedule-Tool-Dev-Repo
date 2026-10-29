import test from 'node:test';
import assert from 'node:assert/strict';
import { course, line } from './fixtures/courses.mjs';
import { scheduleLayout } from '../src/core/scheduleLayout.js';
import { normalizeSchedule } from '../src/core/meetings.js';
import { detectScheduleConflicts } from '../src/mainPanel/schedules/scheduleCollisions.js';
import { timetablePages } from '../src/exportLogic/exportTimetable.js';
import { JSDOM } from 'jsdom';
import { renderSchedule } from '../src/mainPanel/schedules/scheduleView.js';

const rangeA='2026-09-07 - 2026-10-18', rangeB='2026-10-26 - 2026-12-18';
const splitCourse=()=>course({meetingLines:[line('Mon','9:00 a.m. - 10:00 a.m.',rangeA),line('Mon','9:00 a.m. - 10:00 a.m.',rangeB)]});

test('a section with split date ranges draws once while retaining canonical records and exact dates',()=>{
  const c=splitCourse(), before=JSON.stringify(c), normalized=normalizeSchedule([c]);
  const layout=scheduleLayout([c]), events=layout.eventsByDay.get('Mon');
  assert.equal(events.length,1);
  assert.equal(layout.meetings.length,2);
  assert.deepEqual(events[0].dates,[...new Set(normalized.meetings.flatMap(m=>m.dates))].sort());
  assert.equal(events[0].sourceMeetingIds.length,2);
  assert.ok(!events[0].dates.includes('2026-10-19'));
  assert.equal(JSON.stringify(c),before);
});

test('combining display records preserves real conflicts in either range and excludes the break',()=>{
  const a=splitCourse();
  const other=range=>course({code:'OTHER 102',meetingLines:[line('Mon','9:30 a.m. - 10:30 a.m.',range)]});
  for (const range of [rangeA,rangeB]) assert.equal(detectScheduleConflicts(scheduleLayout([a,other(range)]).eventsByDay).conflictBlocks.length,1);
  assert.equal(detectScheduleConflicts(scheduleLayout([a,other('2026-10-19 - 2026-10-25')]).eventsByDay).conflictBlocks.length,0);
});

test('different sections and changed meeting times remain separate',()=>{
  const a=splitCourse();
  const b={...a,section_number:'002'};
  assert.equal(scheduleLayout([a,b]).eventsByDay.get('Mon').length,2);
  const changed=course({meetingLines:[a.meetingLines[0],line('Mon','11:00 a.m. - 12:00 p.m.',rangeB)]});
  assert.equal(scheduleLayout([changed]).eventsByDay.get('Mon').length,2);
});

test('opposite-week records of one section display once and retain both sets of teaching dates',()=>{
  const c=course({meetingLines:[line('Mon (Alternate Weeks)','9:00 a.m. - 10:00 a.m.',rangeA),line('Mon (Alternate Weeks)','9:00 a.m. - 10:00 a.m.',rangeA)],meetingAnchors:['2026-09-07','2026-09-14']});
  assert.equal(scheduleLayout([c]).eventsByDay.get('Mon').length,1);
  for(const week of [1,2]) {
    const events=scheduleLayout([c],week).eventsByDay.get('Mon');
    assert.equal(events.length,1);
    assert.equal(events[0].dates.length,3);
  }
});

test('main/popup renderer and visual export show one block per matching section/day/time',()=>{
  const dom=new JSDOM('<div id="grid"></div>');
  globalThis.document=dom.window.document;globalThis.window=dom.window;globalThis.getComputedStyle=dom.window.getComputedStyle;
  renderSchedule({scheduleGrid:document.querySelector('#grid')},[splitCourse()]);
  assert.equal(document.querySelectorAll('.schedule-entry-float').length,1);
  assert.equal(document.querySelector('.schedule-entry-float').classList.contains('has-conflict'),false);
  const svg=timetablePages([splitCourse()]).pages[0];
  assert.equal((svg.match(/class="schedule-entry"/g)||[]).length,1);
  dom.window.close();
});
