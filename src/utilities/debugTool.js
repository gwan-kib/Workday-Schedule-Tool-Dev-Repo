// Opt-in, session-only diagnostics. Never log payloads, strings, URLs or errors.
const logConfiguration = { global: false, local: {}, log: {} };
const events=[];
const tag=value=>/^[a-z0-9_.-]{1,100}$/i.test(String(value||""))?String(value):"unspecified";
export const debugLog=({global,local,log}={})=>{
  if(typeof global==="boolean") logConfiguration.global=global;
  for(const [name,values] of [["local",local],["log",log]])
    for(const [key,value] of Object.entries(values||{})) if(typeof value==="boolean") logConfiguration[name][key]=value;
};
export const getLogConfiguration=()=>structuredClone(logConfiguration);
export function enableDiagnostics(enabled) {
  logConfiguration.global=Boolean(enabled);
  if(!enabled) events.length=0;
}
export function diagnosticSummary() {
  return { format:"wst-redacted-diagnostics",version:1,extensionVersion:globalThis.chrome?.runtime?.getManifest?.().version||"development",enabled:logConfiguration.global,events:events.map(e=>({...e})) };
}
export function debugFor(scope) {
  const emit=level=>(meta,..._discarded)=>{
    if(!logConfiguration.global || meta?.on===false) return;
    const event={scope:tag(scope),event:tag(meta?.id),level};
    events.push(event); if(events.length>100) events.shift();
    if(logConfiguration.local[scope]!==false && logConfiguration.log[meta?.id]!==false) console.log("[WST diagnostics]",event);
  };
  return {log:emit("info"),warn:emit("warning"),error:emit("error"),on:()=>debugLog({local:{[scope]:true}}),off:()=>debugLog({local:{[scope]:false}})};
}
