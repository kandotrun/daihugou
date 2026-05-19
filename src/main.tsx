import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { App } from "./ui/App";
import "./ui/styles.css";

const router = createBrowserRouter([
  { path: "/", element: <App /> },
  { path: "/rooms/:roomId", element: <App /> },
]);

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
