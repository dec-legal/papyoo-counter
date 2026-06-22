<template>
  <div class="w-full max-w-[700px] mx-auto">
    <div v-if="loading" class="text-center">Chargement...</div>
    <div v-else-if="error" class="text-red-500 text-center">{{ error }}</div>

    <div v-else>
      <div class="flex items-center justify-between mb-4">
        <div>
          <div class="flex items-center gap-2 mb-1">
            <h1 class="text-2xl font-bold relative mb-1" style="line-height: 0.9em;">{{ stats.username || userId }}
              <i v-if="stats.rank === 1" class="text-xl fa fa-crown absolute text-yellow-500 rotate-45 -translate-x-2 -translate-y-1"></i>
            </h1>
            <!-- Pill affichant le rang global -->
            <span
              v-if="stats.rank && stats.totalPlayers"
              :class="[
                'px-2 ml-2 py-0.5 rounded-md text-sm font-semibold',
                stats.rank === 1 ? 'ml-4 bg-green-100 text-green-800 border border-green-300' :
                stats.rank === 2 ? 'bg-purple-200 text-purple-800 border border-purple-400' :
                stats.rank === 3 ? 'bg-amber-100 text-amber-800 border border-amber-300' :
                stats.rank === stats.totalPlayers ? 'bg-red-100 text-red-800 border border-red-300' :
                'bg-blue-100 text-blue-800 border border-blue-300'
              ]"
            >
              {{ formatGlobalRank(stats.rank) }} / {{ stats.totalPlayers }}
            </span>
          </div>

          <div class="text-sm text-gray-500">{{ stats.gamesPlayed || 0 }}
            parties jouées dont {{ stats.roundsPlayed }} rounds
          </div>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-2 mb-4">
        <div class="p-3 rounded-lg shadow-sm border border-gray-300 bg-white">
          <div class="text-xs text-gray-500">Indice de performance moyen</div>
          <div class="flex items-center gap-2">
            <div class="text-lg font-semibold">{{ formatPerf(stats.avgPerformance) }}</div>
            <div v-if="performanceTrend !== 'stable'" class="flex items-center">
              <i v-if="performanceTrend === 'up'" class="fa fa-arrow-trend-up text-green-500"></i>
              <i v-else-if="performanceTrend === 'down'" class="fa fa-arrow-trend-down text-red-500"></i>
            </div>
          </div>
          <div class="text-xs text-gray-400">(positif = mieux que la moyenne)</div>
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
      </div>


      <div class="mb-4">
        <h2 class="text-lg font-semibold mb-2">Dernières parties</h2>
        <div v-if="!stats.recentRounds || stats.recentRounds.length === 0" class="text-sm text-gray-500">Aucune partie
          trouvée
        </div>
        <div v-else class="space-y-2">
          <div v-for="g in groupedGames" :key="g.gameId"
               class="rounded-lg shadow-sm border border-gray-300 bg-white overflow-hidden">
            <!-- header clickable to toggle accordion -->
            <div
                class="flex items-center justify-between cursor-pointer select-none p-3 hover:bg-gray-50 transition-colors"
                role="button" tabindex="0" :aria-expanded="!!expanded[g.gameId]" @click="toggleGame(g.gameId)"
                @keydown.enter="toggleGame(g.gameId)" @keydown.space.prevent="toggleGame(g.gameId)"
                :aria-controls="'game-' + g.gameId">
              <div class="flex-1">
                <div class="flex items-center gap-3 mb-2">
                  <div class="text-sm font-medium text-gray-900">Partie {{ shortId(g.gameId) }}</div>
                  <div class="text-xs text-gray-500">{{ g.rounds.length }} rounds</div>
                  <div class="text-xs text-gray-400">{{ formatDate(g.latestAt) }}</div>
                </div>
                <div class="flex items-center gap-2">
                  <!-- Position badge -->
                  <div
                      :class="[
                         'px-2 py-0.5 rounded text-xs font-medium capitalize',
                         g.finalRank === 1 ? 'bg-green-100 text-green-700' :
                         g.finalRank === g.numPlayers ? 'bg-red-100 text-red-700' :
                         'bg-gray-200 text-gray-700'
                       ]"
                  >
                    {{ formatGlobalRank(g.finalRank, g.numPlayers) }}
                  </div>
                  <div
                      :class="[
                         'px-2 py-0.5 rounded text-xs font-medium',
                         g.avgPerformance >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                       ]"
                  >
                    {{ formatPerf(g.avgPerformance) }}
                  </div>
                </div>
              </div>
              <div class="flex items-center ml-2">
                <!-- simple chevron -->
                <svg :class="{ 'transform rotate-180': expanded[g.gameId] }"
                     class="w-5 h-5 transition-transform duration-150 text-gray-400" xmlns="http://www.w3.org/2000/svg"
                     fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                </svg>
              </div>
            </div>

            <!-- rounds list, hidden by default -->
            <div :id="'game-' + g.gameId" v-show="expanded[g.gameId]" class="bg-gray-50 border-t border-gray-200">
              <div v-for="(r, idx) in g.rounds" :key="g.gameId + '-' + r.roundNumber"
                   :class="['flex justify-between items-center px-3 py-2.5', idx !== 0 && 'border-t border-gray-200']">
                <div class="text-sm text-gray-700 flex items-center gap-2">
                  <span class="font-medium">Tour {{ r.roundNumber }}</span>
                  <span class="text-gray-500 italic">• {{ r.numPlayers }} joueurs</span>
                </div>
                <div class="flex items-center gap-3">
                   <span
                       :class="[
                       'text-xs font-medium px-1.5 py-0.5 rounded capitalize',
                       r.rank === 1 ? 'bg-green-100 text-green-700' :
                       r.rank === r.numPlayers ? 'bg-red-100 text-red-700' :
                       'bg-gray-200 text-gray-700'
                     ]"
                   >
                     {{ formatRank(r.rank, r.numPlayers) }}
                   </span>
                  <div class="font-medium text-sm text-gray-900">{{ r.score }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<script>
import StatsService from '../service/stats.js'
import dayjs from 'dayjs'
import 'dayjs/locale/fr'

dayjs.locale('fr')
export default {
  name: 'PlayerStats',
  props: {
    userId: {type: [String, Number], required: true}
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
        this.stats = await StatsService.getPlayerStats(this.userId)
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
      } catch {
        return ''
      }
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
          const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1))
          return Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7)
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
        this.expanded = {[gameId]: true}
      }
    },
    formatRank(rank, numPlayers) {
      if (rank === 1) return "1er"
      return `${rank}ème`
    },
    formatGlobalRank(rank, numPlayers) {
      if (rank === 1) return "1er"
      if (rank === numPlayers) return "dernier"
      return `${rank}ème`
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

        // Calculate average performance for the game
        const avgPerformance = rounds.reduce((sum, r) => sum + (r.performance || 0), 0) / rounds.length

        // Approximate cumulative rank: count how many rounds the player finished last vs first.
        // We only have this player's per-round rank, not all players' cumulative totals,
        // so we use the rank from the final round as the best available approximation.
        const numPlayers = rounds[0]?.numPlayers || 1
        const totalScore = rounds.reduce((sum, r) => sum + (r.score || 0), 0)
        // rank by total score: use the last round's rank field which reflects position in that round,
        // but recompute as a simple majority: if more rounds were rank 1 than last, show 1st, etc.
        const rankCounts = {}
        for (const r of rounds) {
          rankCounts[r.rank] = (rankCounts[r.rank] || 0) + 1
        }
        const dominantRank = Object.entries(rankCounts).sort((a, b) => b[1] - a[1])[0]?.[0]
        const finalRank = dominantRank ? Number(dominantRank) : (rounds[rounds.length - 1]?.rank || 1)

        return {gameId, rounds, latestAt, avgPerformance, finalRank, numPlayers}
      })
      // sort groups by latestAt desc
      groups.sort((a, b) => b.latestAt - a.latestAt)
      return groups
    },
    performanceTrend() {
      const games = this.groupedGames
      if (!games || games.length < 2) return 'stable'

      // Compare the most recent game against the average of all prior games (up to 5).
      // groupedGames is sorted newest-first.
      const window = games.slice(0, Math.min(6, games.length))
      const newerGame = window[0]
      const olderGames = window.slice(1)

      const avgOlder = olderGames.reduce((sum, g) => sum + (g.avgPerformance || 0), 0) / olderGames.length
      const diff = (newerGame.avgPerformance || 0) - avgOlder

      if (diff > 0.05) return 'up'
      if (diff < -0.05) return 'down'
      return 'stable'
    }
  }
}
</script>

<style scoped>
</style>
