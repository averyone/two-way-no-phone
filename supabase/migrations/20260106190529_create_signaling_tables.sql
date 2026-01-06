/*
  # Create signaling tables for WebRTC click-to-talk system

  1. New Tables
    - `rooms`
      - `id` (uuid, primary key) - unique identifier for each room
      - `name` (text) - room name/identifier
      - `created_at` (timestamptz) - when the room was created
    
    - `signaling`
      - `id` (uuid, primary key) - unique identifier for each signal
      - `room_id` (uuid, foreign key) - references the room
      - `peer_id` (text) - identifier for the peer sending the signal
      - `target_peer_id` (text, nullable) - identifier for the target peer (null for broadcast)
      - `signal_type` (text) - type of signal: 'offer', 'answer', 'ice-candidate', 'join', 'leave'
      - `signal_data` (jsonb) - the actual signal payload
      - `created_at` (timestamptz) - when the signal was created
  
  2. Security
    - Enable RLS on both tables
    - Add policies for authenticated and anonymous users to read and insert
    - Signaling is ephemeral and can be publicly accessible for demo purposes
*/

CREATE TABLE IF NOT EXISTS rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS signaling (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  peer_id text NOT NULL,
  target_peer_id text,
  signal_type text NOT NULL,
  signal_data jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE signaling ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view rooms"
  ON rooms FOR SELECT
  USING (true);

CREATE POLICY "Anyone can create rooms"
  ON rooms FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can view signaling"
  ON signaling FOR SELECT
  USING (true);

CREATE POLICY "Anyone can create signaling"
  ON signaling FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can delete old signaling"
  ON signaling FOR DELETE
  USING (true);

CREATE INDEX IF NOT EXISTS idx_signaling_room_id ON signaling(room_id);
CREATE INDEX IF NOT EXISTS idx_signaling_created_at ON signaling(created_at);
