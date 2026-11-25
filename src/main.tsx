import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import ErrorBoundary from "./ErrorBoundary";
import "./styles.css";

const mountPoint = document.getElementById("solar-studio-root") || document.getElementById("root");

if (mountPoint) {
  ReactDOM.createRoot(mountPoint).render(
    <React.StrictMode>
      <ErrorBoundary fallbackTitle="Terjadi Kendala Memuat Solar Studio">
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
} else {
  console.warn("Solar Studio mount point (#solar-studio-root or #root) not found.");
}
