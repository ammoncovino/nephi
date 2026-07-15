import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

// No StrictMode: the effects own imperative WebGL/rAF loops with a single
// lifecycle; double-invoking them in dev would spin up two render loops.
createRoot(document.getElementById("root")).render(<App />);
