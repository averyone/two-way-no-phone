# Two-Way No-Phone

A simple web application that allows people to talk to each other by phone without knowing each other's phone numbers.

## How It Works

1. **User Registration**: Users sign in with Google, which provides their name and email. They then enter their phone number and choose a unique codename.

2. **Phonebook**: After registration, users see a list of all other registered users (by codename only) with a "Call" button next to each.

3. **Anonymous Calling**: When a user clicks "Call", the system uses Twilio to dial both parties simultaneously and connects them in a conference call. Neither party sees the other's phone number - they only see the Twilio number.

## Tech Stack

- **Backend**: Node.js with Express
- **Database**: SQLite (via better-sqlite3)
- **Authentication**: Google OAuth 2.0 (via Passport.js)
- **Phone Service**: Twilio
- **Frontend**: React

## Setup

### Prerequisites

- Node.js 18+
- A Google Cloud project with OAuth 2.0 credentials
- A Twilio account with a phone number

### Installation

1. Clone the repository and install dependencies:

```bash
npm run install-all
```

2. Create a `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

3. Configure your environment variables in `.env`:

```
# Server Configuration
PORT=3001
SESSION_SECRET=<generate-a-random-secret>

# Google OAuth Configuration
GOOGLE_CLIENT_ID=<your-google-client-id>
GOOGLE_CLIENT_SECRET=<your-google-client-secret>
GOOGLE_CALLBACK_URL=http://localhost:3001/auth/google/callback

# Twilio Configuration
TWILIO_ACCOUNT_SID=<your-twilio-account-sid>
TWILIO_AUTH_TOKEN=<your-twilio-auth-token>
TWILIO_PHONE_NUMBER=<your-twilio-phone-number>

# Client URL (for CORS and redirects)
CLIENT_URL=http://localhost:3000

# Base URL for Twilio webhooks (in production, use your public URL)
BASE_URL=http://localhost:3001
```

### Setting Up Google OAuth

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google+ API
4. Go to Credentials → Create Credentials → OAuth 2.0 Client ID
5. Configure the consent screen
6. Add authorized redirect URI: `http://localhost:3001/auth/google/callback`
7. Copy the Client ID and Client Secret to your `.env` file

### Setting Up Twilio

1. Sign up for a [Twilio account](https://www.twilio.com/)
2. Get your Account SID and Auth Token from the dashboard
3. Purchase a phone number with voice capabilities
4. Copy the credentials to your `.env` file

**Note**: For Twilio to work properly in development, you'll need a public URL for webhooks. You can use [ngrok](https://ngrok.com/) to expose your local server:

```bash
ngrok http 3001
```

Then update `BASE_URL` in your `.env` to the ngrok URL.

### Running the Application

Development mode (runs both server and client):

```bash
npm run dev
```

Or run them separately:

```bash
# Terminal 1: Backend
npm run server

# Terminal 2: Frontend
npm run client
```

The application will be available at:
- Frontend: http://localhost:3000
- Backend: http://localhost:3001

## API Endpoints

### Authentication

- `GET /auth/google` - Initiate Google OAuth flow
- `GET /auth/google/callback` - OAuth callback
- `GET /auth/status` - Get current authentication status
- `POST /auth/logout` - Logout

### Users

- `POST /api/users/register` - Complete registration
- `GET /api/users/phonebook` - Get list of all users (except self)
- `GET /api/users/check-codename/:codename` - Check if codename is available
- `PUT /api/users/profile` - Update profile (phone and codename)

### Calls

- `POST /api/calls/initiate/:calleeId` - Initiate a call to another user
- `GET /api/calls/status/:callLogId` - Get call status

## Security Considerations

- Phone numbers are stored in the database but never exposed to other users
- All communication happens through Twilio's infrastructure
- Session-based authentication with secure cookies
- CORS configured to only allow requests from the frontend origin

## License

MIT
