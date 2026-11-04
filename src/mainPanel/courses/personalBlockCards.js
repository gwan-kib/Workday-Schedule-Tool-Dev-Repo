import { node } from "../schedules/plannerOverview.js";
export function renderPersonalBlockCards(ui, blocks, { query="", onEdit, onRemove } = {}) {
  ui.tableBody.querySelector(".personal-block-section")?.remove();
  const term=String(query).trim().toLowerCase();
  const visible=blocks.filter(b=>!term || [b.title,b.category,b.days.join(" ")].join(" ").toLowerCase().includes(term));
  if(!visible.length) return;
  if(!ui.tableBody.querySelector(".course-card")) ui.tableBody.querySelector(".course-list-empty")?.remove();
  const section=node("section",null,"personal-block-section");section.append(node("h3","Personal blocks"));
  const list=node("div",null,"personal-block-list");
  const clock=n=>`${String(Math.floor(n/60)).padStart(2,"0")}:${String(n%60).padStart(2,"0")}`;
  for(const b of visible) {
    const conflict=ui.conflictPartnersByCode?.get(b.title.trim().replace(/\s+/g," ").toUpperCase())||[];
    const card=node("article",null,"personal-block-card course-personal-block");card.dataset.blockId=b.id;card.style.setProperty("--personal-color",b.color);card.classList.toggle("has-conflict",conflict.length>0);
    card.append(node("strong",`${conflict.length?"! ":""}${b.title} · Personal block`));
    card.append(node("p",`${b.days.join(", ")} · ${clock(b.startMinutes)}–${clock(b.endMinutes)} · ${b.startDate} to ${b.endDate}${b.category?` · ${b.category}`:""}`));
    if(conflict.length) card.append(node("p",`Clashes with: ${conflict.join(", ")}`));
    for(const [label,fn] of [["Edit",()=>onEdit?.(b.id)],["Remove",()=>onRemove?.(b.id)]]) {const button=node("button",label);button.type="button";button.addEventListener("click",fn);card.append(button);}
    list.append(card);
  }
  section.append(list);ui.tableBody.prepend(section);
}
