import { on } from "../../utilities/dom.js";
import { debugFor, debugLog } from "../../utilities/debugTool.js";

const debug = debugFor("scheduleModals");
debugLog({ local: { scheduleModals: false } });

// Creates the save/delete schedule modal controller. Input: ui object. Output: controller object.
export function createScheduleModalController(ui) {
  debug.log({ id: "createScheduleModalController.start" }, "Initializing schedule modal controller");
  let resolveScheduleModal = null;
  let resolveScheduleModalWithCheckbox = false;

  const closeScheduleModal = (value) => {
    if (!ui.saveModal) return;
    debug.log({ id: "createScheduleModalController.close" }, "Closing schedule modal", { value });

    ui.saveModal.classList.add("is-hidden");
    ui.saveModal.setAttribute("aria-hidden", "true");

    if (resolveScheduleModal) {
      resolveScheduleModal(value);
      resolveScheduleModal = null;
      resolveScheduleModalWithCheckbox = false;
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
    showCheckbox = false,
    checkboxLabel = "Do not show this again.",
    checkboxChecked = false,
    checkboxOptions = [],
    resolveCheckbox = false,
  }) => {
    if (!ui.saveModal) return Promise.resolve(null);
    resolveScheduleModalWithCheckbox = Boolean(resolveCheckbox);
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
    if (ui.saveModalCheckboxLabel) ui.saveModalCheckboxLabel.textContent = checkboxLabel;
    if (ui.saveModalCheckboxList) {
      ui.saveModalCheckboxList.innerHTML = "";
      checkboxOptions.forEach((option) => {
        const label = document.createElement("label");
        label.className = "schedule-modal-checkbox-field";

        const input = document.createElement("input");
        input.className = "schedule-modal-checkbox";
        input.type = "checkbox";
        input.value = option.value;
        input.checked = option.checked !== false;

        const text = document.createElement("span");
        text.textContent = option.label;

        label.appendChild(input);
        label.appendChild(text);
        ui.saveModalCheckboxList.appendChild(label);
      });
    }

    ui.saveModalField.classList.toggle("is-hidden", !showInput);
    ui.saveModalCheckboxField?.classList.toggle("is-hidden", !showCheckbox);
    ui.saveModalCheckboxList?.classList.toggle("is-hidden", !checkboxOptions.length);
    ui.saveModalCancel.classList.toggle("is-hidden", !showCancel);

    ui.saveModalInput.value = inputValue;
    ui.saveModalInput.classList.remove("is-invalid");
    if (ui.saveModalCheckbox) ui.saveModalCheckbox.checked = Boolean(checkboxChecked);

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
        const checkboxResult = {
          confirmed: true,
          checked: Boolean(ui.saveModalCheckbox?.checked),
          selectedValues: Array.from(ui.saveModalCheckboxList?.querySelectorAll("input:checked") || []).map(
            (input) => input.value,
          ),
        };
        if (needsInput) {
          const value = ui.saveModalInput.value.trim();
          if (!value) {
            debug.warn({ id: "createScheduleModalController.validation" }, "Schedule modal input was empty");
            ui.saveModalInput.classList.add("is-invalid");
            ui.saveModalInput.focus();
            return;
          }
          if (resolveScheduleModalWithCheckbox) return closeScheduleModal({ ...checkboxResult, value });
          return closeScheduleModal(value);
        }
        if (resolveScheduleModalWithCheckbox) return closeScheduleModal(checkboxResult);
        return closeScheduleModal(true);
      }
    });

    on(ui.saveModalInput, "input", () => ui.saveModalInput.classList.remove("is-invalid"));
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
