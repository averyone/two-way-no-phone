import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Device } from '@twilio/voice-sdk';

function Phonebook({ user, onLogout, onUserUpdate }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [callStatus, setCallStatus] = useState(null);
  const [callingUserId, setCallingUserId] = useState(null);
  const [answerInApp, setAnswerInApp] = useState(user.answerInApp ?? true);
  const [deviceReady, setDeviceReady] = useState(false);
  const [incomingCall, setIncomingCall] = useState(null);
  const [activeCall, setActiveCall] = useState(null);
  const [deviceError, setDeviceError] = useState(null);

  const deviceRef = useRef(null);

  const fetchUsers = useCallback(async () => {
    try {
      const response = await fetch('/api/users/phonebook', {
        credentials: 'include'
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch users');
      }

      setUsers(data.users);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initialize Twilio Device when answerInApp is enabled
  const initializeDevice = useCallback(async () => {
    if (!answerInApp) {
      // Destroy existing device if turning off
      if (deviceRef.current) {
        deviceRef.current.destroy();
        deviceRef.current = null;
        setDeviceReady(false);
      }
      return;
    }

    try {
      // Get access token from server
      const response = await fetch('/api/calls/token', {
        credentials: 'include'
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to get token');
      }

      // Create new device
      const device = new Device(data.token, {
        codecPreferences: ['opus', 'pcmu'],
        enableRingingState: true,
      });

      device.on('registered', () => {
        console.log('Twilio Device registered and ready');
        setDeviceReady(true);
        setDeviceError(null);
      });

      device.on('error', (err) => {
        console.error('Twilio Device error:', err);
        setDeviceError(err.message);
        setDeviceReady(false);
      });

      device.on('incoming', (call) => {
        console.log('Incoming call from:', call.parameters.From);
        setIncomingCall(call);

        call.on('cancel', () => {
          setIncomingCall(null);
        });

        call.on('disconnect', () => {
          setIncomingCall(null);
          setActiveCall(null);
        });
      });

      device.on('tokenWillExpire', async () => {
        // Refresh token before it expires
        try {
          const response = await fetch('/api/calls/token', {
            credentials: 'include'
          });
          const data = await response.json();
          if (response.ok) {
            device.updateToken(data.token);
          }
        } catch (err) {
          console.error('Failed to refresh token:', err);
        }
      });

      await device.register();
      deviceRef.current = device;
    } catch (err) {
      console.error('Failed to initialize Twilio Device:', err);
      setDeviceError(err.message);
    }
  }, [answerInApp]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    initializeDevice();

    return () => {
      if (deviceRef.current) {
        deviceRef.current.destroy();
      }
    };
  }, [initializeDevice]);

  // Auto-hide call status after 5 seconds
  useEffect(() => {
    if (callStatus && !activeCall) {
      const timer = setTimeout(() => {
        setCallStatus(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [callStatus, activeCall]);

  const handleToggleAnswerInApp = async () => {
    const newValue = !answerInApp;

    try {
      const response = await fetch('/api/users/answer-in-app', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ answerInApp: newValue })
      });

      if (!response.ok) {
        throw new Error('Failed to update preference');
      }

      setAnswerInApp(newValue);
      if (onUserUpdate) {
        onUserUpdate({ ...user, answerInApp: newValue });
      }
    } catch (err) {
      console.error('Failed to toggle answer in app:', err);
      setCallStatus({
        type: 'error',
        message: 'Failed to update preference'
      });
    }
  };

  const handleCall = async (calleeId, codename) => {
    setCallingUserId(calleeId);
    setCallStatus(null);

    try {
      const response = await fetch(`/api/calls/initiate/${calleeId}`, {
        method: 'POST',
        credentials: 'include'
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.details || 'Failed to initiate call');
      }

      setCallStatus({
        type: 'success',
        message: data.message || `Calling ${codename}...`
      });
    } catch (err) {
      setCallStatus({
        type: 'error',
        message: err.message
      });
    } finally {
      setCallingUserId(null);
    }
  };

  const handleAcceptCall = () => {
    if (incomingCall) {
      incomingCall.accept();
      setActiveCall(incomingCall);
      setIncomingCall(null);
      setCallStatus({
        type: 'success',
        message: 'Call connected'
      });
    }
  };

  const handleRejectCall = () => {
    if (incomingCall) {
      incomingCall.reject();
      setIncomingCall(null);
    }
  };

  const handleHangup = () => {
    if (activeCall) {
      activeCall.disconnect();
      setActiveCall(null);
      setCallStatus({
        type: 'success',
        message: 'Call ended'
      });
    }
  };

  if (loading) {
    return <div className="loading">Loading phonebook...</div>;
  }

  return (
    <div>
      <div className="card">
        <div className="header">
          <h2>Phonebook</h2>
          <button className="btn btn-logout" onClick={onLogout}>
            Logout
          </button>
        </div>

        <div className="user-info">
          <p><strong>Logged in as:</strong> {user.firstName} {user.lastName}</p>
          <p><strong>Your codename:</strong> {user.codename}</p>
          <p><strong>Your phone:</strong> {user.phoneNumber}</p>
        </div>

        {/* Answer in App Toggle */}
        <div className="toggle-section">
          <label className="toggle-label">
            <span>Answer calls in browser</span>
            <div className="toggle-switch">
              <input
                type="checkbox"
                checked={answerInApp}
                onChange={handleToggleAnswerInApp}
              />
              <span className="toggle-slider"></span>
            </div>
          </label>
          {answerInApp && (
            <p className="toggle-status">
              {deviceReady ? (
                <span className="status-ready">Ready to receive calls</span>
              ) : deviceError ? (
                <span className="status-error">Error: {deviceError}</span>
              ) : (
                <span className="status-connecting">Connecting...</span>
              )}
            </p>
          )}
          {!answerInApp && (
            <p className="toggle-status">
              <span className="status-info">Calls will ring your phone</span>
            </p>
          )}
        </div>

        {error && (
          <p className="error-text" style={{ marginBottom: '16px' }}>{error}</p>
        )}

        {users.length === 0 ? (
          <div className="empty-state">
            <p>No other users yet</p>
            <p style={{ fontSize: '14px', color: '#999', marginTop: '8px' }}>
              Share this app with friends to start making calls!
            </p>
          </div>
        ) : (
          <ul className="phonebook-list">
            {users.map((u) => (
              <li key={u.id} className="phonebook-item">
                <span className="codename">{u.codename}</span>
                <button
                  className="btn btn-call"
                  onClick={() => handleCall(u.id, u.codename)}
                  disabled={callingUserId === u.id || activeCall}
                >
                  {callingUserId === u.id ? 'Calling...' : 'Call'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Incoming Call Modal */}
      {incomingCall && (
        <div className="call-modal">
          <div className="call-modal-content">
            <h3>Incoming Call</h3>
            <p>Someone is calling you...</p>
            <div className="call-modal-buttons">
              <button className="btn btn-accept" onClick={handleAcceptCall}>
                Accept
              </button>
              <button className="btn btn-reject" onClick={handleRejectCall}>
                Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active Call UI */}
      {activeCall && (
        <div className="active-call">
          <div className="active-call-content">
            <p>Call in progress...</p>
            <button className="btn btn-hangup" onClick={handleHangup}>
              Hang Up
            </button>
          </div>
        </div>
      )}

      {callStatus && !activeCall && (
        <div className={`call-status ${callStatus.type}`}>
          {callStatus.message}
        </div>
      )}
    </div>
  );
}

export default Phonebook;
