import { DAYS, stableId } from "./meetings.js";
import { validatePersonalBlocks } from "./personalBlocks.js";
import { storageGet, storageSet } from "../utilities/storage.js";
export const PERSONAL_BLOCK_LIBRARY_KEY = "wdPersonalBlockLibrary";
export const MAX_REUSABLE_BLOCKS = 500;
export function blockSignature(block) {
  const [valid] = validatePersonalBlocks([block]);
  const { id, ...content } = valid;
  content.days.sort((a,b)=>DAYS.indexOf(a)-DAYS.indexOf(b));
  content.exceptions.sort();
  return JSON.stringify(content);
}
export function normalizeBlockLibrary(blocks) {
  if (!Array.isArray(blocks) || blocks.length > MAX_REUSABLE_BLOCKS)
    throw new Error("Saved personal blocks are invalid or exceed the 500-block limit.");
  const seen = new Set();
  return blocks.flatMap(block => {
    const signature = blockSignature(block);
    if (seen.has(signature)) return [];
    seen.add(signature);
    const [valid] = validatePersonalBlocks([block]);
    return [{ ...valid, id: stableId(signature) }];
  });
}
export async function loadReusableBlocks(seed = []) {
  const stored = await storageGet([PERSONAL_BLOCK_LIBRARY_KEY]);
  if (stored[PERSONAL_BLOCK_LIBRARY_KEY] !== undefined)
    return normalizeBlockLibrary(stored[PERSONAL_BLOCK_LIBRARY_KEY]);
  // One-time migration keeps blocks created by the earlier Phase 4 build.
  const migrated = normalizeBlockLibrary(seed);
  await storageSet({ [PERSONAL_BLOCK_LIBRARY_KEY]: migrated });
  return migrated;
}
export async function rememberReusableBlock(block, seed = []) {
  const library = await loadReusableBlocks(seed);
  const signature = blockSignature(block);
  if (library.some(b => blockSignature(b) === signature)) return library;
  if (library.length >= MAX_REUSABLE_BLOCKS)
    throw new Error("Saved personal blocks is full. Remove a saved block before creating another.");
  const next = normalizeBlockLibrary([...library, block]);
  await storageSet({ [PERSONAL_BLOCK_LIBRARY_KEY]: next });
  return next;
}
export async function forgetReusableBlock(id) {
  const library = await loadReusableBlocks();
  const next = library.filter(b => b.id !== id);
  await storageSet({ [PERSONAL_BLOCK_LIBRARY_KEY]: next });
  return next;
}

// Replace one reusable template only. Plan instances remain independent copies.
export async function replaceReusableBlock(original, replacement) {
  const library = await loadReusableBlocks();
  const stored = library.find(block => block.id === original.id);
  if (!stored || blockSignature(stored) !== blockSignature(original))
    throw new Error("This saved block changed or was removed in another window. Cancel and reopen it before editing.");
  const next = normalizeBlockLibrary(library.map(block => block.id === original.id ? replacement : block));
  await storageSet({ [PERSONAL_BLOCK_LIBRARY_KEY]: next });
  return next;
}
