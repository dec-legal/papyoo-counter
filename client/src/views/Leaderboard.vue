<template>
  <div class="w-full max-w-[600px] mx-auto">
    <h1 class="text-2xl font-bold mb-4">Classement</h1>
    <div v-if="loading" class="text-center">Chargement...</div>
    <div v-if="error" class="text-red-500 text-center">{{ error }}</div>
    <div v-if="leaderboard.length > 0">
      <div class="overflow-hidden rounded-lg bg-white border-gray-300 border shadow-sm">
        <table class="w-full text-left border-collapse">
          <thead>
          <tr class="bg-gray-100 border-b border-gray-300">
            <th class="p-2">Joueur</th>
            <th class="p-2 text-right">Indice perf</th>
            <th class="p-2 text-right">Rounds</th>
          </tr>
          </thead>
          <tbody>
          <tr v-for="(player, index) in leaderboard" :key="player.userId" class="hover:bg-gray-50 not-last:border-b border-gray-200" :class="{'font-bold!' : isCurrentPlayer(player)}">
            <td class="p-2">
              <router-link
                  :to="{ name: 'PlayerStats', params: { userId: player.userId } }"
                  class="text-black!"
              >
                {{ index + 1 + ". " + player.username }}
              </router-link></td>
            <td class="p-2 text-right">{{ formatPerf(player.avgPerformance) }}</td>
            <td class="p-2 text-right">{{ player.gamesPlayed }}</td>
          </tr>
          </tbody>
        </table>
      </div>
      <div class="text-xs text-gray-500 mt-2">Indice : indicateur de performance, 100% revient à prendre zero points à tous les rounds, -100% revient à prendre 250 points à tous les rounds.</div>
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
      error: null
    }
  },
  mounted() {
    let storedId = localStorage.getItem('userId')
    if(storedId) this.$root.userId = storedId
  },
  async created() {
    this.load()
  },
  methods: {
    async load() {
      this.loading = true
      this.error = null
      try {
        this.leaderboard = await StatsService.getLeaderboard()
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
    }
  }
}
</script>
