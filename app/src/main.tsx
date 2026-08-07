import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/noto-sans-tc";
import "react-circular-progressbar/dist/styles.css";
import { App } from "./App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
