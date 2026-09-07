import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import AppLayout from './layouts/AppLayout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import CaseFiles from './pages/CaseFiles.jsx';
import RegisterFile from './pages/RegisterFile.jsx';
import MovementLog from './pages/MovementLog.jsx';
import CourtRoomStatus from './pages/CourtRoomStatus.jsx';
import Gates from './pages/Gates.jsx';
import ReaderSimulator from './pages/ReaderSimulator.jsx';
import Users from './pages/Users.jsx';
import Reports from './pages/Reports.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public Login Route */}
          <Route path="/login" element={<Login />} />

          {/* Protected Application Routes */}
          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="/files" element={<CaseFiles />} />
            <Route
              path="/register"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <RegisterFile />
                </ProtectedRoute>
              }
            />
            <Route path="/court-room-status" element={<CourtRoomStatus />} />
            <Route path="/movements" element={<MovementLog />} />
            <Route path="/gates" element={<Gates />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/simulator" element={<ReaderSimulator />} />
            <Route
              path="/users"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <Users />
                </ProtectedRoute>
              }
            />
          </Route>

          {/* Catch-all fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
