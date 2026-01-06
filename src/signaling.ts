import { supabase } from './supabase'
import { SignalMessage } from './types'
import { RealtimeChannel } from '@supabase/supabase-js'

export class SignalingService {
  private roomId: string | null = null
  private peerId: string
  private channel: RealtimeChannel | null = null
  private onMessageCallback: ((message: SignalMessage) => void) | null = null

  constructor() {
    this.peerId = this.generatePeerId()
  }

  private generatePeerId(): string {
    return `peer_${Math.random().toString(36).substring(2, 15)}`
  }

  async joinRoom(roomName: string): Promise<string> {
    const { data: existingRoom } = await supabase
      .from('rooms')
      .select('id')
      .eq('name', roomName)
      .maybeSingle()

    if (existingRoom) {
      this.roomId = existingRoom.id
    } else {
      const { data: newRoom, error } = await supabase
        .from('rooms')
        .insert({ name: roomName })
        .select('id')
        .single()

      if (error) throw error
      this.roomId = newRoom.id
    }

    this.channel = supabase.channel(`room:${this.roomId}`)

    this.channel
      .on('broadcast', { event: 'signal' }, ({ payload }) => {
        if (payload.peer_id !== this.peerId && this.onMessageCallback) {
          this.onMessageCallback(payload as SignalMessage)
        }
      })
      .subscribe()

    await this.sendSignal('join', {})

    return this.peerId
  }

  async sendSignal(
    signalType: SignalMessage['signal_type'],
    signalData: SignalMessage['signal_data'],
    targetPeerId: string | null = null
  ): Promise<void> {
    if (!this.roomId) {
      throw new Error('Not connected to a room')
    }

    const message: SignalMessage = {
      room_id: this.roomId,
      peer_id: this.peerId,
      target_peer_id: targetPeerId,
      signal_type: signalType,
      signal_data: signalData
    }

    await supabase.from('signaling').insert(message)

    if (this.channel) {
      await this.channel.send({
        type: 'broadcast',
        event: 'signal',
        payload: message
      })
    }
  }

  onMessage(callback: (message: SignalMessage) => void): void {
    this.onMessageCallback = callback
  }

  getPeerId(): string {
    return this.peerId
  }

  async leave(): Promise<void> {
    if (this.roomId) {
      await this.sendSignal('leave', {})
    }
    if (this.channel) {
      await this.channel.unsubscribe()
      this.channel = null
    }
    this.roomId = null
  }
}
