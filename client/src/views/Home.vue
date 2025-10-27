<script>
import GameService from "../service/GameService.js";
import PlayerList from '../components/PlayerList.vue'
import ScoreInput from '../components/ScoreInput.vue'
import PendingRoundReview from '../components/PendingRoundReview.vue'
import RoundsAccordion from '../components/RoundsAccordion.vue'

export default {
  name: 'Home',
  components: {PlayerList, ScoreInput, PendingRoundReview, RoundsAccordion},
  data() {
    return {
      username: null,
      gameDto: null,
      userId: null,
      ws: null,
      scoreInput: '',
      wsConnected: false,
      reconnectAttempts: 0,
    }
  },
  mounted() {
    // initialize userId and username from localStorage
    const storedUsername = localStorage.getItem('username');
    if (storedUsername) {
      this.username = storedUsername;
    }

    let storedId = localStorage.getItem('userId')
    if (!storedId) {
      storedId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
      localStorage.setItem('userId', storedId)
    }
    this.userId = storedId

    this.setupWebSocket()
    this.getGameState();
  },
  methods: {
    async getGameState() {
      try {
        const data = await GameService.getGameStatus(this.userId)
        // backend returns { game: null } when no game, otherwise the game object directly
        if (data && Object.prototype.hasOwnProperty.call(data, 'game')) {
          this.gameDto = data.game
        } else if (data && data.id) {
          this.gameDto = data
        } else {
          this.gameDto = null
        }

        // After a score rejection, the server clears pendingRound and moves scores to 'previousScore'
        // Use this to pre-fill the input.
        if (this.gameDto && !this.gameDto.pendingRound && this.playerInGame && typeof this.playerInGame.previousScore === 'number') {
          this.scoreInput = this.playerInGame.previousScore
        } else if (this.gameDto && !this.gameDto.pendingRound) {
          // If we are back to score input for any other reason (e.g. new round), clear the input.
          this.scoreInput = ''
        }
      } catch (e) {
        console.error('Failed to fetch game state', e)
        this.gameDto = null
      }
    },

    async joinGame() {
      if (!this.username || this.username.trim().length === 0) {
        alert("Veuillez entrer un nom valide.");
        return;
      }
      const usernameTrimmed = this.username.trim()
      localStorage.setItem('username', usernameTrimmed);

      try {
        if (!this.isGameRunning) {
          // start a new game
          await GameService.startGame(this.userId, usernameTrimmed)
        } else {
          // join existing game
          await GameService.joinGame(this.userId, usernameTrimmed)
        }
        // fetch updated state
        await this.getGameState()
      } catch (err) {
        console.error(err)
        alert(err.message || 'Erreur lors de la tentative de rejoindre/démarrer la partie')
      }
    },

    async submitScore(score) {
      // accept either an emitted score param or fallback to local input
      const raw = typeof score !== 'undefined' ? score : this.scoreInput
      if (raw === null || raw === undefined || raw === '') {
        alert('Entrez un score valide')
        return
      }
      const num = Number(raw)
      if (Number.isNaN(num)) {
        alert('Score doit être un nombre');
        return
      }

      try {
        await GameService.postScore(this.userId, num)
        this.scoreInput = ''
        await this.getGameState()
      } catch (e) {
        console.error(e)
        alert('Impossible d\'envoyer le score')
      }
    },

    async nextRound() {
      try {
        await GameService.nextRound()
        await this.getGameState()
      } catch (e) {
        console.error(e)
        alert('Impossible de passer au tour suivant')
      }
    },

    setupWebSocket() {
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
      const wsUrl = `${protocol}://${window.location.host}/ws`

      try {
        this.ws = new WebSocket(wsUrl)
      } catch (e) {
        console.warn('WebSocket init failed', e)
        return
      }

      this.ws.addEventListener('open', () => {
        this.wsConnected = true
        this.reconnectAttempts = 0
        console.log('WS connected')
      })

      this.ws.addEventListener('message', (ev) => {
        try {
          const msg = JSON.parse(ev.data)
          // On any game:update ping, refresh state
          if (msg && (msg.type === 'game:update' || msg.type === 'connected')) {
            this.getGameState()
          }
        } catch (e) {
          // ignore non-json messages
        }
      })

      this.ws.addEventListener('close', () => {
        this.wsConnected = false
        // attempt reconnect with backoff
        this.reconnectAttempts += 1
        const delay = Math.min(30000, 500 * this.reconnectAttempts)
        setTimeout(() => this.setupWebSocket(), delay)
      })

      this.ws.addEventListener('error', (e) => {
        // log and let close handler handle reconnect
        console.warn('WS error', e)
      })
    },

    async leaveGame() {
      try {
        await GameService.leaveGame(this.userId)
        // clear local player view
        await this.getGameState()
      } catch (e) {
        console.error(e)
        alert('Impossible de quitter la partie')
      }
    },

    leaveGameLocal() {
      // clear local player view without notifying server
      this.gameDto = null
    },

    async markReady() {
      try {
        await GameService.ready(this.userId)
        await this.getGameState()
      } catch (e) {
        console.error(e)
        alert('Impossible de confirmer la validation')
      }
    },

    async rejectScore() {
      try {
        await GameService.reject(this.userId)
        await this.getGameState()
      } catch (e) {
        console.error(e)
        alert('Impossible de rejeter le score')
      }
    },

    onInvalidScore() {
      alert('Score invalide — entrez un nombre')
    }
  },
  computed: {
    isGameRunning() {
      // return true if a game currently running based on gameDto
      return !!(this.gameDto && this.gameDto.status === 'running')
    },

    playerInGame() {
      if (!this.gameDto || !this.gameDto.players) return null
      return this.gameDto.players.find(p => p.id === this.userId) || null
    },

    playerHasSubmitted() {
      return this.playerInGame && typeof this.playerInGame.submittedScore === 'number'
    },

    isReady() {
      if (!this.gameDto || !this.gameDto.pendingRound) return false
      const ready = this.gameDto.pendingRound.ready || []
      return ready.includes(this.userId)
    },

    hasEnoughPlayers() {
      return this.gameDto && this.gameDto.players && this.gameDto.players.length >= 2
    },
    wsStatus() {
      if (this.wsConnected) return 'Connecté'
      return 'Déconnecté'
    }
  }
}
</script>

