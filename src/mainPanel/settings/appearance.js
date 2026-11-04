import { storageGet, storageSet } from "../../utilities/storage.js";
export function normalizeAppearance(value = {}) {
  return { theme: ["system","light","dark"].includes(value?.theme) ? value.theme : "system", density: ["comfortable","compact"].includes(value?.density) ? value.density : "comfortable" };
}
export function resolvedTheme(preference, systemDark = false) {
  return preference === "dark" || (preference === "system" && systemDark) ? "dark" : "light";
}
export async function initializeAppearance(ui, onChange = () => {}) {
  const root = ui.root || document;
  const target = root.host || document.documentElement;
  const media = globalThis.matchMedia?.("(prefers-color-scheme: dark)");
  let preference = normalizeAppearance((await storageGet(["wdAppearance"])).wdAppearance);
  const mount = root.querySelector(".settings-section--display") || root.querySelector("#popup-appearance");
  const group = document.createElement("div"); group.className="appearance-controls";
  const selects={};
  for (const [key,label,options] of [["theme","Appearance",[["system","System"],["light","Light"],["dark","Dark"]]],["density","Timetable spacing",[["comfortable","Comfortable"],["compact","Compact"]]]]) {
    const wrap=document.createElement("label"); wrap.className="planner-field";
    const text=document.createElement("span"); text.textContent=label; text.className="planner-field-label";
    const select=document.createElement("select"); select.setAttribute("aria-label",label);
    for(const [value,name] of options) { const o=document.createElement("option");o.value=value;o.textContent=name;select.append(o); }
    selects[key]=select; wrap.append(text,select); group.append(wrap);
    select.addEventListener("change",async()=>{
      const next=normalizeAppearance({...preference,[key]:select.value});
      try { await storageSet({wdAppearance:next}); preference=next; apply(); }
      catch(e) { apply(); ui.footerNotes?.showTemporary("Could not save appearance. Try again.",{tone:"warn"}); }
    });
  }
  mount?.append(group);
  function apply() {
    target.dataset.wstTheme=resolvedTheme(preference.theme,media?.matches);
    target.dataset.wstDensity=preference.density;
    for(const key of Object.keys(selects)) selects[key].value=preference[key];
    onChange();
  }
  const systemChanged=()=>{if(preference.theme==="system") apply();};
  media?.addEventListener?.("change",systemChanged);
  const storageChanged=(changes,area)=>{ if(area==="local" && changes.wdAppearance) {preference=normalizeAppearance(changes.wdAppearance.newValue);apply();} };
  globalThis.chrome?.storage?.onChanged?.addListener(storageChanged);
  apply();
  return ()=>{media?.removeEventListener?.("change",systemChanged);globalThis.chrome?.storage?.onChanged?.removeListener(storageChanged);};
}
