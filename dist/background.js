const y={global:!0,local:{},log:{}},C=({global:e,local:n,log:r}={})=>{if(typeof e=="boolean"&&(y.global=e),n&&typeof n=="object")for(const[t,o]of Object.entries(n))typeof o=="boolean"&&(y.local[t]=o);if(r&&typeof r=="object")for(const[t,o]of Object.entries(r))typeof o=="boolean"&&(y.log[t]=o)},$=(e,n)=>!(!y.global||e&&y.local[e]===!1||n&&y.log[n]===!1),A=e=>{const n=e?`[UBC Workday - Schedule Tool (file: ${e})]
`:`[UBC Workday - Schedule Tool]
`;return{log:(i,...d)=>{let c=null,u=null;i&&typeof i=="object"&&!Array.isArray(i)?(c=i,u=d):(c=null,u=[i,...d]);const h=c?.id,g=c?.on===!0;c?.on!==!1&&(!g&&!$(e,h)||console.log(n,...u))},warn:(i,...d)=>{let c=null,u=null;i&&typeof i=="object"&&!Array.isArray(i)?(c=i,u=d):u=[i,...d];const h=c?.id,g=c?.on===!0;c?.on!==!1&&(!g&&!$(e,h)||console.log("⚠️",n,...u))},error:(i,...d)=>{let c=null,u=null;i&&typeof i=="object"&&!Array.isArray(i)?(c=i,u=d):u=[i,...d];const h=c?.id,g=c?.on===!0;c?.on!==!1&&(!g&&!$(e,h)||console.log("🚩",n,...u))},on:()=>C({local:{[e]:!0}}),off:()=>C({local:{[e]:!1}})}},I=A("rmpApi");C({local:{rmpApi:!1}});const x="https://www.ratemyprofessors.com",B="https://www.ratemyprofessors.com/graphql",j="dGVzdDp0ZXN0",M="FETCH_RMP_RATING",Y="U2Nob29sLTE0MTM=",q="U2Nob29sLTU0MzY=",W=/^(dr|prof|professor|mr|mrs|ms)\.?\s+/i,z=/\s(?:and|&)\s|\/|;|\|/i,E=new Map;function w(e){return String(e||"").replace(/\s+/g," ").trim()}function G(e){return w(e).replace(/\([^)]*\)/g," ").replace(W,"").replace(/,$/,"").trim()}function H(e){const n=G(e);if(!n)return null;const r=n.toUpperCase();if(r==="N/A"||r==="TBA"||r==="STAFF"||z.test(n))return null;let t=n;if(n.includes(",")){const i=n.split(",").map(d=>w(d)).filter(Boolean);if(i.length!==2)return null;t=`${i[1]} ${i[0]}`}const o=t.split(" ").map(i=>i.trim()).filter(Boolean);if(o.length<2)return null;const s=o[0],a=o[o.length-1];return{fullName:o.join(" "),firstName:s,lastName:a}}function Z(e){return String(e).toUpperCase()==="UBCO"?q:Y}function V(e,n){return{query:`query TeacherSearchResultsPageQuery(
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
`,variables:{query:{text:e,schoolID:n,fallback:!1,departmentID:null},schoolID:n,includeSchoolFilter:!0}}}function K(e,n){const r=e?.data?.search?.teachers?.edges;if(!Array.isArray(r)||!r.length)return null;const t=String(n?.firstName||"").toLowerCase(),o=String(n?.lastName||"").toLowerCase();for(const s of r){const a=s?.node;if(!a||a.avgRating===0)continue;const i=w(a.firstName).toLowerCase(),d=w(a.lastName).toLowerCase();if(i.startsWith(t)&&d.endsWith(o))return{rating:a.avgRating,link:`${x}/professor/${a.legacyId}`}}return null}async function Q({profName:e,campus:n}={}){const r=H(e);if(!r)return null;const t=String(n||"").toUpperCase()==="UBCO"?"UBCO":"UBCV",o=Z(t),s=`${t}|${r.fullName.toUpperCase()}`;if(E.has(s))return E.get(s);I.log({id:"queryProfRating.request"},"Fetching professor rating",{profName:r.fullName,campus:t});const a=await fetch(B,{method:"POST",headers:{Authorization:`Basic ${j}`,"Content-Type":"application/json"},body:JSON.stringify(V(r.fullName,o))});if(!a.ok){const c=new Error(`RateMyProfessors request failed (${a.status})`);throw c.status=a.status,c}const i=await a.json(),d=K(i,r);return E.set(s,d),I.log({id:"queryProfRating.response"},"Resolved professor rating",{profName:r.fullName,campus:t,result:d}),d}const k=A("calendar-event-builder");C({local:{"calendar-event-builder":!1}});const F={Mon:"MO",Tue:"TU",Wed:"WE",Thu:"TH",Fri:"FR",Sat:"SA",Sun:"SU"},J=Object.values(F),X={1:"11",2:"6",3:"3",4:"9",5:"5",6:"10",7:"7"},ee=e=>{const n=e?.colorIndex;return Number.isInteger(n)?X[n]:void 0},te=/(\d{4}-\d{2}-\d{2})\s*-\s*(\d{4}-\d{2}-\d{2})/,ne=/(\d{1,2}):(\d{2})\s*([ap])\.?m\.?\s*-\s*(\d{1,2}):(\d{2})\s*([ap])\.?m\.?/i,re=/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/g,oe=/\b(?:room|rm)\b\s*[:\-]?\s*([A-Za-z0-9]+)/i,ae=/\bfloor\b\s*[:\-]?\s*(-?[A-Za-z0-9]+)/i,m=e=>String(e).padStart(2,"0"),D=(e,n,r)=>{let t=Number.parseInt(e,10);const o=Number.parseInt(n,10),s=r.toLowerCase();return s==="p"&&t!==12&&(t+=12),s==="a"&&t===12&&(t=0),{hours:t,minutes:o}},se=e=>{const n=String(e||""),r=n.match(te),t=n.match(ne),o=n.match(re)||[];if(!r||!t||!o.length)return null;const s=[...new Set(o.map(a=>F[a]).filter(Boolean))];return s.length?{startDate:r[1],endDate:r[2],startTime:D(t[1],t[2],t[3]),endTime:D(t[4],t[5],t[6]),dayCodes:s}:null},ie=e=>{const n=e.getDay();return J[n===0?6:n-1]},ce=(e,n)=>{const r=new Date(`${e}T00:00:00`);for(let t=0;t<7;t+=1){const o=new Date(r);if(o.setDate(r.getDate()+t),n.includes(ie(o)))return o}return r},v=e=>{const n=e.getFullYear(),r=m(e.getMonth()+1),t=m(e.getDate()),o=m(e.getHours()),s=m(e.getMinutes());return`${n}-${r}-${t}T${o}:${s}:00`},le=e=>{const n=e.getUTCFullYear(),r=m(e.getUTCMonth()+1),t=m(e.getUTCDate()),o=m(e.getUTCHours()),s=m(e.getUTCMinutes()),a=m(e.getUTCSeconds());return`${n}${r}${t}T${o}${s}${a}Z`},de=e=>{const n=String(e||""),r=n.split("|").map(a=>a.trim()).filter(Boolean),t=r.find(a=>/\([A-Z]{2,}\)/.test(a)),o=n.match(ae),s=n.match(oe);if(t){const a=[o?`Floor ${o[1]}`:null,s?`Room ${s[1]}`:null].filter(Boolean);return a.length?`${t} – ${a.join(", ")}`:t}return r.find(a=>/online/i.test(a))||""},ue=e=>[e.section_number?`Section: ${e.section_number}`:null,e.instructor&&e.instructor!=="N/A"?`Instructor: ${e.instructor}`:null,e.instructionalFormat?`Format: ${e.instructionalFormat}`:null].filter(Boolean).join(`
`),fe=e=>{const n=[e.code,e.title].filter(Boolean).join(" - ")||"Course";return e.instructionalFormat&&e.instructionalFormat!=="Lecture"?`${n} (${e.instructionalFormat})`:n},me=(e,n,r)=>{const t=se(n);if(!t)return k.warn({id:"buildEvent.skip"},"Could not parse meeting line:",n),null;const o=ce(t.startDate,t.dayCodes),s=new Date(o);s.setHours(t.startTime.hours,t.startTime.minutes,0,0);const a=new Date(o);a.setHours(t.endTime.hours,t.endTime.minutes,0,0);const i=new Date(`${t.endDate}T23:59:59`),d={summary:fe(e),description:ue(e),location:de(n),start:{dateTime:v(s),timeZone:r},end:{dateTime:v(a),timeZone:r},recurrence:[`RRULE:FREQ=WEEKLY;BYDAY=${t.dayCodes.join(",")};UNTIL=${le(i)}`]},c=ee(e);return c&&(d.colorId=c),k.log({id:"buildEvent"},d),d};function he(e,{timeZone:n}={}){return(Array.isArray(e?.meetingLines)?e.meetingLines:[]).map(t=>me(e,t,n)).filter(Boolean)}const p=A("calendarIntegration");C({local:{calendarIntegration:!1}});const N="https://www.googleapis.com/calendar/v3",ge="America/Vancouver",P="wstSource",U="workday-import",L={SYNC:"SYNC_GCAL",DISCONNECT:"DISCONNECT_GCAL"},b=({interactive:e=!0}={})=>new Promise((n,r)=>{if(!chrome?.identity?.getAuthToken){r(new Error("Chrome Identity API is unavailable. Reload the extension from chrome://extensions in Google Chrome and make sure the identity permission is enabled."));return}chrome.identity.getAuthToken({interactive:e},t=>{chrome.runtime.lastError?r(new Error(chrome.runtime.lastError.message||"Auth failed")):t?n(t):r(new Error("No auth token returned by Chrome Identity API"))})}),O=e=>new Promise(n=>{if(!e||!chrome?.identity?.removeCachedAuthToken)return n();chrome.identity.removeCachedAuthToken({token:e},()=>n())}),pe=e=>({...e,extendedProperties:{...e.extendedProperties||{},private:{...e.extendedProperties?.private||{},[P]:U}}}),ye=async(e,n,r)=>{const t=`${N}/calendars/${encodeURIComponent(n)}/events`,o=await fetch(t,{method:"POST",headers:{Authorization:`Bearer ${e}`,"Content-Type":"application/json"},body:JSON.stringify(r)});if(o.ok)return o.json();const s=await o.text().catch(()=>""),a=new Error(`Calendar API error ${o.status}: ${s||o.statusText}`);throw a.status=o.status,a},Ce=async(e,n)=>{const r=[];let t;do{const o=new URLSearchParams({privateExtendedProperty:`${P}=${U}`,maxResults:"2500",showDeleted:"false",fields:"items(id),nextPageToken"});t&&o.set("pageToken",t);const s=`${N}/calendars/${encodeURIComponent(n)}/events?${o.toString()}`,a=await fetch(s,{headers:{Authorization:`Bearer ${e}`}});if(!a.ok){const d=await a.text().catch(()=>""),c=new Error(`Calendar list error ${a.status}: ${d||a.statusText}`);throw c.status=a.status,c}const i=await a.json();Array.isArray(i.items)&&r.push(...i.items),t=i.nextPageToken}while(t);return r},Te=async(e,n,r)=>{const t=`${N}/calendars/${encodeURIComponent(n)}/events/${encodeURIComponent(r)}`,o=await fetch(t,{method:"DELETE",headers:{Authorization:`Bearer ${e}`}});if(o.ok||o.status===410)return;const s=await o.text().catch(()=>""),a=new Error(`Calendar delete error ${o.status}: ${s||o.statusText}`);throw a.status=o.status,a};async function we(e,n={}){const r=n.calendarId||"primary",t=n.timeZone||ge;if(!Array.isArray(e)||!e.length)return p.warn("No courses provided"),{removed:0,deleteFailed:0,added:0,failed:0,skipped:0,errors:[]};const o=e.flatMap(l=>he(l,{timeZone:t})).map(pe),s=e.reduce((l,f)=>l+(Array.isArray(f?.meetingLines)?f.meetingLines.length:0),0),a=Math.max(0,s-o.length);p.log({id:"syncCoursesToCalendar.events"},`Built ${o.length} event(s) from ${e.length} course(s); skipped ${a} unparseable line(s)`);let i=await b({interactive:!0});const d=async l=>{try{return await l(i)}catch(f){if(f.status!==401)throw f;return p.warn({id:"withRetry.refresh"},"Token rejected, refreshing once"),await O(i),i=await b({interactive:!0}),l(i)}},c=await d(l=>Ce(l,r));p.log({id:"syncCoursesToCalendar.existing"},`Found ${c.length} previously imported event(s)`);const u=c.length?await Promise.allSettled(c.map(l=>d(f=>Te(f,r,l.id)))):[],h=u.filter(l=>l.status==="fulfilled").length,g=u.filter(l=>l.status==="rejected").length,T=u.filter(l=>l.status==="rejected").map(l=>l.reason),S=o.length?await Promise.allSettled(o.map(l=>d(f=>ye(f,r,l)))):[],R={removed:h,deleteFailed:g,added:S.filter(l=>l.status==="fulfilled").length,failed:S.filter(l=>l.status==="rejected").length,skipped:a,errors:[...T,...S.filter(l=>l.status==="rejected").map(l=>l.reason)]};return p.log({id:"syncCoursesToCalendar.summary"},R),R}async function Ae(){try{const e=await b({interactive:!1});return await O(e),p.log({id:"disconnectCalendar"},"Cached calendar auth token cleared"),{cleared:!0}}catch(e){return p.log({id:"disconnectCalendar.noop"},"No cached token to clear:",e.message),{cleared:!1}}}const _=A("background");C({local:{background:!1}});chrome.runtime.onMessage.addListener((e,n,r)=>{if(e?.type===M)return(async()=>{try{const t=await Q(e?.payload||{});r({ok:!0,data:t})}catch(t){_.error("Failed to fetch professor rating",{sender:n?.tab?.id||"unknown",error:String(t)}),r({ok:!1,error:t?.message||"Failed to fetch professor rating"})}})(),!0});chrome.runtime.onMessage.addListener((e,n,r)=>{if(e?.type===L.SYNC)return(async()=>{try{const{courses:t,options:o}=e.payload||{},s=await we(t,o);r({ok:!0,summary:{removed:s.removed,deleteFailed:s.deleteFailed,added:s.added,failed:s.failed,skipped:s.skipped,errors:s.errors.map(a=>a?.message||String(a))}})}catch(t){_.error("Calendar sync failed",{sender:n?.tab?.id||"unknown",error:String(t)}),r({ok:!1,error:t?.message||"Calendar sync failed"})}})(),!0;if(e?.type===L.DISCONNECT)return(async()=>{try{const t=await Ae();r({ok:!0,cleared:t.cleared})}catch(t){_.error("Calendar disconnect failed",{error:String(t)}),r({ok:!1,error:t?.message||"Disconnect failed"})}})(),!0});
//# sourceMappingURL=background.js.map