<template>
  <div class="grow w-full flex flex-col justify-center gap-2 overflow-hidden">
    <template v-if="!playerInGame">
      <h3 class="mt-5 font-[jaro] text-lg w-full">Qui joue ?</h3>
      <input type="text" v-model="username"
             placeholder="Entrez votre nom..." class="w-full rounded-full! px-4! z-20 relative mb-4">

      <button class="btn-main w-full py-2.5!" @click="joinGame" @keydown.enter="joinGame">
        {{ isGameRunning ? 'Rejoindre la partie' : 'Démarrer une partie' }}
        <i class="fa fa-play-circle ml-2"/>
      </button>
    </template>

    <div v-if="gameDto && playerInGame" class="bg-white p-3 gap-3 rounded-xl shadow w-full grow overflow-y-hidden flex flex-col">
      <div class="flex justify-between items-center">
        <strong>Partie {{gameDto.status === 'running' ? 'en cours' : 'terminée'}} (tour {{ gameDto.currentRound }})</strong>
        <span class="flex items-center gap-2 text-gray-500 text-xs">{{wsStatus}} <span class="h-1.5 w-1.5 rounded-full inline-block" :class="wsConnected ? 'bg-green-500' : 'bg-red-500'" /></span>
      </div>
      <!-- Player list component -->
      <PlayerList :players="gameDto.players" :userId="userId" :pending="gameDto.pendingRound"/>
      <!-- Rounds accordion showing previous rounds -->
      <RoundsAccordion :rounds="gameDto.rounds" :players="gameDto.players" :userId="userId" />

      <template v-if="!isGameRunning">
        <div class="text-sm mt-2">Partie terminée</div>
      </template>
      <template v-else-if="playerInGame">
        <!-- Score input or pending review are handled by components -->
        <div v-if="!gameDto.pendingRound && hasEnoughPlayers">
          <ScoreInput :initial="scoreInput" @submit="submitScore" @invalid="onInvalidScore"/>
        </div>

        <div v-else-if="hasEnoughPlayers">
          <PendingRoundReview :pending="gameDto.pendingRound" :userId="userId" :playersCount="gameDto.players.length"
                              @ready="markReady" @reject="rejectScore"/>
        </div>

        <div v-else>
          <div class="text-sm mt-2">En attente de plus de joueurs pour commencer la partie...</div>
        </div>
      </template>

      <div v-else class="text-sm mt-2">Vous n'êtes pas encore dans cette partie.</div>
    </div>
    <template v-if="playerInGame">
      <button v-if="isGameRunning" @click="leaveGame" class="btn-secondary w-full mt-2">Quitter la partie <i
          class="fa fa-person-through-window ml-2"/></button>
      <button v-else @click="leaveGameLocal" class="btn-secondary w-full mt-2">Accueil <i class="fa fa-home ml-2"/>
      </button>
    </template>
  </div>
  <router-link v-if="!playerInGame" to="/leaderboard" class="btn-secondary w-full mb-20">
    Leaderboard
    <i class="fa fa-medal ml-2"/>
  </router-link>
</template>

<style>

button {
  padding: 0.5rem 1rem;
  font-size: 1rem;
  cursor: pointer;
}

</style>
