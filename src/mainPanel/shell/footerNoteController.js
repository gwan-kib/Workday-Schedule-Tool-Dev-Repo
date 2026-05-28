const DEFAULT_TEMPORARY_DURATION_MS = 3000;
const DEFAULT_MAX_TEMPORARY_NOTES = 3;
const DEFAULT_MAX_VISIBLE_PERSISTENT_NOTES = 3;

let nextFooterNoteId = 0;

const createFooterNoteId = (prefix) => {
  nextFooterNoteId += 1;
  return `${prefix}-${nextFooterNoteId}`;
};

function normalizeNoteText(text) {
  return String(text || "").trim();
}

function clearNoteTimer(note) {
  if (!note?.timeoutId) return;
  clearTimeout(note.timeoutId);
  note.timeoutId = 0;
}

// Maintains independent temporary and persistent footer-note stacks. Input: root element. Output: controller API.
export function createFooterNoteController(
  root,
  {
    maxTemporaryNotes = DEFAULT_MAX_TEMPORARY_NOTES,
    maxVisiblePersistentNotes = DEFAULT_MAX_VISIBLE_PERSISTENT_NOTES,
  } = {},
) {
  const temporaryNotes = [];
  const persistentNotes = [];
  const hiddenPersistentNoteIds = new Set();

  if (root) {
    root.classList.add("footer-note-stack");
    root.classList.remove("footer-alert");
    root.textContent = "";
    root.removeAttribute("data-tone");
  }

  const render = () => {
    if (!root) return;

    root.innerHTML = "";

    const visiblePersistentCount = Number.isFinite(maxVisiblePersistentNotes)
      ? Math.max(0, maxVisiblePersistentNotes)
      : persistentNotes.length;
    const visiblePersistentNotes = persistentNotes
      .filter((note) => !hiddenPersistentNoteIds.has(note.id))
      .slice(0, visiblePersistentCount);
    const hiddenPersistentCount = Math.max(0, persistentNotes.length - visiblePersistentNotes.length);
    const visibleNotes = [...temporaryNotes, ...visiblePersistentNotes];

    const visibleStack = hiddenPersistentCount > 0 ? document.createElement("div") : root;
    if (hiddenPersistentCount > 0) {
      visibleStack.className = "footer-note-stack__visible";
      root.appendChild(visibleStack);
    }

    visibleNotes.forEach((note) => {
      const item = document.createElement("div");
      item.className = "footer-note";
      item.dataset.kind = note.kind;
      item.dataset.tone = note.tone;

      const text = document.createElement("span");
      text.className = "footer-note__text";
      text.textContent = note.text;
      item.appendChild(text);

      if (note.kind === "persistent") {
        const dismissButton = document.createElement("button");
        dismissButton.className = "footer-note__dismiss";
        dismissButton.type = "button";
        dismissButton.setAttribute("aria-label", "Dismiss footer note");
        dismissButton.addEventListener("click", () => hidePersistent(note.id));

        const icon = document.createElement("span");
        icon.className = "material-symbols-rounded";
        icon.setAttribute("aria-hidden", "true");
        icon.textContent = "close";

        dismissButton.appendChild(icon);
        item.appendChild(dismissButton);
      }

      visibleStack.appendChild(item);
    });

    if (hiddenPersistentCount > 0) {
      const overflow = document.createElement("details");
      overflow.className = "footer-note-overflow";

      const summary = document.createElement("summary");
      summary.className = "footer-note-overflow__summary wd-hover-tooltip";
      summary.dataset.tooltip = "All footer notes";
      summary.setAttribute("aria-label", "All footer notes");

      const icon = document.createElement("span");
      icon.className = "material-symbols-rounded";
      icon.textContent = "menu";
      summary.appendChild(icon);
      overflow.appendChild(summary);

      const menu = document.createElement("div");
      menu.className = "footer-note-overflow__menu";

      persistentNotes.forEach((note) => {
        const item = document.createElement("div");
        item.className = "footer-note-overflow__item";
        item.dataset.tone = note.tone;
        item.textContent = note.text;
        menu.appendChild(item);
      });

      overflow.appendChild(menu);
      root.appendChild(overflow);
    }

    root.classList.toggle("is-hidden", temporaryNotes.length + persistentNotes.length === 0);
    root.classList.toggle("has-overflow", hiddenPersistentCount > 0);
  };

  const removeTemporary = (id) => {
    const index = temporaryNotes.findIndex((note) => note.id === id);
    if (index === -1) return;

    const [removed] = temporaryNotes.splice(index, 1);
    clearNoteTimer(removed);
    render();
  };

  const showTemporary = (text, { tone = "info", durationMs = DEFAULT_TEMPORARY_DURATION_MS, id = null } = {}) => {
    const normalizedText = normalizeNoteText(text);
    if (!normalizedText) return null;

    const noteId = id || createFooterNoteId("temporary-footer-note");
    let note = temporaryNotes.find((existing) => existing.id === noteId);

    if (note) {
      clearNoteTimer(note);
      note.text = normalizedText;
      note.tone = tone;
      temporaryNotes.splice(temporaryNotes.indexOf(note), 1);
      temporaryNotes.unshift(note);
    } else {
      note = {
        id: noteId,
        kind: "temporary",
        text: normalizedText,
        tone,
        timeoutId: 0,
      };
      temporaryNotes.unshift(note);
    }

    while (temporaryNotes.length > maxTemporaryNotes) {
      const removed = temporaryNotes.pop();
      clearNoteTimer(removed);
    }

    if (durationMs > 0) {
      note.timeoutId = setTimeout(() => removeTemporary(noteId), durationMs);
    }

    render();
    return noteId;
  };

  const removePersistent = (id) => {
    const index = persistentNotes.findIndex((note) => note.id === id);
    if (index === -1) return;

    persistentNotes.splice(index, 1);
    hiddenPersistentNoteIds.delete(id);
    render();
  };

  const hidePersistent = (id) => {
    if (!persistentNotes.some((note) => note.id === id)) return;

    hiddenPersistentNoteIds.add(id);
    render();
  };

  const resetPersistentVisibility = () => {
    if (hiddenPersistentNoteIds.size === 0) return;

    hiddenPersistentNoteIds.clear();
    render();
  };

  const setPersistent = (id, text, { tone = "warn" } = {}) => {
    const normalizedText = normalizeNoteText(text);
    if (!id || !normalizedText) {
      if (id) removePersistent(id);
      return null;
    }

    let note = persistentNotes.find((existing) => existing.id === id);
    if (note) {
      note.text = normalizedText;
      note.tone = tone;
    } else {
      note = {
        id,
        kind: "persistent",
        text: normalizedText,
        tone,
      };
      persistentNotes.unshift(note);
    }

    render();
    return id;
  };

  render();

  return {
    showTemporary,
    removeTemporary,
    setPersistent,
    removePersistent,
    resetPersistentVisibility,
  };
}
