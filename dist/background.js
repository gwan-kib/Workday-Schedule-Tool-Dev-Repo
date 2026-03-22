const u={global:!0,local:{},log:{}},p=({global:e,local:n,log:o}={})=>{if(typeof e=="boolean"&&(u.global=e),n&&typeof n=="object")for(const[t,s]of Object.entries(n))typeof s=="boolean"&&(u.local[t]=s);if(o&&typeof o=="object")for(const[t,s]of Object.entries(o))typeof s=="boolean"&&(u.log[t]=s)},y=(e,n)=>!(!u.global||e&&u.local[e]===!1||n&&u.log[n]===!1),S=e=>{const n=e?`[UBC Workday - Schedule Tool (file: ${e})]
`:`[UBC Workday - Schedule Tool]
`;return{log:(r,...c)=>{let a=null,i=null;r&&typeof r=="object"&&!Array.isArray(r)?(a=r,i=c):(a=null,i=[r,...c]);const d=a?.id,h=a?.on===!0;a?.on!==!1&&(!h&&!y(e,d)||console.log(n,...i))},warn:(r,...c)=>{let a=null,i=null;r&&typeof r=="object"&&!Array.isArray(r)?(a=r,i=c):i=[r,...c];const d=a?.id,h=a?.on===!0;a?.on!==!1&&(!h&&!y(e,d)||console.log("⚠️",n,...i))},error:(r,...c)=>{let a=null,i=null;r&&typeof r=="object"&&!Array.isArray(r)?(a=r,i=c):i=[r,...c];const d=a?.id,h=a?.on===!0;a?.on!==!1&&(!h&&!y(e,d)||console.log("🚩",n,...i))},on:()=>p({local:{[e]:!0}}),off:()=>p({local:{[e]:!1}})}},T=S("rmpApi");p({local:{rmpApi:!1}});const b="https://www.ratemyprofessors.com",N="https://www.ratemyprofessors.com/graphql",w="dGVzdDp0ZXN0",k="FETCH_RMP_RATING",A="U2Nob29sLTE0MTM=",I="U2Nob29sLTU0MzY=",R=/^(dr|prof|professor|mr|mrs|ms)\.?\s+/i,L=/\s(?:and|&)\s|\/|;|\|/i,C=new Map;function m(e){return String(e||"").replace(/\s+/g," ").trim()}function U(e){return m(e).replace(/\([^)]*\)/g," ").replace(R,"").replace(/,$/,"").trim()}function P(e){const n=U(e);if(!n)return null;const o=n.toUpperCase();if(o==="N/A"||o==="TBA"||o==="STAFF"||L.test(n))return null;let t=n;if(n.includes(",")){const r=n.split(",").map(c=>m(c)).filter(Boolean);if(r.length!==2)return null;t=`${r[1]} ${r[0]}`}const s=t.split(" ").map(r=>r.trim()).filter(Boolean);if(s.length<2)return null;const f=s[0],l=s[s.length-1];return{fullName:s.join(" "),firstName:f,lastName:l}}function B(e){return String(e).toUpperCase()==="UBCO"?I:A}function $(e,n){return{query:`query TeacherSearchResultsPageQuery(
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
`,variables:{query:{text:e,schoolID:n,fallback:!1,departmentID:null},schoolID:n,includeSchoolFilter:!0}}}function E(e,n){const o=e?.data?.search?.teachers?.edges;if(!Array.isArray(o)||!o.length)return null;const t=String(n?.firstName||"").toLowerCase(),s=String(n?.lastName||"").toLowerCase();for(const f of o){const l=f?.node;if(!l||l.avgRating===0)continue;const r=m(l.firstName).toLowerCase(),c=m(l.lastName).toLowerCase();if(r.startsWith(t)&&c.endsWith(s))return{rating:l.avgRating,link:`${b}/professor/${l.legacyId}`}}return null}async function F({profName:e,campus:n}={}){const o=P(e);if(!o)return null;const t=String(n||"").toUpperCase()==="UBCO"?"UBCO":"UBCV",s=B(t),f=`${t}|${o.fullName.toUpperCase()}`;if(C.has(f))return C.get(f);T.log({id:"queryProfRating.request"},"Fetching professor rating",{profName:o.fullName,campus:t});const l=await fetch(N,{method:"POST",headers:{Authorization:`Basic ${w}`,"Content-Type":"application/json"},body:JSON.stringify($(o.fullName,s))});if(!l.ok){const a=new Error(`RateMyProfessors request failed (${l.status})`);throw a.status=l.status,a}const r=await l.json(),c=E(r,o);return C.set(f,c),T.log({id:"queryProfRating.response"},"Resolved professor rating",{profName:o.fullName,campus:t,result:c}),c}const g=S("background");p({local:{background:!1}});chrome.action.onClicked.addListener(e=>{e?.id&&(g.log("Action button clicked, sending message to tab:",{tabId:e.id}),chrome.tabs.sendMessage(e.id,{type:"TOGGLE_WIDGET"},()=>{chrome.runtime.lastError?g.error("Error sending message to tab:",chrome.runtime.lastError):g.log("Message successfully sent to toggle widget.")}))});chrome.runtime.onMessage.addListener((e,n,o)=>{if(e?.type===k)return(async()=>{try{const t=await F(e?.payload||{});o({ok:!0,data:t})}catch(t){g.error("Failed to fetch professor rating",{sender:n?.tab?.id||"unknown",error:String(t)}),o({ok:!1,error:t?.message||"Failed to fetch professor rating"})}})(),!0});
//# sourceMappingURL=background.js.map
