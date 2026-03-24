const u={global:!0,local:{},log:{}},m=({global:e,local:n,log:t}={})=>{if(typeof e=="boolean"&&(u.global=e),n&&typeof n=="object")for(const[o,s]of Object.entries(n))typeof s=="boolean"&&(u.local[o]=s);if(t&&typeof t=="object")for(const[o,s]of Object.entries(t))typeof s=="boolean"&&(u.log[o]=s)},T=(e,n)=>!(!u.global||e&&u.local[e]===!1||n&&u.log[n]===!1),S=e=>{const n=e?`[UBC Workday - Schedule Tool (file: ${e})]
`:`[UBC Workday - Schedule Tool]
`;return{log:(r,...c)=>{let a=null,l=null;r&&typeof r=="object"&&!Array.isArray(r)?(a=r,l=c):(a=null,l=[r,...c]);const d=a?.id,h=a?.on===!0;a?.on!==!1&&(!h&&!T(e,d)||console.log(n,...l))},warn:(r,...c)=>{let a=null,l=null;r&&typeof r=="object"&&!Array.isArray(r)?(a=r,l=c):l=[r,...c];const d=a?.id,h=a?.on===!0;a?.on!==!1&&(!h&&!T(e,d)||console.log("⚠️",n,...l))},error:(r,...c)=>{let a=null,l=null;r&&typeof r=="object"&&!Array.isArray(r)?(a=r,l=c):l=[r,...c];const d=a?.id,h=a?.on===!0;a?.on!==!1&&(!h&&!T(e,d)||console.log("🚩",n,...l))},on:()=>m({local:{[e]:!0}}),off:()=>m({local:{[e]:!1}})}},b=S("rmpApi");m({local:{rmpApi:!1}});const A="https://www.ratemyprofessors.com",P="https://www.ratemyprofessors.com/graphql",L="dGVzdDp0ZXN0",R="FETCH_RMP_RATING",k="U2Nob29sLTE0MTM=",I="U2Nob29sLTU0MzY=",U=/^(dr|prof|professor|mr|mrs|ms)\.?\s+/i,v=/\s(?:and|&)\s|\/|;|\|/i,_=new Map;function y(e){return String(e||"").replace(/\s+/g," ").trim()}function B(e){return y(e).replace(/\([^)]*\)/g," ").replace(U,"").replace(/,$/,"").trim()}function F(e){const n=B(e);if(!n)return null;const t=n.toUpperCase();if(t==="N/A"||t==="TBA"||t==="STAFF"||v.test(n))return null;let o=n;if(n.includes(",")){const r=n.split(",").map(c=>y(c)).filter(Boolean);if(r.length!==2)return null;o=`${r[1]} ${r[0]}`}const s=o.split(" ").map(r=>r.trim()).filter(Boolean);if(s.length<2)return null;const f=s[0],i=s[s.length-1];return{fullName:s.join(" "),firstName:f,lastName:i}}function $(e){return String(e).toUpperCase()==="UBCO"?I:k}function E(e,n){return{query:`query TeacherSearchResultsPageQuery(
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
`,variables:{query:{text:e,schoolID:n,fallback:!1,departmentID:null},schoolID:n,includeSchoolFilter:!0}}}function O(e,n){const t=e?.data?.search?.teachers?.edges;if(!Array.isArray(t)||!t.length)return null;const o=String(n?.firstName||"").toLowerCase(),s=String(n?.lastName||"").toLowerCase();for(const f of t){const i=f?.node;if(!i||i.avgRating===0)continue;const r=y(i.firstName).toLowerCase(),c=y(i.lastName).toLowerCase();if(r.startsWith(o)&&c.endsWith(s))return{rating:i.avgRating,link:`${A}/professor/${i.legacyId}`}}return null}async function q({profName:e,campus:n}={}){const t=F(e);if(!t)return null;const o=String(n||"").toUpperCase()==="UBCO"?"UBCO":"UBCV",s=$(o),f=`${o}|${t.fullName.toUpperCase()}`;if(_.has(f))return _.get(f);b.log({id:"queryProfRating.request"},"Fetching professor rating",{profName:t.fullName,campus:o});const i=await fetch(P,{method:"POST",headers:{Authorization:`Basic ${L}`,"Content-Type":"application/json"},body:JSON.stringify(E(t.fullName,s))});if(!i.ok){const a=new Error(`RateMyProfessors request failed (${i.status})`);throw a.status=i.status,a}const r=await i.json(),c=O(r,t);return _.set(f,c),b.log({id:"queryProfRating.response"},"Resolved professor rating",{profName:t.fullName,campus:o,result:c}),c}const p=S("background");m({local:{background:!1}});const D=/^https:\/\/[^/]+\.myworkday\.com\//i,j="dist/popup.html";function w(e){return typeof e?.url=="string"&&D.test(e.url)}async function N(e){if(!e?.id)return;const n=w(e)?"":j;await chrome.action.setPopup({tabId:e.id,popup:n})}async function g(){const[e]=await chrome.tabs.query({active:!0,currentWindow:!0});await N(e)}chrome.runtime.onInstalled.addListener(()=>{g()});chrome.runtime.onStartup.addListener(()=>{g()});chrome.tabs.onActivated.addListener(()=>{g()});chrome.windows.onFocusChanged.addListener(()=>{g()});chrome.tabs.onUpdated.addListener((e,n,t)=>{!("status"in n)&&!("url"in n)||N(t)});g();chrome.action.onClicked.addListener(e=>{!e?.id||!w(e)||(p.log("Action button clicked, sending message to tab:",{tabId:e.id}),chrome.tabs.sendMessage(e.id,{type:"TOGGLE_WIDGET"},()=>{chrome.runtime.lastError?p.error("Error sending message to tab:",chrome.runtime.lastError):p.log("Message successfully sent to toggle widget.")}))});chrome.runtime.onMessage.addListener((e,n,t)=>{if(e?.type===R)return(async()=>{try{const o=await q(e?.payload||{});t({ok:!0,data:o})}catch(o){p.error("Failed to fetch professor rating",{sender:n?.tab?.id||"unknown",error:String(o)}),t({ok:!1,error:o?.message||"Failed to fetch professor rating"})}})(),!0});
//# sourceMappingURL=background.js.map
