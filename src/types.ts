export interface SignalMessage {
  room_id: string
  peer_id: string
  target_peer_id: string | null
  signal_type: 'offer' | 'answer' | 'ice-candidate' | 'join' | 'leave'
  signal_data: RTCSessionDescriptionInit | RTCIceCandidateInit | object
}

export interface Room {
  id: string
  name: string
  created_at: string
}
