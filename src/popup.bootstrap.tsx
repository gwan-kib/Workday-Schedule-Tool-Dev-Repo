import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { PopupApp } from "./components/popup/PopupApp";
import "./popup.css";

const container = document.getElementById("root");

if (container) {
  createRoot(container).render(
    <StrictMode>
      <PopupApp />
    </StrictMode>,
  );
}
