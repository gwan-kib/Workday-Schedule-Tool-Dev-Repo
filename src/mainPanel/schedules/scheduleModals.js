import { on } from "../../utilities/dom.js";
import { debugFor, debugLog } from "../../utilities/debugTool.js";

const debug = debugFor("scheduleModals");
debugLog({ local: { scheduleModals: false } });

// Creates the save/delete schedule modal controller. Input: ui object. Output: controller object.
export function createScheduleModalController(ui) {
  debug.log({ id: "createScheduleModalController.start" }, "Initializing schedule modal controller");
  let resolveScheduleModal = null;
  let choiceSelect = null;
  let validateModalInput = null;
  const inputError = ui.saveModalField.querySelector(".schedule-modal-error");
  const setInputError = (message) => {
    ui.saveModalInput.classList.toggle("is-invalid", Boolean(message));
    ui.saveModalInput.setAttribute("aria-invalid", String(Boolean(message)));
    if (inputError) inputError.textContent = message || "";
  };

  const closeScheduleModal = (value) => {
    if (!ui.saveModal) return;
    debug.log({ id: "createScheduleModalController.close" }, "Closing schedule modal", { value });

    ui.saveModal.classList.add("is-hidden");
    ui.saveModal.setAttribute("aria-hidden", "true");

    if (resolveScheduleModal) {
      resolveScheduleModal(value);
      resolveScheduleModal = null;
    }
  };

  const openScheduleModal = ({
    title,
    message,
    confirmLabel = "Save",
    showInput = true,
    showCancel = true,
    inputLabel = "Schedule name",
    inputPlaceholder = "e.g. Fall semester plan",
    inputValue = "",
    choices = null,
    validateInput = null,
  }) => {
    if (!ui.saveModal) return Promise.resolve(null);
    if (resolveScheduleModal) closeScheduleModal(null);
    validateModalInput = validateInput;
    choiceSelect?.remove();
    choiceSelect = null;
    if (choices?.length) {
      choiceSelect = document.createElement("select");
      choiceSelect.setAttribute("aria-label", "Calendar plan handling");
      choices.forEach(({ value, label }) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        choiceSelect.appendChild(option);
      });
      ui.saveModalMessage.after(choiceSelect);
    }
    debug.log({ id: "createScheduleModalController.open" }, "Opening schedule modal", {
      title,
      showInput,
      showCancel,
      confirmLabel,
    });

    ui.saveModalTitle.textContent = title;
    ui.saveModalMessage.textContent = message;
    ui.saveModalConfirm.textContent = confirmLabel;
    ui.saveModalField.querySelector(".schedule-modal-label").textContent = inputLabel;
    ui.saveModalInput.placeholder = inputPlaceholder;

    ui.saveModalField.classList.toggle("is-hidden", !showInput);
    ui.saveModalCancel.classList.toggle("is-hidden", !showCancel);

    ui.saveModalInput.value = inputValue;
    setInputError(null);

    ui.saveModal.classList.remove("is-hidden");
    ui.saveModal.setAttribute("aria-hidden", "false");

    if (showInput) {
      ui.saveModalInput.focus();
      ui.saveModalInput.select();
    } else {
      ui.saveModalConfirm.focus();
    }

    return new Promise((resolve) => {
      resolveScheduleModal = resolve;
    });
  };

  if (ui.saveModal) {
    on(ui.saveModal, "click", (event) => {
      if (event.target === ui.saveModal) return closeScheduleModal(null);

      const action = event.target.closest("[data-action]")?.dataset.action;
      if (!action) return;

      if (action === "close" || action === "cancel") return closeScheduleModal(null);

      if (action === "confirm") {
        debug.log({ id: "createScheduleModalController.confirm" }, "Confirm clicked in schedule modal");
        const needsInput = !ui.saveModalField.classList.contains("is-hidden");
        if (needsInput) {
          const value = ui.saveModalInput.value.trim();
          const error = !value ? "This field cannot be empty." : validateModalInput?.(value);
          if (error) {
            setInputError(error);
            ui.saveModalInput.focus();
            return;
          }
          return closeScheduleModal(value);
        }
        return closeScheduleModal(choiceSelect ? choiceSelect.value : true);
      }
    });

    on(ui.saveModalInput, "input", () => setInputError(null));
    on(ui.saveModalInput, "keydown", (event) => {
      if (event.key === "Enter") ui.saveModalConfirm.click();
    });

    on(document, "keydown", (event) => {
      if (event.key === "Escape" && !ui.saveModal.classList.contains("is-hidden")) closeScheduleModal(null);
    });
  }

  return {
    closeScheduleModal,
    openScheduleModal,
  };
}
