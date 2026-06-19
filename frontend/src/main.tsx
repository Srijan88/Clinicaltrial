import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "@fontsource-variable/inter";
import "./index.css";
import Login from "./pages/Login";
import Patients from "./pages/Patients";
import Match from "./pages/Match";
import Applications from "./pages/Applications";
import Favorites from "./pages/Favorites";
import SavedSearches from "./pages/SavedSearches";
import Notifications from "./pages/Notifications";
import PreviousRuns from "./pages/PreviousRuns";
import RunDetail from "./pages/RunDetail";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/patients" element={<Patients />} />
        <Route path="/match/:patientId" element={<Match />} />
        <Route path="/applications" element={<Applications />} />
        <Route path="/favorites" element={<Favorites />} />
        <Route path="/saved" element={<SavedSearches />} />
        <Route path="/runs" element={<PreviousRuns />} />
        <Route path="/runs/:patientId" element={<RunDetail />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
