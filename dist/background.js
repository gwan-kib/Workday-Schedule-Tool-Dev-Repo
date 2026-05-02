const g={global:!0,local:{},log:{}},p=({global:e,local:n,log:r}={})=>{if(typeof e=="boolean"&&(g.global=e),n&&typeof n=="object")for(const[t,o]of Object.entries(n))typeof o=="boolean"&&(g.local[t]=o);if(r&&typeof r=="object")for(const[t,o]of Object.entries(r))typeof o=="boolean"&&(g.log[t]=o)},T=(e,n)=>!(!g.global||e&&g.local[e]===!1||n&&g.log[n]===!1),C=e=>{const n=e?`[UBC Workday - Schedule Tool (file: ${e})]
`:`[UBC Workday - Schedule Tool]
`;return{log:(s,...l)=>{let c=null,d=null;s&&typeof s=="object"&&!Array.isArray(s)?(c=s,d=l):(c=null,d=[s,...l]);const u=c?.id,f=c?.on===!0;c?.on!==!1&&(!f&&!T(e,u)||console.log(n,...d))},warn:(s,...l)=>{let c=null,d=null;s&&typeof s=="object"&&!Array.isArray(s)?(c=s,d=l):d=[s,...l];const u=c?.id,f=c?.on===!0;c?.on!==!1&&(!f&&!T(e,u)||console.log("⚠️",n,...d))},error:(s,...l)=>{let c=null,d=null;s&&typeof s=="object"&&!Array.isArray(s)?(c=s,d=l):d=[s,...l];const u=c?.id,f=c?.on===!0;c?.on!==!1&&(!f&&!T(e,u)||console.log("🚩",n,...d))},on:()=>p({local:{[e]:!0}}),off:()=>p({local:{[e]:!1}})}},_=C("rmpApi");p({local:{rmpApi:!1}});const L="https://www.ratemyprofessors.com",v="https://www.ratemyprofessors.com/graphql",F="dGVzdDp0ZXN0",U="FETCH_RMP_RATING",O="U2Nob29sLTE0MTM=",P="U2Nob29sLTU0MzY=",B=/^(dr|prof|professor|mr|mrs|ms)\.?\s+/i,M=/\s(?:and|&)\s|\/|;|\|/i,S=new Map;function y(e){return String(e||"").replace(/\s+/g," ").trim()}function j(e){return y(e).replace(/\([^)]*\)/g," ").replace(B,"").replace(/,$/,"").trim()}function q(e){const n=j(e);if(!n)return null;const r=n.toUpperCase();if(r==="N/A"||r==="TBA"||r==="STAFF"||M.test(n))return null;let t=n;if(n.includes(",")){const s=n.split(",").map(l=>y(l)).filter(Boolean);if(s.length!==2)return null;t=`${s[1]} ${s[0]}`}const o=t.split(" ").map(s=>s.trim()).filter(Boolean);if(o.length<2)return null;const i=o[0],a=o[o.length-1];return{fullName:o.join(" "),firstName:i,lastName:a}}function x(e){return String(e).toUpperCase()==="UBCO"?P:O}function Y(e,n){return{query:`query TeacherSearchResultsPageQuery(
  $query: TeacherSearchQuery!
  $schoolID: ID
  $includeSchoolFilter: Boolean!
) {
  search: newSearch {
    ...TeacherSearchPagination_search_1ZLmLD
  }
  school: node(id: $schoolID) @include(if: $includeSchoolFilter) {
    __typename
    ... on School {
      name
    }
    id
  }
}

fragment TeacherSearchPagination_search_1ZLmLD on newSearch {
  teachers(query: $query, first: 8, after: "") {
    didFallback
    edges {
      cursor
      node {
        ...TeacherCard_teacher
        id
        __typename
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
    resultCount
    filters {
      field
      options {
        value
        id
      }
    }
  }
}

fragment TeacherCard_teacher on Teacher {
  id
  legacyId
  avgRating
  numRatings
  ...CardFeedback_teacher
  ...CardSchool_teacher
  ...CardName_teacher
  ...TeacherBookmark_teacher
}

fragment CardFeedback_teacher on Teacher {
  wouldTakeAgainPercent
  avgDifficulty
}

fragment CardSchool_teacher on Teacher {
  department
  school {
    name
    id
  }
}

fragment CardName_teacher on Teacher {
  firstName
  lastName
}

fragment TeacherBookmark_teacher on Teacher {
  id
  isSaved
}
`,variables:{query:{text:e,schoolID:n,fallback:!1,departmentID:null},schoolID:n,includeSchoolFilter:!0}}}function H(e,n){const r=e?.data?.search?.teachers?.edges;if(!Array.isArray(r)||!r.length)return null;const t=String(n?.firstName||"").toLowerCase(),o=String(n?.lastName||"").toLowerCase();for(const i of r){const a=i?.node;if(!a||a.avgRating===0)continue;const s=y(a.firstName).toLowerCase(),l=y(a.lastName).toLowerCase();if(s.startsWith(t)&&l.endsWith(o))return{rating:a.avgRating,link:`${L}/professor/${a.legacyId}`}}return null}async function W({profName:e,campus:n}={}){const r=q(e);if(!r)return null;const t=String(n||"").toUpperCase()==="UBCO"?"UBCO":"UBCV",o=x(t),i=`${t}|${r.fullName.toUpperCase()}`;if(S.has(i))return S.get(i);_.log({id:"queryProfRating.request"},"Fetching professor rating",{profName:r.fullName,campus:t});const a=await fetch(v,{method:"POST",headers:{Authorization:`Basic ${F}`,"Content-Type":"application/json"},body:JSON.stringify(Y(r.fullName,o))});if(!a.ok){const c=new Error(`RateMyProfessors request failed (${a.status})`);throw c.status=a.status,c}const s=await a.json(),l=H(s,r);return S.set(i,l),_.log({id:"queryProfRating.response"},"Resolved professor rating",{profName:r.fullName,campus:t,result:l}),l}const $=C("calendar-event-builder");p({local:{"calendar-event-builder":!1}});const I={Mon:"MO",Tue:"TU",Wed:"WE",Thu:"TH",Fri:"FR",Sat:"SA",Sun:"SU"},z=Object.values(I),Z=/(\d{4}-\d{2}-\d{2})\s*-\s*(\d{4}-\d{2}-\d{2})/,G=/(\d{1,2}):(\d{2})\s*([ap])\.?m\.?\s*-\s*(\d{1,2}):(\d{2})\s*([ap])\.?m\.?/i,Q=/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/g,V=/\b(?:room|rm)\b\s*[:\-]?\s*([A-Za-z0-9]+)/i,J=/\bfloor\b\s*[:\-]?\s*(-?[A-Za-z0-9]+)/i,m=e=>String(e).padStart(2,"0"),N=(e,n,r)=>{let t=Number.parseInt(e,10);const o=Number.parseInt(n,10),i=r.toLowerCase();return i==="p"&&t!==12&&(t+=12),i==="a"&&t===12&&(t=0),{hours:t,minutes:o}},K=e=>{const n=String(e||""),r=n.match(Z),t=n.match(G),o=n.match(Q)||[];if(!r||!t||!o.length)return null;const i=[...new Set(o.map(a=>I[a]).filter(Boolean))];return i.length?{startDate:r[1],endDate:r[2],startTime:N(t[1],t[2],t[3]),endTime:N(t[4],t[5],t[6]),dayCodes:i}:null},X=e=>{const n=e.getDay();return z[n===0?6:n-1]},ee=(e,n)=>{const r=new Date(`${e}T00:00:00`);for(let t=0;t<7;t+=1){const o=new Date(r);if(o.setDate(r.getDate()+t),n.includes(X(o)))return o}return r},E=e=>{const n=e.getFullYear(),r=m(e.getMonth()+1),t=m(e.getDate()),o=m(e.getHours()),i=m(e.getMinutes());return`${n}-${r}-${t}T${o}:${i}:00`},te=e=>{const n=e.getUTCFullYear(),r=m(e.getUTCMonth()+1),t=m(e.getUTCDate()),o=m(e.getUTCHours()),i=m(e.getUTCMinutes()),a=m(e.getUTCSeconds());return`${n}${r}${t}T${o}${i}${a}Z`},ne=e=>{const n=String(e||""),r=n.split("|").map(a=>a.trim()).filter(Boolean),t=r.find(a=>/\([A-Z]{2,}\)/.test(a)),o=n.match(J),i=n.match(V);if(t){const a=[o?`Floor ${o[1]}`:null,i?`Room ${i[1]}`:null].filter(Boolean);return a.length?`${t} – ${a.join(", ")}`:t}return r.find(a=>/online/i.test(a))||""},re=e=>[e.section_number?`Section: ${e.section_number}`:null,e.instructor&&e.instructor!=="N/A"?`Instructor: ${e.instructor}`:null,e.instructionalFormat?`Format: ${e.instructionalFormat}`:null].filter(Boolean).join(`
`),oe=e=>{const n=[e.code,e.title].filter(Boolean).join(" - ")||"Course";return e.instructionalFormat&&e.instructionalFormat!=="Lecture"?`${n} (${e.instructionalFormat})`:n},ae=(e,n,r)=>{const t=K(n);if(!t)return $.warn({id:"buildEvent.skip"},"Could not parse meeting line:",n),null;const o=ee(t.startDate,t.dayCodes),i=new Date(o);i.setHours(t.startTime.hours,t.startTime.minutes,0,0);const a=new Date(o);a.setHours(t.endTime.hours,t.endTime.minutes,0,0);const s=new Date(`${t.endDate}T23:59:59`),l={summary:oe(e),description:re(e),location:ne(n),start:{dateTime:E(i),timeZone:r},end:{dateTime:E(a),timeZone:r},recurrence:[`RRULE:FREQ=WEEKLY;BYDAY=${t.dayCodes.join(",")};UNTIL=${te(s)}`]};return $.log({id:"buildEvent"},l),l};function se(e,{timeZone:n}={}){return(Array.isArray(e?.meetingLines)?e.meetingLines:[]).map(t=>ae(e,t,n)).filter(Boolean)}const h=C("calendarIntegration");p({local:{calendarIntegration:!1}});const ie="https://www.googleapis.com/calendar/v3",ce="America/Vancouver",D={IMPORT:"IMPORT_TO_GCAL",DISCONNECT:"DISCONNECT_GCAL"},w=({interactive:e=!0}={})=>new Promise((n,r)=>{chrome.identity.getAuthToken({interactive:e},t=>{chrome.runtime.lastError?r(new Error(chrome.runtime.lastError.message||"Auth failed")):t?n(t):r(new Error("No auth token returned by Chrome Identity API"))})}),k=e=>new Promise(n=>{if(!e)return n();chrome.identity.removeCachedAuthToken({token:e},()=>n())}),R=async(e,n,r)=>{const t=`${ie}/calendars/${encodeURIComponent(n)}/events`,o=await fetch(t,{method:"POST",headers:{Authorization:`Bearer ${e}`,"Content-Type":"application/json"},body:JSON.stringify(r)});if(o.ok)return o.json();const i=await o.text().catch(()=>""),a=new Error(`Calendar API error ${o.status}: ${i||o.statusText}`);throw a.status=o.status,a};async function le(e,n={}){const r=n.calendarId||"primary",t=n.timeZone||ce;if(!Array.isArray(e)||!e.length)return h.warn("No courses provided"),{added:0,failed:0,skipped:0,errors:[]};const o=e.flatMap(u=>se(u,{timeZone:t})),i=e.reduce((u,f)=>u+(Array.isArray(f?.meetingLines)?f.meetingLines.length:0),0),a=Math.max(0,i-o.length);if(h.log({id:"addCoursesToCalendar.events"},`Built ${o.length} event(s) from ${e.length} course(s); skipped ${a} unparseable line(s)`),!o.length)return{added:0,failed:0,skipped:a,errors:[]};let s=await w({interactive:!0});const l=async u=>{try{return await R(s,r,u)}catch(f){if(f.status!==401)throw f;return h.warn({id:"insert.retry"},"Token rejected, refreshing once"),await k(s),s=await w({interactive:!0}),R(s,r,u)}},c=await Promise.allSettled(o.map(l)),d={added:c.filter(u=>u.status==="fulfilled").length,failed:c.filter(u=>u.status==="rejected").length,skipped:a,errors:c.filter(u=>u.status==="rejected").map(u=>u.reason)};return h.log({id:"addCoursesToCalendar.summary"},d),d}async function ue(){try{const e=await w({interactive:!1});return await k(e),h.log({id:"disconnectCalendar"},"Cached calendar auth token cleared"),{cleared:!0}}catch(e){return h.log({id:"disconnectCalendar.noop"},"No cached token to clear:",e.message),{cleared:!1}}}const A=C("background");p({local:{background:!1}});chrome.runtime.onMessage.addListener((e,n,r)=>{if(e?.type===U)return(async()=>{try{const t=await W(e?.payload||{});r({ok:!0,data:t})}catch(t){A.error("Failed to fetch professor rating",{sender:n?.tab?.id||"unknown",error:String(t)}),r({ok:!1,error:t?.message||"Failed to fetch professor rating"})}})(),!0});chrome.runtime.onMessage.addListener((e,n,r)=>{if(e?.type===D.IMPORT)return(async()=>{try{const{courses:t,options:o}=e.payload||{},i=await le(t,o);r({ok:!0,summary:{added:i.added,failed:i.failed,skipped:i.skipped,errors:i.errors.map(a=>a?.message||String(a))}})}catch(t){A.error("Calendar import failed",{sender:n?.tab?.id||"unknown",error:String(t)}),r({ok:!1,error:t?.message||"Calendar import failed"})}})(),!0;if(e?.type===D.DISCONNECT)return(async()=>{try{const t=await ue();r({ok:!0,cleared:t.cleared})}catch(t){A.error("Calendar disconnect failed",{error:String(t)}),r({ok:!1,error:t?.message||"Disconnect failed"})}})(),!0});
//# sourceMappingURL=background.js.map
