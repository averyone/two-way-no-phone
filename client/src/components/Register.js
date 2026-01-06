import React, { useState, useEffect } from 'react';

function Register({ googleData, onComplete }) {
  const [phoneNumber, setPhoneNumber] = useState(googleData?.phoneNumber || '');
  const [codename, setCodename] = useState(googleData?.defaultCodename || '');
  const [codenameAvailable, setCodenameAvailable] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingCodename, setCheckingCodename] = useState(false);

  // Check codename availability with debounce
  useEffect(() => {
    if (!codename) {
      setCodenameAvailable(null);
      return;
    }

    const timer = setTimeout(async () => {
      setCheckingCodename(true);
      try {
        const response = await fetch(`/api/users/check-codename/${encodeURIComponent(codename)}`, {
          credentials: 'include'
        });
        const data = await response.json();
        setCodenameAvailable(data.available);
      } catch (err) {
        console.error('Codename check failed:', err);
      } finally {
        setCheckingCodename(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [codename]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/users/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          phoneNumber,
          codename
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Registration failed');
      }

      onComplete(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card" style={{ marginTop: '40px' }}>
      <h2>Complete Your Registration</h2>
      <p style={{ color: '#666', marginBottom: '24px' }}>
        Enter your phone number and choose a codename
      </p>

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>First Name</label>
          <input
            type="text"
            value={googleData?.firstName || ''}
            disabled
          />
          <p className="hint">From your Google account (cannot be changed)</p>
        </div>

        <div className="form-group">
          <label>Last Name</label>
          <input
            type="text"
            value={googleData?.lastName || ''}
            disabled
          />
          <p className="hint">From your Google account (cannot be changed)</p>
        </div>

        <div className="form-group">
          <label>Email</label>
          <input
            type="email"
            value={googleData?.email || ''}
            disabled
          />
          <p className="hint">From your Google account (cannot be changed)</p>
        </div>

        <div className="form-group">
          <label>Phone Number *</label>
          <input
            type="tel"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="+1 555 123 4567"
            required
          />
          <p className="hint">Include country code (e.g., +1 for US)</p>
        </div>

        <div className="form-group">
          <label>Codename *</label>
          <input
            type="text"
            value={codename}
            onChange={(e) => setCodename(e.target.value)}
            placeholder="your_codename"
            required
          />
          {checkingCodename && (
            <p className="hint">Checking availability...</p>
          )}
          {!checkingCodename && codenameAvailable === true && codename && (
            <p className="success-text">Codename is available!</p>
          )}
          {!checkingCodename && codenameAvailable === false && codename && (
            <p className="error-text">Codename is already taken</p>
          )}
          <p className="hint">This is how others will see you in the phonebook</p>
        </div>

        {error && (
          <p className="error-text" style={{ marginBottom: '16px' }}>{error}</p>
        )}

        <button
          type="submit"
          className="btn btn-primary"
          style={{ width: '100%' }}
          disabled={loading || !phoneNumber || !codename || codenameAvailable === false}
        >
          {loading ? 'Creating Account...' : 'Create Account'}
        </button>
      </form>
    </div>
  );
}

export default Register;
