import React, { useState, useEffect, useCallback } from 'react';

function Phonebook({ user, onLogout }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [callStatus, setCallStatus] = useState(null);
  const [callingUserId, setCallingUserId] = useState(null);

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

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Auto-hide call status after 5 seconds
  useEffect(() => {
    if (callStatus) {
      const timer = setTimeout(() => {
        setCallStatus(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [callStatus]);

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
        message: `Calling ${codename}... Check your phone!`
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
                  disabled={callingUserId === u.id}
                >
                  {callingUserId === u.id ? 'Calling...' : 'Call'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {callStatus && (
        <div className={`call-status ${callStatus.type}`}>
          {callStatus.message}
        </div>
      )}
    </div>
  );
}

export default Phonebook;
