import { createRoot } from "react-dom/client";
import { createShadowRootUi } from "wxt/utils/content-script-ui/shadow-root";
import { defineContentScript } from "wxt/utils/define-content-script";

import averageButtonColorsCss from "../src/css/colors/average-grade-button-colors.css?inline";
import averageTooltipColorsCss from "../src/css/colors/average-grade-tooltip-colors.css?inline";
import averageButtonCss from "../src/css/formatting/average-grade-button.css?inline";
import averageTooltipCss from "../src/css/formatting/average-grade-tooltip.css?inline";
import { ContentApp } from "../src/components/content/ContentApp";
import "../src/styles/content-ui.css";

function injectPageStyles(id: string, cssText: string): void {
  if (document.getElementById(id)) return;

  const style = document.createElement("style");
  style.id = id;
  style.textContent = cssText;
  document.head.appendChild(style);
}

export default defineContentScript({
  matches: ["https://*.myworkday.com/*"],
  runAt: "document_idle",
  allFrames: true,
  cssInjectionMode: "ui",

  async main(ctx) {
    injectPageStyles(
      "wst-page-average-styles",
      [averageButtonCss, averageButtonColorsCss, averageTooltipCss, averageTooltipColorsCss].join("\n"),
    );

    const ui = await createShadowRootUi(ctx, {
      name: "ubc-workday-schedule-tool",
      position: "inline",
      anchor: "body",
      isolateEvents: true,
      onMount(container) {
        const root = createRoot(container);
        root.render(<ContentApp />);
        return root;
      },
      onRemove(root) {
        root?.unmount();
      },
    });

    ui.mount();
  },
});
