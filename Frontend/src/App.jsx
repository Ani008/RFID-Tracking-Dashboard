import { BrowserRouter, Routes, Route } from 'react-router-dom';
import AppLayout from './layouts/AppLayout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import CaseFiles from './pages/CaseFiles.jsx';
import RegisterFile from './pages/RegisterFile.jsx';
import MovementLog from './pages/MovementLog.jsx';
import CourtRoomStatus from './pages/CourtRoomStatus.jsx';
import Gates from './pages/Gates.jsx';
import ReaderSimulator from './pages/ReaderSimulator.jsx';
import ComingSoon from './pages/ComingSoon.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="/files" element={<CaseFiles />} />
          <Route path="/register" element={<RegisterFile />} />
          <Route path="/court-room-status" element={<CourtRoomStatus />} />
          <Route path="/movements" element={<MovementLog />} />
          <Route path="/gates" element={<Gates />} />
          <Route path="/simulator" element={<ReaderSimulator />} />
          <Route
            path="/settings"
            element={<ComingSoon title="Settings" subtitle="Auth and role-based access — planned, not yet built" />}
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
