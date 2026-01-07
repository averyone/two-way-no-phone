const twilio = require('twilio');
const AccessToken = twilio.jwt.AccessToken;
const VoiceGrant = AccessToken.VoiceGrant;

let twilioClient = null;

function getTwilioClient() {
  if (!twilioClient) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken) {
      throw new Error('Twilio credentials not configured');
    }

    twilioClient = twilio(accountSid, authToken);
  }
  return twilioClient;
}

/**
 * Generate an access token for Twilio Voice in the browser
 * @param {string} identity - Unique identity for this user (e.g., "user_123")
 * @returns {string} - JWT access token
 */
function generateAccessToken(identity) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const apiKey = process.env.TWILIO_API_KEY;
  const apiSecret = process.env.TWILIO_API_SECRET;
  const twimlAppSid = process.env.TWILIO_TWIML_APP_SID;

  if (!accountSid || !apiKey || !apiSecret) {
    throw new Error('Twilio API credentials not configured');
  }

  const accessToken = new AccessToken(accountSid, apiKey, apiSecret, {
    identity: identity,
    ttl: 3600 // Token valid for 1 hour
  });

  // Create a Voice grant for this token
  const voiceGrant = new VoiceGrant({
    outgoingApplicationSid: twimlAppSid,
    incomingAllow: true // Allow incoming calls to this identity
  });

  accessToken.addGrant(voiceGrant);

  return accessToken.toJwt();
}

/**
 * Initiates a bridged call between two parties using Twilio Conference
 * Supports both phone and browser (WebRTC) endpoints
 *
 * @param {object} caller - { phone, identity, answerInApp } for the caller
 * @param {object} callee - { phone, identity, answerInApp } for the callee
 * @param {string} callLogId - ID of the call log for tracking
 * @returns {Promise<object>} - Conference details
 */
async function initiateBridgedCall(caller, callee, callLogId) {
  const client = getTwilioClient();
  const twilioNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!twilioNumber) {
    throw new Error('Twilio phone number not configured');
  }

  // Create a unique conference name
  const conferenceName = `call-${callLogId}-${Date.now()}`;

  // TwiML for joining the conference
  const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3001}`;

  const callPromises = [];

  // Call the caller - if they're in-app, call their browser identity, otherwise their phone
  if (caller.answerInApp && caller.identity) {
    // Call browser client
    callPromises.push(client.calls.create({
      to: `client:${caller.identity}`,
      from: twilioNumber,
      url: `${baseUrl}/api/calls/twiml/conference?name=${encodeURIComponent(conferenceName)}&participant=caller`,
      statusCallback: `${baseUrl}/api/calls/status/${callLogId}`,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      statusCallbackMethod: 'POST'
    }));
  } else {
    // Call phone number
    callPromises.push(client.calls.create({
      to: caller.phone,
      from: twilioNumber,
      url: `${baseUrl}/api/calls/twiml/conference?name=${encodeURIComponent(conferenceName)}&participant=caller`,
      statusCallback: `${baseUrl}/api/calls/status/${callLogId}`,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      statusCallbackMethod: 'POST'
    }));
  }

  // Call the callee - if they're in-app, call their browser identity, otherwise their phone
  if (callee.answerInApp && callee.identity) {
    // Call browser client
    callPromises.push(client.calls.create({
      to: `client:${callee.identity}`,
      from: twilioNumber,
      url: `${baseUrl}/api/calls/twiml/conference?name=${encodeURIComponent(conferenceName)}&participant=callee`,
      statusCallback: `${baseUrl}/api/calls/status/${callLogId}`,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      statusCallbackMethod: 'POST'
    }));
  } else {
    // Call phone number
    callPromises.push(client.calls.create({
      to: callee.phone,
      from: twilioNumber,
      url: `${baseUrl}/api/calls/twiml/conference?name=${encodeURIComponent(conferenceName)}&participant=callee`,
      statusCallback: `${baseUrl}/api/calls/status/${callLogId}`,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      statusCallbackMethod: 'POST'
    }));
  }

  const [callerCall, calleeCall] = await Promise.all(callPromises);

  return {
    conferenceName,
    callerCallSid: callerCall.sid,
    calleeCallSid: calleeCall.sid
  };
}

/**
 * Generate TwiML for conference joining
 * @param {string} conferenceName - Name of the conference to join
 * @param {string} participant - Identifier for the participant (caller/callee)
 * @returns {string} - TwiML response
 */
function generateConferenceTwiML(conferenceName, participant) {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const response = new VoiceResponse();

  // Add a brief message before connecting
  if (participant === 'caller') {
    response.say('Connecting your call. Please wait.');
  } else {
    response.say('You have an incoming call. Connecting now.');
  }

  // Connect to the conference
  const dial = response.dial();
  dial.conference({
    startConferenceOnEnter: true,
    endConferenceOnExit: true,
    maxParticipants: 2,
    beep: false,
    waitUrl: '' // No hold music, just silence while waiting
  }, conferenceName);

  return response.toString();
}

/**
 * End an ongoing call
 * @param {string} callSid - Twilio Call SID to end
 */
async function endCall(callSid) {
  const client = getTwilioClient();
  await client.calls(callSid).update({ status: 'completed' });
}

module.exports = {
  getTwilioClient,
  generateAccessToken,
  initiateBridgedCall,
  generateConferenceTwiML,
  endCall
};
