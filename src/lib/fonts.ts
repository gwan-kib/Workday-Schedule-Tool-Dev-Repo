const MATERIAL_SYMBOLS_ID = "wst-material-symbols";
const MATERIAL_SYMBOLS_HREF =
  "https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200";

export function ensureMaterialSymbolsFont(targetDocument: Document = document): void {
  if (targetDocument.getElementById(MATERIAL_SYMBOLS_ID)) return;

  const link = targetDocument.createElement("link");
  link.id = MATERIAL_SYMBOLS_ID;
  link.rel = "stylesheet";
  link.href = MATERIAL_SYMBOLS_HREF;
  targetDocument.head.appendChild(link);
}
