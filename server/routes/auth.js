const express = require('express');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { getUserByGoogleId, getUserById } = require('../db/database-pg');

const router = express.Router();

// Configure Passport Google Strategy
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || '/auth/google/callback'
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      // We don't create the user here - we just pass the Google profile data
      // User creation happens in the registration step
      const existingUser = await getUserByGoogleId(profile.id);

      if (existingUser) {
        return done(null, { type: 'existing', user: existingUser });
      }

      // Extract data from Google profile
      const googleData = {
        googleId: profile.id,
        email: profile.emails?.[0]?.value || '',
        firstName: profile.name?.givenName || '',
        lastName: profile.name?.familyName || '',
        // Note: Google People API doesn't provide phone numbers in standard OAuth
        // Phone number will need to be entered manually
        phoneNumber: ''
      };

      // Generate default codename from email
      const emailLocalPart = googleData.email.split('@')[0] || 'user';
      googleData.defaultCodename = `${emailLocalPart}_phone`;

      return done(null, { type: 'new', googleData });
    } catch (error) {
      return done(error);
    }
  }
));

// Serialize user to session
passport.serializeUser((data, done) => {
  if (data.type === 'existing') {
    done(null, { type: 'existing', userId: data.user.id });
  } else {
    done(null, { type: 'new', googleData: data.googleData });
  }
});

// Deserialize user from session
passport.deserializeUser(async (sessionData, done) => {
  try {
    if (sessionData.type === 'existing') {
      const user = await getUserById(sessionData.userId);
      done(null, user ? { type: 'existing', user } : null);
    } else {
      done(null, { type: 'new', googleData: sessionData.googleData });
    }
  } catch (error) {
    done(error);
  }
});

// Initiate Google OAuth
router.get('/google',
  passport.authenticate('google', {
    scope: ['profile', 'email']
  })
);

// Google OAuth callback
router.get('/google/callback',
  passport.authenticate('google', {
    failureRedirect: `${process.env.CLIENT_URL || 'http://localhost:3000'}/login?error=auth_failed`
  }),
  (req, res) => {
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';

    if (req.user.type === 'existing') {
      // User exists, redirect to phonebook
      res.redirect(`${clientUrl}/phonebook`);
    } else {
      // New user, redirect to registration
      res.redirect(`${clientUrl}/register`);
    }
  }
);

// Get current user status
router.get('/status', (req, res) => {
  if (!req.user) {
    return res.json({ authenticated: false });
  }

  if (req.user.type === 'existing') {
    return res.json({
      authenticated: true,
      registered: true,
      user: {
        id: req.user.user.id,
        email: req.user.user.email,
        firstName: req.user.user.first_name,
        lastName: req.user.user.last_name,
        phoneNumber: req.user.user.phone_number,
        codename: req.user.user.codename
      }
    });
  } else {
    return res.json({
      authenticated: true,
      registered: false,
      googleData: req.user.googleData
    });
  }
});

// Logout
router.post('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: 'Session destruction failed' });
      }
      res.json({ success: true });
    });
  });
});

module.exports = router;
