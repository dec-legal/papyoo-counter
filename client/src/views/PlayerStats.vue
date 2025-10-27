<template>
  <div class="w-full max-w-[700px] mx-auto overflow-y-auto">
    <div v-if="loading" class="text-center">Chargement...</div>
    <div v-else-if="error" class="text-red-500 text-center">{{ error }}</div>

    <div v-else>
      <div class="flex items-center justify-between mb-4">
        <div>
          <h1 class="text-2xl font-bold">{{ stats.username || userId }}</h1>
          <div class="text-sm text-gray-500">{{ stats.roundsPlayed }} rounds joués</div>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-2 mb-4">
        <div class="p-3 rounded-lg shadow-sm border border-gray-300 bg-white">
          <div class="text-xs text-gray-500">Indice de performance moyen</div>
          <div class="text-lg font-semibold">{{ formatPerf(stats.avgPerformance) }}</div>
          <div class="text-xs text-gray-400">(plus élevé = mieux)</div>
        </div>

        <div class="p-3 rounded-lg shadow-sm border border-gray-300 bg-white">
          <div class="text-xs text-gray-500">Score moyen</div>
          <div class="text-lg font-semibold">{{ stats.avgScore ? Number(stats.avgScore).toFixed(1) : '-' }}</div>
        </div>

        <div class="p-3 rounded-lg shadow-sm border border-gray-300 bg-white">
          <div class="text-xs text-gray-500">Plis à 0</div>
          <div class="text-lg font-semibold">{{ stats.zeros || 0 }}</div>
        </div>

        <div class="p-3 rounded-lg shadow-sm border border-gray-300 bg-white">
          <div class="text-xs text-gray-500">Plis à 250</div>
          <div class="text-lg font-semibold">{{ stats.fulls || 0 }}</div>
        </div>

        <div class="p-3 col-span-2 rounded-lg shadow-sm border border-gray-300 bg-white">
          <div class="text-sm text-gray-500 mb-2">Performance (meilleure / pire)</div>
          <div class="flex gap-4 items-center">
            <div class="text-lg font-semibold">Meilleure: {{ formatPerf(stats.bestPerformance) }}</div>
            <div class="text-lg font-semibold">Pire: {{ formatPerf(stats.worstPerformance) }}</div>
          </div>
        </div>
      </div>



      <div class="mb-4">
        <h2 class="text-lg font-semibold mb-2">Derniers rounds</h2>
        <div v-if="!stats.recentRounds || stats.recentRounds.length === 0" class="text-sm text-gray-500">Aucun round trouvé</div>
        <div v-else class="space-y-2">
          <div v-for="r in stats.recentRounds" :key="r.roundNumber + '-' + r.finalizedAt" class="p-3 rounded-lg shadow-sm border border-gray-300 bg-white">
            <div class="flex justify-between">
              <div>
                <div class="text-sm text-gray-500">Tour {{ r.roundNumber }} — {{ r.numPlayers }} joueurs</div>
                <div class="font-semibold">Score: {{ r.score }} — {{ formatPerf(r.performance) }}</div>
              </div>
              <div class="text-xs text-gray-400">{{ formatDate(r.finalizedAt) }}</div>
            </div>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<script>
import GameService from '../service/GameService'
export default {
  name: 'PlayerStats',
  props: {
    userId: { type: [String, Number], required: true }
  },
  data() {
    return {
      stats: {},
      loading: true,
      error: null
    }
  },
  async created() {
    await this.load()
  },
  methods: {
    async load() {
      this.loading = true
      this.error = null
      try {
        this.stats = await GameService.getPlayerStats(this.userId)
      } catch (e) {
        console.error(e)
        this.error = 'Impossible de charger les statistiques du joueur.'
      } finally {
        this.loading = false
      }
    },
    formatPerf(v) {
      const num = (typeof v === 'number' && Number.isFinite(v)) ? v : 0
      return (num * 100).toFixed(1) + '%'
    },
    formatDate(ts) {
      if (!ts) return ''

      try { return new Date(ts).toLocaleString() } catch { return '' }
    }
  }
}
</script>

<style scoped>
.btn-secondary { padding: 0.4rem 0.7rem; background:#eef2f7; border-radius:0.4rem; }
</style>

