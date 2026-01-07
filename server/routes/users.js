const express = require('express');
const {
  createUser,
  getAllUsersExcept,
  updateUser,
  isCodenameAvailable,
  getUserByGoogleId
} = require('../db/database-pg');

const router = express.Router();

// Middleware to check if user is authenticated
function isAuthenticated(req, res, next) {
  if (req.user) {
    return next();
  }
  res.status(401).json({ error: 'Not authenticated' });
}

// Middleware to check if user is registered
function isRegistered(req, res, next) {
  if (req.user && req.user.type === 'existing') {
    return next();
  }
  res.status(403).json({ error: 'User not registered' });
}

// Validate codename format and length
function validateCodename(codename) {
  if (!codename || typeof codename !== 'string') {
    return { valid: false, error: 'Codename is required' };
  }

  // Trim and check length (3-30 characters)
  const trimmed = codename.trim();
  if (trimmed.length < 3) {
    return { valid: false, error: 'Codename must be at least 3 characters' };
  }
  if (trimmed.length > 30) {
    return { valid: false, error: 'Codename must be 30 characters or less' };
  }

  // Only allow alphanumeric, underscores, and hyphens
  const codenameRegex = /^[a-zA-Z0-9_-]+$/;
  if (!codenameRegex.test(trimmed)) {
    return { valid: false, error: 'Codename can only contain letters, numbers, underscores, and hyphens' };
  }

  return { valid: true, codename: trimmed };
}

// Register a new user (complete registration after Google OAuth)
router.post('/register', isAuthenticated, async (req, res) => {
  if (req.user.type === 'existing') {
    return res.status(400).json({ error: 'User already registered' });
  }

  const { phoneNumber, codename } = req.body;
  const googleData = req.user.googleData;

  // Validate required fields
  if (!phoneNumber || !codename) {
    return res.status(400).json({ error: 'Phone number and codename are required' });
  }

  // Validate phone number format (basic validation)
  const phoneRegex = /^\+?[1-9]\d{1,14}$/;
  if (!phoneRegex.test(phoneNumber.replace(/[\s\-\(\)]/g, ''))) {
    return res.status(400).json({ error: 'Invalid phone number format' });
  }

  // Validate codename format
  const codenameValidation = validateCodename(codename);
  if (!codenameValidation.valid) {
    return res.status(400).json({ error: codenameValidation.error });
  }
  const validatedCodename = codenameValidation.codename;

  // Check if codename is available
  const available = await isCodenameAvailable(validatedCodename);
  if (!available) {
    return res.status(400).json({ error: 'Codename is already taken' });
  }

  try {
    const userId = await createUser({
      googleId: googleData.googleId,
      email: googleData.email,
      firstName: googleData.firstName,
      lastName: googleData.lastName,
      phoneNumber: phoneNumber.replace(/[\s\-\(\)]/g, ''),
      codename: validatedCodename
    });

    // Update session to reflect registered user
    const user = await getUserByGoogleId(googleData.googleId);
    req.user.type = 'existing';
    req.user.user = user;

    // Re-serialize the session
    req.login({ type: 'existing', user }, (err) => {
      if (err) {
        return res.status(500).json({ error: 'Session update failed' });
      }
      res.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          phoneNumber: user.phone_number,
          codename: user.codename
        }
      });
    });
  } catch (error) {
    console.error('Registration error:', error);
    if (error.message.includes('unique') || error.code === '23505') {
      return res.status(400).json({ error: 'Email or codename already exists' });
    }
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Get all users (phonebook) - only for registered users
router.get('/phonebook', isAuthenticated, isRegistered, async (req, res) => {
  try {
    const users = await getAllUsersExcept(req.user.user.id);
    res.json({
      users: users.map(u => ({
        id: u.id,
        codename: u.codename
      }))
    });
  } catch (error) {
    console.error('Phonebook error:', error);
    res.status(500).json({ error: 'Failed to fetch phonebook' });
  }
});

// Check if codename is available
router.get('/check-codename/:codename', isAuthenticated, async (req, res) => {
  const { codename } = req.params;

  // Validate codename format first
  const codenameValidation = validateCodename(codename);
  if (!codenameValidation.valid) {
    return res.json({ available: false, error: codenameValidation.error });
  }

  const excludeUserId = req.user.type === 'existing' ? req.user.user.id : null;
  const available = await isCodenameAvailable(codenameValidation.codename, excludeUserId);
  res.json({ available });
});

// Update user profile (phone number and codename)
router.put('/profile', isAuthenticated, isRegistered, async (req, res) => {
  const { phoneNumber, codename } = req.body;
  const userId = req.user.user.id;

  // Validate required fields
  if (!phoneNumber || !codename) {
    return res.status(400).json({ error: 'Phone number and codename are required' });
  }

  // Validate phone number format
  const phoneRegex = /^\+?[1-9]\d{1,14}$/;
  if (!phoneRegex.test(phoneNumber.replace(/[\s\-\(\)]/g, ''))) {
    return res.status(400).json({ error: 'Invalid phone number format' });
  }

  // Validate codename format
  const codenameValidation = validateCodename(codename);
  if (!codenameValidation.valid) {
    return res.status(400).json({ error: codenameValidation.error });
  }
  const validatedCodename = codenameValidation.codename;

  // Check if codename is available (excluding current user)
  const available = await isCodenameAvailable(validatedCodename, userId);
  if (!available) {
    return res.status(400).json({ error: 'Codename is already taken' });
  }

  try {
    await updateUser(userId, {
      phoneNumber: phoneNumber.replace(/[\s\-\(\)]/g, ''),
      codename: validatedCodename
    });

    // Update session
    req.user.user.phone_number = phoneNumber.replace(/[\s\-\(\)]/g, '');
    req.user.user.codename = validatedCodename;

    res.json({
      success: true,
      user: {
        id: req.user.user.id,
        email: req.user.user.email,
        firstName: req.user.user.first_name,
        lastName: req.user.user.last_name,
        phoneNumber: req.user.user.phone_number,
        codename: req.user.user.codename
      }
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Profile update failed' });
  }
});

module.exports = router;
