import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Dashboard } from "./pages/Dashboard";
import { Analysis } from "./pages/Analysis";
import { Coach } from "./pages/Coach";
import { Training } from "./pages/Training";
import { OpponentScout } from "./pages/OpponentScout";
import { SettingsPage } from "./pages/Settings";

function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "") || undefined}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/analysis" element={<Analysis />} />
          <Route path="/coach" element={<Coach />} />
          <Route path="/training" element={<Training />} />
          <Route path="/scout" element={<OpponentScout />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
