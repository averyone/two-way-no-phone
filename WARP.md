# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

Two-Way No-Phone is a hybrid application with **two distinct implementations**:

1. **Phone-based system** (`server/`, `client/`): Uses Twilio conference calls for anonymous voice communication. Users authenticate via Google OAuth, register with phone numbers and codenames, and can call each other without revealing phone numbers.

2. **WebRTC click-to-talk system** (`src/`, `supabase/`): Browser-based push-to-talk using WebRTC peer-to-peer connections with Supabase for signaling.

These are **separate, independent implementations** that share the same repository but serve different use cases.

## Development Commands

### Installation
```bash
npm run install-all  # Install both root and client dependencies
```

### Running the Applications

**Phone-based system:**
```bash
npm run dev          # Run both Express server and React client concurrently
npm run server       # Run only the Express backend (port 3001)
npm run client       # Run only the React frontend (port 3000)
```

**WebRTC click-to-talk:**
```bash
npm run client       # Vite dev server for src/ TypeScript app (port 3000)
```

### Building
```bash
npm run build        # Build React client for production
```

## Environment Configuration

### Phone-based System
Requires `.env` file (see `.env.example`):
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` - Google OAuth credentials
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` - Twilio API credentials
- `SESSION_SECRET` - Express session secret
- `BASE_URL` - Public URL for Twilio webhooks (use ngrok in development)

**Development workflow for Twilio webhooks:**
```bash
ngrok http 3001      # Expose local server
# Update BASE_URL in .env with ngrok URL
```

### WebRTC System
Requires Vite environment variables:
- `VITE_SUPABASE_URL` - Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Supabase anonymous key

## Architecture

### Phone-based System Architecture

**Backend (Express/Node.js):**
- `server/index.js` - Main server, middleware setup, session management
- `server/routes/auth.js` - Google OAuth flow with Passport.js
- `server/routes/users.js` - User registration, profile updates, phonebook API
- `server/routes/calls.js` - Call initiation, Twilio webhooks, TwiML generation
- `server/db/database.js` - SQLite operations using better-sqlite3
- `server/services/twilio.js` - Twilio conference call logic

**Database:** PostgreSQL (production) or SQLite (local development)
- `users` table: Google ID, email, name, phone number, codename
- `call_logs` table: Tracks calls between users with Twilio conference SIDs
- Uses `server/db/database-pg.js` for PostgreSQL (async operations)
- Legacy `server/db/database.js` available for SQLite (sync operations)

**Call Flow:**
1. User A clicks "Call" for User B's codename
2. Backend creates call_log entry
3. `initiateBridgedCall()` creates unique conference room
4. Twilio simultaneously calls both phone numbers
5. Both connect to conference via TwiML at `/api/calls/twiml/conference`
6. Status updates posted to `/api/calls/status/:callLogId`

**Frontend (React):**
- `client/src/App.js` - Route guards based on authentication/registration status
- `client/src/components/Login.js` - Google OAuth initiation
- `client/src/components/Register.js` - Phone number and codename entry
- `client/src/components/Phonebook.js` - User list with call buttons

### WebRTC Click-to-Talk Architecture

**Frontend (TypeScript/Vite):**
- `src/main.ts` - Main application controller, UI management, WebRTC orchestration
- `src/webrtc.ts` - WebRTC peer connection wrapper, media stream handling
- `src/signaling.ts` - Supabase realtime channels for WebRTC signaling
- `src/supabase.ts` - Supabase client initialization

**Database (Supabase):**
- `rooms` table: Named rooms for peer pairing
- `signaling` table: Ephemeral WebRTC signaling messages (offers, answers, ICE candidates)
- Realtime broadcast channels for instant signaling delivery

**Connection Flow:**
1. User joins room by name
2. When second peer joins, first peer becomes initiator
3. Initiator creates WebRTC offer, sends via Supabase broadcast
4. Responder receives offer, creates answer, sends back
5. ICE candidates exchanged through signaling channel
6. Direct peer-to-peer audio connection established
7. Push-to-talk controls audio transmission

## Key Implementation Details

### Phone System Database Layer
Database operations are **asynchronous** and use PostgreSQL via the `pg` library. All database functions return Promises and must be awaited:
```javascript
const user = await getUserById(userId);  // Must use await
```

**Local Development:**
- Set `DATABASE_URL` environment variable to PostgreSQL connection string
- Or use SQLite by switching imports to `./db/database.js` (sync API)

**Production (Render):**
- Uses PostgreSQL (free tier included in `render.yaml`)
- `DATABASE_URL` automatically provided by Render

### Authentication Flow (Phone System)
Passport serialization supports two states:
- **New users**: Session stores Google data, redirects to `/register`
- **Existing users**: Session stores user ID, redirects to `/phonebook`

Check `req.user.type` to determine state.

### Twilio Conference Implementation
- Each call creates unique conference name: `call-{callLogId}-{timestamp}`
- Both participants added simultaneously to ensure connection
- `startConferenceOnEnter: true` prevents hold music
- `maxParticipants: 2` enforces one-on-one calls
- Status callbacks require publicly accessible webhook URL

### WebRTC Audio Handling
- `getUserMedia()` captures microphone on connection initialization
- Audio tracks always added to peer connection
- Push-to-talk UI is **visual only** - audio streams continuously
- To implement true push-to-talk: use `track.enabled = false/true` on mousedown/mouseup

### Supabase Realtime
- Uses broadcast channels (ephemeral, not stored)
- Signals also written to `signaling` table for persistence
- RLS policies allow anonymous access for demo purposes
- Peer filtering done client-side by checking `peer_id`

## Common Development Tasks

### Adding API Endpoints (Phone System)
1. Add route in appropriate `server/routes/*.js` file
2. Use `isRegistered` middleware for authenticated routes
3. Access user via `req.user.user` (note double `.user`)
4. Database operations are synchronous (no await needed)

### Modifying Call Behavior
- Edit `server/services/twilio.js` for conference logic
- Modify TwiML generation in `generateConferenceTwiML()`
- Update status handling in `server/routes/calls.js` POST `/status/:callLogId`

### Adding WebRTC Features
- Modify WebRTC configuration in `src/webrtc.ts` (ICE servers, constraints)
- Update signaling protocol in `src/signaling.ts` and `src/types.ts`
- Add UI controls in `src/main.ts`

### Database Migrations (Phone System)
PostgreSQL schema changes:
1. Modify table definitions in `server/db/database-pg.js` `initializeDatabase()`
2. For production, create SQL migration files and run them manually
3. Current schema is created automatically on first app start via `CREATE TABLE IF NOT EXISTS`

**Note:** The `initializeDatabase()` function runs on server startup and creates tables if they don't exist.

### Supabase Schema Changes (WebRTC System)
```bash
# Create new migration
supabase migration new migration_name

# Apply migrations locally
supabase db reset

# Apply to production
supabase db push
```

## Testing Notes

- No test framework currently configured
- Phone system requires valid Twilio credentials and ngrok for full testing
- WebRTC system requires Supabase project for signaling
- Both systems require HTTPS in production for microphone access (WebRTC) and OAuth callbacks (phone system)

## Important Constraints

- Phone numbers stored in database but **never** exposed to other users
- Session cookies require `secure: true` in production (HTTPS)
- CORS configured for `CLIENT_URL` only
- Twilio webhooks must be publicly accessible (no localhost)
- WebRTC requires HTTPS for `getUserMedia()` (except localhost)
- PostgreSQL database uses connection pooling for concurrent access
