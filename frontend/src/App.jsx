import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './routes/ProtectedRoute';
import { useAuth } from './hooks/useAuth';
import LoadingSpinner from './components/UI/LoadingSpinner';

// Pages
import Login from './pages/Login';
import WaitingRoom from './pages/student/WaitingRoom';
import ExamSession from './pages/student/ExamSession';
import ExamCompleted from './pages/student/ExamCompleted';
import Dashboard from './pages/invigilator/Dashboard';
import StudentDetail from './pages/invigilator/StudentDetail';
import Exams from './pages/invigilator/Exams';
import Users from './pages/invigilator/Users';
import Reports from './pages/invigilator/Reports';
import ReportsView from './pages/invigilator/ReportsView';

const RootRedirect = () => {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <LoadingSpinner />;

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role === 'student') return <Navigate to="/student/waiting-room" replace />;
  return <Navigate to="/invigilator/dashboard" replace />;
};

import { Toaster } from 'react-hot-toast';

function App() {
  return (
    <AuthProvider>
      <Toaster 
        position="top-center"
        toastOptions={{
          style: {
            background: '#0f1629',
            color: '#f1f5f9',
            border: '1px solid #1e2d4a',
            fontFamily: 'monospace',
            fontSize: '13px',
            letterSpacing: '0.05em'
          },
          success: {
             iconTheme: { primary: '#10b981', secondary: '#0f1629' },
             style: { borderLeft: '3px solid #10b981' }
          },
          error: {
             iconTheme: { primary: '#ef4444', secondary: '#0f1629' },
             style: { borderLeft: '3px solid #ef4444' }
          }
        }}
      />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<Login />} />

          {/* Student routes */}
            <Route path="/student/waiting-room" element={<ProtectedRoute allowedRoles={['student']}><WaitingRoom /></ProtectedRoute>} />
            <Route path="/student/exam" element={<ProtectedRoute allowedRoles={['student']}><ExamSession /></ProtectedRoute>} />
            <Route path="/student/exam-completed" element={<ProtectedRoute allowedRoles={['student']}><ExamCompleted /></ProtectedRoute>} />

          {/* Invigilator routes */}
          <Route path="/invigilator/dashboard" element={<ProtectedRoute allowedRoles={['invigilator']}><Dashboard /></ProtectedRoute>} />
          <Route path="/invigilator/student/:id" element={<ProtectedRoute allowedRoles={['invigilator']}><StudentDetail /></ProtectedRoute>} />
          <Route path="/invigilator/reports" element={<ProtectedRoute allowedRoles={['invigilator']}><Reports /></ProtectedRoute>} />
          <Route path="/invigilator/reports/view" element={<ProtectedRoute allowedRoles={['invigilator']}><ReportsView /></ProtectedRoute>} />
          <Route path="/invigilator/exams" element={<ProtectedRoute allowedRoles={['invigilator']}><Exams /></ProtectedRoute>} />
          <Route path="/invigilator/users" element={<ProtectedRoute allowedRoles={['invigilator']}><Users /></ProtectedRoute>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
