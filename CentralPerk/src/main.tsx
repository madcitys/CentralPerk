import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { router } from "./app/routes";
import "./styles/index.css";

const rootElement = document.getElementById("root")!;
const root = createRoot(rootElement);

root.render(<RouterProvider router={router} />);
