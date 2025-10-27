<template>
  <div class="w-full max-w-[700px] mx-auto overflow-y-auto">
    <div v-if="loading" class="text-center">Chargement...</div>
    <div v-else-if="error" class="text-red-500 text-center">{{ error }}</div>

    <div v-else>
      <div class="flex items-center justify-between mb-4">
        <div>
          <h1 class="text-2xl font-bold">{{ stats.username || userId }}</h1>
          <div class="text-sm text-gray-500">{{ stats.roundsPlayed }} rounds joués • {{ stats.gamesPlayed || 0 }} parties jouées</div>
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
        <h2 class="text-lg font-semibold mb-2">Dernières parties</h2>
        <div v-if="!stats.recentRounds || stats.recentRounds.length === 0" class="text-sm text-gray-500">Aucune partie trouvée</div>
        <div v-else class="space-y-4">
          <div v-for="g in groupedGames" :key="g.gameId" class="p-3 rounded-lg shadow-sm border border-gray-300 bg-white">
            <!-- header clickable to toggle accordion -->
            <div class="flex items-center justify-between cursor-pointer select-none" role="button" tabindex="0" :aria-expanded="!!expanded[g.gameId]" @click="toggleGame(g.gameId)" @keydown.enter="toggleGame(g.gameId)" @keydown.space.prevent="toggleGame(g.gameId)" :aria-controls="'game-' + g.gameId">
               <div>
                 <div class="text-sm text-gray-500">Partie {{ shortId(g.gameId) }} • {{ g.rounds.length }} rounds</div>
                 <div class="text-xs text-gray-400">Dernier round: {{ formatDate(g.latestAt) }}</div>
               </div>
               <div class="flex items-center ml-2">
                 <!-- simple chevron -->
                 <svg :class="{ 'transform rotate-180': expanded[g.gameId] }" class="w-5 h-5 transition-transform duration-150 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                 </svg>
               </div>
             </div>

            <!-- rounds list, hidden by default -->
            <div :id="'game-' + g.gameId" v-show="expanded[g.gameId]" class="space-y-1 pt-1">
               <div v-for="r in g.rounds" :key="g.gameId + '-' + r.roundNumber" class="flex justify-between items-center py-1 border-t border-gray-100">
                 <div class="text-sm text-gray-700">Tour {{ r.roundNumber }} • {{ r.numPlayers }} joueurs</div>
                 <div class="font-medium">Score: {{ r.score }}</div>
               </div>
             </div>
           </div>
         </div>
      </div>

    </div>
  </div>
</template>

<script>
import GameService from '../service/GameService'
import dayjs from 'dayjs'
import 'dayjs/locale/fr'

dayjs.locale('fr')
export default {
  name: 'PlayerStats',
  props: {
    userId: { type: [String, Number], required: true }
  },
  data() {
    return {
      stats: {},
      loading: true,
      error: null,
      expanded: {} // track expanded state of each gameId
    }
  },
  async mounted() {
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
    shortId(s) {
      if (!s) return ''
      try {
        const str = String(s)
        return str.length > 8 ? str.slice(0, 8) : str
      } catch { return '' }
    },
    formatDate(ts) {
      if (!ts) return ''

      try {
        const d = dayjs(ts)
        if (!d.isValid()) return ''

        const now = dayjs()
        const startOfDay = (date) => dayjs(date).startOf('day')
        const diffDays = startOfDay(now).diff(startOfDay(d), 'day')

        // today
        if (diffDays === 0) return `aujourd'hui à ${d.format('HH[h]mm')}`
        // yesterday
        if (diffDays === 1) return `hier à ${d.format('HH[h]mm')}`

        // helper ISO week number
        const getISOWeek = (date) => {
          const tmp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
          tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7))
          const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(),0,1))
          return Math.ceil((((tmp - yearStart) / 86400000) + 1)/7)
        }

        // within last 6 days -> weekday (add " dernier" if in previous ISO week)
        if (diffDays >= 2 && diffDays <= 6) {
          const wd = d.format('dddd')
          const weekNow = getISOWeek(now.toDate())
          const weekThen = getISOWeek(d.toDate())
          const suffix = weekThen < weekNow ? ' dernier' : ''
          return `${wd}${suffix} à ${d.format('HH[h]mm')}`
        }

        // older -> full date
        return `le ${d.format('D MMMM')} à ${d.format('HH[h]mm')}`
      } catch {
        return ''
      }
    },
    toggleGame(gameId) {
      // Accordion behavior: opening one closes the others.
      const currently = !!this.expanded[gameId]
      if (currently) {
        // closing current -> all collapsed
        this.expanded = {}
      } else {
        // open the selected and close others
        this.expanded = { [gameId]: true }
      }
    }
  },
  computed: {
    groupedGames() {
      const rounds = this.stats && Array.isArray(this.stats.recentRounds) ? this.stats.recentRounds : []
      const map = new Map()
      for (const r of rounds) {
        const gid = r.gameId || 'unknown'
        if (!map.has(gid)) map.set(gid, [])
        map.get(gid).push(r)
      }
      const groups = Array.from(map.entries()).map(([gameId, rounds]) => {
        // sort rounds by roundNumber ascending
        rounds.sort((a, b) => (a.roundNumber || 0) - (b.roundNumber || 0))
        const latestAt = rounds.reduce((mx, rr) => {
          const t = rr.finalizedAt ? new Date(rr.finalizedAt).getTime() : 0
          return Math.max(mx, t)
        }, 0)
        return { gameId, rounds, latestAt }
      })
      // sort groups by latestAt desc
      groups.sort((a, b) => b.latestAt - a.latestAt)
      return groups
    }
  }
}
</script>

<style scoped>
</style>
