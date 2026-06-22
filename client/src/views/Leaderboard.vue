<template>
  <div class="w-full max-w-[600px] mx-auto">
    <h1 class="text-2xl font-bold mb-4">Classement</h1>
    <div class="mb-5">
      <div class="leaderboard-toggle">
        <span class="leaderboard-toggle__indicator" :style="toggleIndicatorStyle"></span>
        <button
          type="button"
          class="leaderboard-toggle__option no-style"
          :class="{ 'is-active': mode === 'monthly' }"
          @click="setMode('monthly')"
        >Mensuel</button>
        <button
          type="button"
          class="leaderboard-toggle__option no-style"
          :class="{ 'is-active': mode === 'all-time' }"
          @click="setMode('all-time')"
        >Tout les temps</button>
      </div>
      <div v-if="mode === 'monthly'" class="month-selector">
        <button type="button" class="month-selector__btn" @click="changeMonth(-1)">
          &larr;
        </button>
        <span class="month-selector__label">{{ formattedMonth }}</span>
        <button
          type="button"
          class="month-selector__btn"
          :disabled="isCurrentMonth"
          @click="changeMonth(1)"
        >&rarr;</button>
      </div>
      <div v-else class="month-selector__label text-center text-gray-600 mt-4">Classement global</div>
    </div>
    <div v-if="loading" class="text-center">Chargement...</div>
    <div v-if="error" class="text-red-500 text-center">{{ error }}</div>
    <div v-if="leaderboard.length > 0">
      <div class="overflow-hidden rounded-lg bg-white border-gray-300 border shadow-sm">
        <table class="w-full text-left border-collapse">
          <thead>
          <tr class="bg-gray-100 border-b border-gray-300">
            <th class="p-2">Joueur</th>
            <th class="p-2 text-right">Indice perf</th>
            <th class="p-2 text-right">Rounds joués</th>
          </tr>
          </thead>
          <tbody>
          <tr v-for="(player, index) in leaderboard" :key="player.userId" class="hover:bg-gray-50 not-last:border-b border-gray-200" :class="{'font-bold!' : isCurrentPlayer(player)}">
            <td class="p-2 relative">
              <router-link
                  :to="{ name: 'PlayerStats', params: { userId: player.userId } }"
                  class="text-black!"
              >
                {{ index + 1 + ". " + player.username }}
              </router-link>
              <i v-if="index === 0" class="text-sm fa fa-crown absolute text-yellow-500 rotate-12 -translate-x-2 -translate-y-1"></i>
            </td>
            <td class="p-2 text-right">{{ formatPerf(player.avgPerformance) }}</td>
            <td class="p-2 text-right">{{ player.roundsPlayed }}</td>
          </tr>
          </tbody>
        </table>
      </div>
      <div class="text-xs text-gray-500 mt-2">Indice : indicateur de performance centré sur le score attendu (250 / nombre de joueurs). Positif = mieux que la moyenne, négatif = moins bien. L'amplitude dépend du nombre de joueurs par partie.</div>
    </div>
    <div v-else-if="!loading" class="text-center text-gray-500 mt-4">
      Aucune donnée de classement disponible.
    </div>
  </div>
</template>

<script>
import StatsService from '../service/stats.js'

export default {
  name: 'Leaderboard',
  data() {
    return {
      leaderboard: [],
      loading: true,
      error: null,
      mode: 'monthly',
      selectedYear: new Date().getFullYear(),
      selectedMonth: new Date().getMonth()
    }
  },
  computed: {
    formattedMonth() {
      const label = new Date(this.selectedYear, this.selectedMonth).toLocaleString('fr-FR', { month: 'long', year: 'numeric' })
      return label.charAt(0).toUpperCase() + label.slice(1)
    },
    isCurrentMonth() {
      const now = new Date()
      return this.selectedYear === now.getFullYear() && this.selectedMonth === now.getMonth()
    },
    toggleIndicatorStyle() {
      return {
        transform: this.mode === 'monthly' ? 'translateX(0%)' : 'translateX(100%)'
      }
    }
  },
  mounted() {
    let storedId = localStorage.getItem('userId')
    if(storedId) this.$root.userId = storedId
    const savedMode = localStorage.getItem('leaderboardMode')
    if (savedMode === 'monthly' || savedMode === 'all-time') {
      this.mode = savedMode
    }
    this.load()
  },
  methods: {
    async load() {
      this.loading = true
      this.error = null
      try {
        const options = { mode: this.mode }
        if (this.mode === 'monthly') {
          options.year = this.selectedYear
          options.month = this.selectedMonth + 1
        }
        this.leaderboard = await StatsService.getLeaderboard(options)
      } catch (e) {
        console.error(e)
        this.error = 'Impossible de charger le classement.'
      } finally {
        this.loading = false
      }
    },
    formatPerf(v) {
      // Ensure we have a number; show as percentage (may exceed -100% for very poor results)
      const num = (typeof v === 'number' && Number.isFinite(v)) ? v : 0
      return (num * 100).toFixed(1) + '%'
    },
    isCurrentPlayer(player) {
      const currentUserId = this.$root.userId || null
      return currentUserId && player.userId === currentUserId
    },
    setMode(newMode) {
      if (this.mode === newMode) return
      this.mode = newMode
      // save to local storage
      localStorage.setItem('leaderboardMode', newMode)
      this.load()
    },
    changeMonth(direction) {
      if (this.mode !== 'monthly') return
      if (direction > 0 && this.isCurrentMonth) return
      const nextDate = new Date(this.selectedYear, this.selectedMonth + direction, 1)
      this.selectedYear = nextDate.getFullYear()
      this.selectedMonth = nextDate.getMonth()
      this.load()
    },
  }
}
</script>

<style scoped>
.leaderboard-toggle {
  position: relative;
  display: flex;
  border: 2px solid #d4d4d4;
  border-radius: 9999px;
  overflow: hidden;
  background: #ffffff;
}

.leaderboard-toggle__indicator {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  width: 50%;
  border-radius: 9999px;
  background-color: #0a0a0a;
  transition: transform 0.25s ease;
  z-index: 0;
  pointer-events: none;
}

.leaderboard-toggle__option {
  position: relative;
  z-index: 1;
  flex: 1;
  padding: 0.55rem 1.4rem;
  text-align: center;
  font-weight: 600;
  color: #4b5563;
  transition: color 0.2s ease;
}

.leaderboard-toggle__option:not(.is-active):hover {
  color: #0a0a0a;
}

.leaderboard-toggle__option.is-active {
  color: #ffffff;
}

.month-selector {
  margin-top: 0.9rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.month-selector__btn {
  padding: 0.45rem 1.2rem;
  border: 2px solid #d4d4d4;
  border-radius: 9999px;
  background-color: #ffffff;
  color: #1f2933;
  font-weight: 500;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.month-selector__btn:hover:not(:disabled) {
  background-color: #f3f4f6;
}

.month-selector__btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.month-selector__label {
  flex: 1;
  text-align: center;
  font-weight: 600;
  color: #1f2933;
}
</style>
