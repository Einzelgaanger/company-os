import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";

const root = document.getElementById("root")!;

function showBootError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  root.innerHTML = `
    <main style="min-height:100vh;display:grid;place-items:center;padding:2rem;font-family:Inter,system-ui,sans-serif;background:#0E1F1A;color:#F4F7F5">
      <div style="max-width:36rem">
        <p style="margin:0 0 .5rem;font:600 1.25rem/1.3 Instrument Sans,sans-serif">Company OS could not start</p>
        <p style="margin:0;opacity:.85;line-height:1.5;white-space:pre-wrap">${message.replace(/</g, "&lt;")}</p>
      </div>
    </main>
  `;
}

async function boot() {
  try {
    const [{ default: App }, { AuthProvider }, { ToastProvider }] =
      await Promise.all([
        import("./App"),
        import("./context/AuthContext"),
        import("./components/ui/toast"),
      ]);
    ReactDOM.createRoot(root).render(
      <React.StrictMode>
        <BrowserRouter>
          <ToastProvider>
            <AuthProvider>
              <App />
            </AuthProvider>
          </ToastProvider>
        </BrowserRouter>
      </React.StrictMode>,
    );
  } catch (err) {
    console.error(err);
    showBootError(err);
  }
}

void boot();
