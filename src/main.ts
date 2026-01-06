import './style.css'
import { WebRTCConnection } from './webrtc'
import { SignalingService } from './signaling'
import { SignalMessage } from './types'

class ClickToTalkApp {
  private webrtc: WebRTCConnection | null = null
  private signaling: SignalingService
  private remotePeerId: string | null = null
  private isInitiator = false

  private joinSection!: HTMLElement
  private callSection!: HTMLElement
  private roomInput!: HTMLInputElement
  private joinButton!: HTMLButtonElement
  private talkButton!: HTMLButtonElement
  private leaveButton!: HTMLButtonElement
  private statusEl!: HTMLElement
  private peerInfoEl!: HTMLElement
  private remoteAudio!: HTMLAudioElement

  constructor() {
    this.signaling = new SignalingService()
    this.initializeUI()
    this.attachEventListeners()
  }

  private initializeUI(): void {
    const app = document.getElementById('app')!

    app.innerHTML = `
      <div class="container">
        <h1>Two-Way Click-to-Talk</h1>
        <p class="subtitle">Press and hold to speak</p>

        <div id="joinSection" class="join-section">
          <div class="input-group">
            <input type="text" id="roomInput" placeholder="Enter room name" value="default-room" />
            <button id="joinButton">Join</button>
          </div>
        </div>

        <div id="callSection" class="hidden">
          <div id="status" class="status connecting">Connecting...</div>
          <div id="peerInfo" class="peer-info"></div>

          <button id="talkButton" class="talk-button">
            HOLD TO TALK
          </button>

          <button id="leaveButton" class="leave-button">Leave Room</button>
        </div>

        <audio id="remoteAudio" autoplay></audio>
      </div>
    `

    this.joinSection = document.getElementById('joinSection')!
    this.callSection = document.getElementById('callSection')!
    this.roomInput = document.getElementById('roomInput') as HTMLInputElement
    this.joinButton = document.getElementById('joinButton') as HTMLButtonElement
    this.talkButton = document.getElementById('talkButton') as HTMLButtonElement
    this.leaveButton = document.getElementById('leaveButton') as HTMLButtonElement
    this.statusEl = document.getElementById('status')!
    this.peerInfoEl = document.getElementById('peerInfo')!
    this.remoteAudio = document.getElementById('remoteAudio') as HTMLAudioElement
  }

  private attachEventListeners(): void {
    this.joinButton.addEventListener('click', () => this.joinRoom())
    this.roomInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.joinRoom()
    })

    this.talkButton.addEventListener('mousedown', () => this.startTalking())
    this.talkButton.addEventListener('mouseup', () => this.stopTalking())
    this.talkButton.addEventListener('mouseleave', () => this.stopTalking())

    this.talkButton.addEventListener('touchstart', (e) => {
      e.preventDefault()
      this.startTalking()
    })
    this.talkButton.addEventListener('touchend', (e) => {
      e.preventDefault()
      this.stopTalking()
    })

    this.leaveButton.addEventListener('click', () => this.leaveRoom())
  }

  private async joinRoom(): Promise<void> {
    const roomName = this.roomInput.value.trim()
    if (!roomName) return

    this.joinButton.disabled = true
    this.updateStatus('Joining room...', 'connecting')

    try {
      await this.signaling.joinRoom(roomName)
      this.peerInfoEl.textContent = `Your ID: ${this.signaling.getPeerId()}`

      this.signaling.onMessage((message) => this.handleSignalMessage(message))

      this.joinSection.classList.add('hidden')
      this.callSection.classList.remove('hidden')
      this.updateStatus('Waiting for peer...', 'connecting')
    } catch (error) {
      console.error('Error joining room:', error)
      this.updateStatus('Failed to join room', 'disconnected')
      this.joinButton.disabled = false
    }
  }

  private async handleSignalMessage(message: SignalMessage): Promise<void> {
    try {
      switch (message.signal_type) {
        case 'join':
          if (!this.remotePeerId) {
            this.remotePeerId = message.peer_id
            this.isInitiator = true
            this.updateStatus('Peer joined! Ready to talk', 'connected')
            await this.initializeConnection()
          }
          break

        case 'offer':
          this.remotePeerId = message.peer_id
          this.isInitiator = false
          await this.initializeConnection()
          if (this.webrtc) {
            await this.webrtc.handleOffer(message.signal_data as RTCSessionDescriptionInit)
            const answer = await this.webrtc.createAnswer()
            await this.signaling.sendSignal('answer', answer, this.remotePeerId)
          }
          this.updateStatus('Connected! Ready to talk', 'connected')
          break

        case 'answer':
          if (this.webrtc && message.peer_id === this.remotePeerId) {
            await this.webrtc.handleAnswer(message.signal_data as RTCSessionDescriptionInit)
            this.updateStatus('Connected! Ready to talk', 'connected')
          }
          break

        case 'ice-candidate':
          if (this.webrtc && message.peer_id === this.remotePeerId) {
            await this.webrtc.addIceCandidate(message.signal_data as RTCIceCandidateInit)
          }
          break

        case 'leave':
          if (message.peer_id === this.remotePeerId) {
            this.updateStatus('Peer disconnected', 'disconnected')
            this.remotePeerId = null
            if (this.webrtc) {
              this.webrtc.close()
              this.webrtc = null
            }
          }
          break
      }
    } catch (error) {
      console.error('Error handling signal:', error)
    }
  }

  private async initializeConnection(): Promise<void> {
    if (this.webrtc) return

    this.webrtc = new WebRTCConnection()
    await this.webrtc.initialize()

    this.webrtc.onRemoteStream((stream) => {
      this.remoteAudio.srcObject = stream
    })

    this.webrtc.onIceCandidate((candidate) => {
      if (this.remotePeerId) {
        this.signaling.sendSignal(
          'ice-candidate',
          candidate.toJSON(),
          this.remotePeerId
        )
      }
    })

    if (this.isInitiator && this.remotePeerId) {
      const offer = await this.webrtc.createOffer()
      await this.signaling.sendSignal('offer', offer, this.remotePeerId)
    }
  }

  private startTalking(): void {
    if (!this.remotePeerId) return
    this.talkButton.classList.add('active')
    this.talkButton.textContent = 'TALKING...'
  }

  private stopTalking(): void {
    this.talkButton.classList.remove('active')
    this.talkButton.textContent = 'HOLD TO TALK'
  }

  private async leaveRoom(): Promise<void> {
    await this.signaling.leave()
    if (this.webrtc) {
      this.webrtc.close()
      this.webrtc = null
    }
    this.remotePeerId = null
    this.isInitiator = false

    this.callSection.classList.add('hidden')
    this.joinSection.classList.remove('hidden')
    this.joinButton.disabled = false
    this.updateStatus('Disconnected', 'disconnected')
  }

  private updateStatus(message: string, type: 'connected' | 'disconnected' | 'connecting'): void {
    this.statusEl.textContent = message
    this.statusEl.className = `status ${type}`
  }
}

new ClickToTalkApp()
