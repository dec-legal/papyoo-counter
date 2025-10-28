<template>
  <div class="border-1 rounded-md overflow-hidden min-h-fit border-gray-300 shadow-sm">
    <table class="w-full text-left">
      <thead>
      <tr class="border-b bg-gray-100 border-gray-300 sticky top-0">
        <th class="py-2 px-2">Joueur</th>
        <th v-if="showLastColumn" class="py-2 px-2">Score</th>
        <th class="py-2 px-2 text-center!">Total</th>
      </tr>
      </thead>
      <tbody>
      <tr v-for="p in sortedPlayers" :key="p.id" class="hover:bg-gray-50 not-last:border-b border-gray-300" :class="{'font-bold!': p.id===userId}">
        <td class="py-2 px-2">
          {{ p.username }} <small v-if="p.id===userId">(Vous)</small>
        </td>
        <td v-if="showLastColumn" class="py-2 px-2">
          <span>
            {{ isPlayerScoreAutoFilled(p.id) ? "Calculé" : "Soumis" }}: <span :class="{'font-bold': p.id===userId}">{{ p.submittedScore }}</span>
          </span>
        </td>
        <td class="py-2 px-2 text-center">{{ p.totalScore || 0 }}</td>
      </tr>
      </tbody>
    </table>
  </div>
</template>

<script>
export default {
  name: 'PlayerList',
  props: {
    players: {
      type: Array,
      default: () => []
    },
    pending: {
      type: Object,
      default: () => ({})
    },
    userId: {
      type: String,
      default: null
    }
  },
  computed: {
    sortedPlayers() {
      return this.players.slice().sort((a, b) => a.totalScore - b.totalScore)
    },
    showLastColumn() {
      return this.players.some(p => p.submittedScore !== null && typeof p.submittedScore !== 'undefined')
    }
  },
  methods: {
    isPlayerScoreAutoFilled(playerId) {
      if (!this.pending || !this.pending.scores) return false
      const scoreEntry = this.pending.scores.find(s => s.id === playerId)
      return scoreEntry ? !!scoreEntry.autoFilled : false
    }
  }
}
</script>

<style scoped>
/* Remplace les styles de liste par des styles de tableau simples */
table { width: 100%; border-collapse: collapse; }
thead th { text-align: left; }
th, td { padding: 0.5rem 0.5rem; }
</style>
