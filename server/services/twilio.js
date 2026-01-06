const twilio = require('twilio');

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
 * Initiates a bridged call between two phone numbers using Twilio Conference
 *
 * The flow is:
 * 1. Create a unique conference room
 * 2. Call the first participant (caller) and connect them to the conference
 * 3. Call the second participant (callee) and connect them to the conference
 * 4. Both parties are now connected and can talk to each other
 *
 * @param {string} callerPhone - Phone number of the person initiating the call
 * @param {string} calleePhone - Phone number of the person being called
 * @param {string} callLogId - ID of the call log for tracking
 * @returns {Promise<object>} - Conference details
 */
async function initiateBridgedCall(callerPhone, calleePhone, callLogId) {
  const client = getTwilioClient();
  const twilioNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!twilioNumber) {
    throw new Error('Twilio phone number not configured');
  }

  // Create a unique conference name
  const conferenceName = `call-${callLogId}-${Date.now()}`;

  // TwiML for joining the conference
  const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3001}`;

  // First, call the caller and connect them to the conference
  const callerCall = await client.calls.create({
    to: callerPhone,
    from: twilioNumber,
    url: `${baseUrl}/api/calls/twiml/conference?name=${encodeURIComponent(conferenceName)}&participant=caller`,
    statusCallback: `${baseUrl}/api/calls/status/${callLogId}`,
    statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
    statusCallbackMethod: 'POST'
  });

  // Then, call the callee and connect them to the same conference
  const calleeCall = await client.calls.create({
    to: calleePhone,
    from: twilioNumber,
    url: `${baseUrl}/api/calls/twiml/conference?name=${encodeURIComponent(conferenceName)}&participant=callee`,
    statusCallback: `${baseUrl}/api/calls/status/${callLogId}`,
    statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
    statusCallbackMethod: 'POST'
  });

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
  initiateBridgedCall,
  generateConferenceTwiML,
  endCall
};
