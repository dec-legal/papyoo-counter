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
    },
    dealerInfo() {
      const roundNum = this.gameDto ? this.gameDto.currentRound : 0
      const playerCount = this.gameDto && this.gameDto.players ? this.gameDto.players.length : 0

      // afficher "donner à la x eme personne à votre gauche" puis "donner à la personne en face si playerCount % 2" puis "donner à la x eme personne à votre droite"
      if (playerCount < 2) return null

      // ajouter un tour "garder ses cartes" après avoir donné à tous les joueurs
      const cycleLen = playerCount + 1
      const dealerOffset = (roundNum - 1) % cycleLen

      if (dealerOffset === playerCount) {
        return null; // garder ses cartes
      }

      if (dealerOffset === 0) {
        return `à la personne à votre gauche`
      } else if (playerCount % 2 === 0 && dealerOffset === playerCount / 2) {
        return `à la personne en face de vous`
      } else if (dealerOffset < playerCount / 2) {
        return `à la ${dealerOffset + 1}ème personne à votre gauche`
      } else {
        const rightOffset = playerCount - dealerOffset
        if (rightOffset === 1) {
          return `à la personne à votre droite`
        }
        return `à la ${rightOffset}ème personne à votre droite`
      }
    },
    cardCount(){
      const cardCountsToGive = [5, 5, 4, 3, 3, 3, 2, 2, 1]
      const playerCount = this.gameDto && this.gameDto.players ? this.gameDto.players.length : 0
      return cardCountsToGive[playerCount - 2] || 1
    }
  }
}
</script>

<template>
  <div class="grow w-full flex flex-col justify-center gap-2 min-h-0">
    <template v-if="!playerInGame">
      <h3 class="mt-5 font-[jaro] text-lg w-full">Qui joue ?</h3>
      <input type="text" v-model="username"
             placeholder="Entrez votre nom..." class="w-full rounded-full! px-4! z-20 relative mb-4">

      <button class="btn-main w-full py-2.5!" @click="joinGame" @keydown.enter="joinGame">
        {{ isGameRunning ? 'Rejoindre la partie' : 'Démarrer une partie' }}
        <i class="fa fa-play-circle ml-2"/>
      </button>
    </template>
    <div v-if="playerInGame && isGameRunning" class="flex gap-2">
      <button @click="leaveGame" class="btn-secondary btn-danger grow px-2! py-1!">Quitter la partie <i
          class="fa fa-person-through-window ml-2 mt-1"/></button>
      <router-link to="/leaderboard" class="btn-secondary grow px-2! py-1!">
        Leaderboard
        <i class="fa fa-medal ml-2"/>
      </router-link>
    </div>

    <div v-if="gameDto && playerInGame"
         class="bg-white rounded-xl shadow w-full grow overflow-y-auto flex flex-col flex-1">

      <div class="flex justify-between items-center sticky top-0 bg-white p-3 z-10">
        <strong>Partie {{ gameDto.status === 'running' ? 'en cours' : 'terminée' }} (tour {{
            gameDto.currentRound
          }})</strong>
        <span class="flex items-center gap-1.5 text-gray-500 text-xs">{{ wsStatus }} <span
            class="h-1.5 w-1.5 rounded-full inline-block" :class="wsConnected ? 'bg-green-400' : 'bg-red-400'"/></span>
      </div>

      <!-- Dealer information -->
      <div v-if="isGameRunning" class="bg-blue-50 border border-blue-200 rounded-lg p-3 mx-3 mb-3 text-sm">
        <div class="flex items-center gap-3">
          <i class="fa fa-hand-holding text-blue-600 pb-2"></i>
          <div>
            <strong class="text-blue-800">Distribution :</strong>
            <span class="text-blue-700" v-if="dealerInfo"> Donnez {{cardCount}} cartes {{ dealerInfo }}</span>
            <span class="text-blue-700" v-else> Gardez vos cartes ce tour-ci.</span>
          </div>
        </div>
      </div>

      <!-- Player list component -->
      <PlayerList :players="gameDto.players" :userId="userId" :pending="gameDto.pendingRound" class="mx-3 mb-3"/>
      <div v-if="!hasEnoughPlayers" class="text-sm mt-2 mx-3">En attente de plus de joueurs pour commencer la partie...</div>
      <!-- Rounds accordion showing previous rounds -->
      <RoundsAccordion :rounds="gameDto.rounds" :players="gameDto.players" :userId="userId" class="mx-3"/>

      <template v-if="!isGameRunning">
        <div class="mt-2 flex grow items-center w-full flex-col justify-center gap-10">
          Partie terminée
          <div class="flex gap-3">
            <button @click="leaveGameLocal" class="btn-secondary grow">Accueil<i class="fa fa-home ml-2"/></button>
            <router-link to="/leaderboard" class="btn-secondary grow">
              Leaderboard
              <i class="fa fa-medal ml-2"/>
            </router-link>
          </div>
        </div>
      </template>
      <template v-else-if="playerInGame">
        <div class="grow"/>
        <!-- Score input or pending review are handled by components -->
        <div v-if="!gameDto.pendingRound && hasEnoughPlayers" class="sticky bottom-0 p-3 bg-white">
          <ScoreInput :initial="scoreInput" @submit="submitScore" @invalid="onInvalidScore"/>
        </div>

        <div v-else-if="hasEnoughPlayers" class="sticky bottom-0 bg-white p-3 shadow shadow-lg shadow-black">
          <PendingRoundReview :pending="gameDto.pendingRound" :userId="userId" :playersCount="gameDto.players.length"
                              @ready="markReady" @reject="rejectScore" />
        </div>
      </template>
      <div v-else class="text-sm mt-2">Vous n'êtes pas encore dans cette partie.</div>
    </div>
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
