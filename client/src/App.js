import React, { useState, useEffect, useCallback } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import Login from './components/Login';
import Register from './components/Register';
import Phonebook from './components/Phonebook';

function App() {
  const [authStatus, setAuthStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const checkAuthStatus = useCallback(async () => {
    try {
      const response = await fetch('/auth/status', {
        credentials: 'include'
      });
      const data = await response.json();
      setAuthStatus(data);
    } catch (error) {
      console.error('Auth check failed:', error);
      setAuthStatus({ authenticated: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  const handleLogout = async () => {
    try {
      await fetch('/auth/logout', {
        method: 'POST',
        credentials: 'include'
      });
      setAuthStatus({ authenticated: false });
      navigate('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const handleRegistrationComplete = (user) => {
    setAuthStatus({
      authenticated: true,
      registered: true,
      user
    });
    navigate('/phonebook');
  };

  const handleUserUpdate = (updatedUser) => {
    setAuthStatus(prev => ({
      ...prev,
      user: updatedUser
    }));
  };

  if (loading) {
    return (
      <div className="container">
        <div className="loading">Loading...</div>
      </div>
    );
  }

  return (
    <div className="container">
      <Routes>
        <Route
          path="/login"
          element={
            authStatus?.authenticated ? (
              authStatus.registered ? (
                <Navigate to="/phonebook" replace />
              ) : (
                <Navigate to="/register" replace />
              )
            ) : (
              <Login />
            )
          }
        />
        <Route
          path="/register"
          element={
            !authStatus?.authenticated ? (
              <Navigate to="/login" replace />
            ) : authStatus.registered ? (
              <Navigate to="/phonebook" replace />
            ) : (
              <Register
                googleData={authStatus.googleData}
                onComplete={handleRegistrationComplete}
              />
            )
          }
        />
        <Route
          path="/phonebook"
          element={
            !authStatus?.authenticated ? (
              <Navigate to="/login" replace />
            ) : !authStatus.registered ? (
              <Navigate to="/register" replace />
            ) : (
              <Phonebook user={authStatus.user} onLogout={handleLogout} onUserUpdate={handleUserUpdate} />
            )
          }
        />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </div>
  );
}

export default App;
