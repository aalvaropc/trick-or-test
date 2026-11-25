import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./fonts/fonts";
import "./styles/tokens.css";
import "./styles/base.css";

function Placeholder() {
  return <p>Trick or Test</p>;
}

const container = document.getElementById("root");
if (container === null) {
  throw new Error("Missing #root element");
}

createRoot(container).render(
  <StrictMode>
    <Placeholder />
  </StrictMode>,
);
