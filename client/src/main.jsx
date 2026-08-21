// client/src/main.jsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { startSessionSocket } from "./services/sessionSocket";

// Connect the socket from the rehydrated session, not only from login().
startSessionSocket();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
