const express = require('express');
const twilio = require('twilio');
const { getUserById, createCallLog, updateCallLog, getCallLogById } = require('../db/database-pg');
const { initiateBridgedCall, generateConferenceTwiML } = require('../services/twilio');

const router = express.Router();

// Middleware to check if user is authenticated and registered
function isRegistered(req, res, next) {
  if (req.user && req.user.type === 'existing') {
    return next();
  }
  res.status(401).json({ error: 'Not authenticated or not registered' });
}

// Middleware to validate Twilio webhook signatures
function validateTwilioRequest(req, res, next) {
  // Skip validation if Twilio credentials aren't configured (dev mode)
  if (!process.env.TWILIO_AUTH_TOKEN) {
    console.warn('WARNING: Twilio auth token not set, skipping webhook validation');
    return next();
  }

  const twilioSignature = req.headers['x-twilio-signature'];
  if (!twilioSignature) {
    console.error('Missing Twilio signature header');
    return res.status(403).send('Forbidden: Missing signature');
  }

  const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3001}`;
  const url = `${baseUrl}${req.originalUrl.split('?')[0]}`; // Remove query params for signature

  const isValid = twilio.validateRequest(
    process.env.TWILIO_AUTH_TOKEN,
    twilioSignature,
    url,
    req.body || {}
  );

  if (!isValid) {
    console.error('Invalid Twilio signature for request:', req.originalUrl);
    return res.status(403).send('Forbidden: Invalid signature');
  }

  next();
}

// Initiate a call to another user (with rate limiting)
router.post('/initiate/:calleeId', (req, res, next) => {
  // Apply call-specific rate limiter
  const callLimiter = req.app.get('callLimiter');
  if (callLimiter) {
    return callLimiter(req, res, next);
  }
  next();
}, isRegistered, async (req, res) => {
  const callerId = req.user.user.id;
  const calleeId = parseInt(req.params.calleeId, 10);

  // Prevent calling yourself
  if (callerId === calleeId) {
    return res.status(400).json({ error: 'Cannot call yourself' });
  }

  // Get callee information
  const callee = await getUserById(calleeId);
  if (!callee) {
    return res.status(404).json({ error: 'User not found' });
  }

  try {
    // Create a call log entry
    const callLogId = await createCallLog(callerId, calleeId);

    // Get caller phone number
    const callerPhone = req.user.user.phone_number;
    const calleePhone = callee.phone_number;

    // Initiate the bridged call via Twilio
    const callDetails = await initiateBridgedCall(callerPhone, calleePhone, callLogId);

    // Update call log with conference details
    await updateCallLog(callLogId, {
      twilioConferenceSid: callDetails.conferenceName,
      status: 'connecting'
    });

    res.json({
      success: true,
      callId: callLogId,
      message: 'Call initiated. Both parties will receive a phone call shortly.'
    });
  } catch (error) {
    console.error('Call initiation error:', error);

    // Check for specific Twilio errors
    if (error.message.includes('not configured')) {
      return res.status(503).json({
        error: 'Phone service not configured',
        details: 'Twilio credentials are missing. Please contact the administrator.'
      });
    }

    res.status(500).json({ error: 'Failed to initiate call' });
  }
});

// TwiML endpoint for conference (called by Twilio)
router.all('/twiml/conference', validateTwilioRequest, (req, res) => {
  const conferenceName = req.query.name || req.body.name;
  const participant = req.query.participant || req.body.participant;

  if (!conferenceName) {
    return res.status(400).send('Conference name required');
  }

  const twiml = generateConferenceTwiML(conferenceName, participant);
  res.type('text/xml');
  res.send(twiml);
});

// Status callback from Twilio (POST from Twilio webhooks)
router.post('/status/:callLogId', validateTwilioRequest, async (req, res) => {
  const { callLogId } = req.params;
  const { CallStatus } = req.body;

  // Log without sensitive data
  console.log(`Call ${callLogId} status update: ${CallStatus}`);

  try {
    const callLog = await getCallLogById(parseInt(callLogId, 10));
    if (!callLog) {
      return res.status(404).send('Call log not found');
    }

    // Map Twilio status to our status
    let status;
    switch (CallStatus) {
      case 'initiated':
      case 'ringing':
        status = 'ringing';
        break;
      case 'in-progress':
        status = 'in-progress';
        break;
      case 'completed':
        status = 'completed';
        break;
      case 'busy':
      case 'no-answer':
      case 'canceled':
      case 'failed':
        status = CallStatus;
        break;
      default:
        status = callLog.status;
    }

    const updates = { status };
    if (['completed', 'busy', 'no-answer', 'canceled', 'failed'].includes(CallStatus)) {
      updates.endedAt = new Date().toISOString();
    }

    await updateCallLog(parseInt(callLogId, 10), updates);
    res.sendStatus(200);
  } catch (error) {
    console.error('Status callback error:', error);
    res.sendStatus(500);
  }
});

// Get call status
router.get('/status/:callLogId', isRegistered, async (req, res) => {
  const { callLogId } = req.params;
  const userId = req.user.user.id;

  try {
    const callLog = await getCallLogById(parseInt(callLogId, 10));
    if (!callLog) {
      return res.status(404).json({ error: 'Call not found' });
    }

    // Verify user is part of this call
    if (callLog.caller_id !== userId && callLog.callee_id !== userId) {
      return res.status(403).json({ error: 'Not authorized to view this call' });
    }

    res.json({
      id: callLog.id,
      status: callLog.status,
      createdAt: callLog.created_at,
      endedAt: callLog.ended_at
    });
  } catch (error) {
    console.error('Get call status error:', error);
    res.status(500).json({ error: 'Failed to get call status' });
  }
});

module.exports = router;
