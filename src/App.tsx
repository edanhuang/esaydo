import { useState } from "react";
import { BoardPage } from "./pages/BoardPage";
import { WeeklyPage } from "./pages/WeeklyPage";
import type { AppView } from "./types";

export default function App() {
  const [view, setView] = useState<AppView>("board");

  if (view === "weekly") {
    return <WeeklyPage onNavigate={setView} />;
  }

  return <BoardPage onNavigate={setView} />;
}
