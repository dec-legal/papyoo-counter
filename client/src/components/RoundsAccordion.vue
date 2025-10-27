<template>
  <div class="rounded-lg overflow-y-auto grow">
    <div v-if="!rounds || rounds.length === 0"></div>

    <div v-else class="flex flex-col gap-0.5">
      <div v-for="(r, idx) in sortedRounds" :key="r.roundNumber" class="bg-gray-100 rounded">
        <div @click="toggle(idx)" class="w-full text-left p-3 flex justify-between items-center hover:bg-gray-100">
          <span class="flex">
            <span class="block">
              <strong>Tour {{ r.roundNumber }}</strong>
            </span>
          </span>
          <span class="text-sm text-gray-600">{{ (r.scores || []).length }} joueurs <i class="fa fa-chevron-down ml-2 duration-300" :class="{'rotate-180' : openIndex === idx}"></i></span>

        </div>

        <div v-show="openIndex === idx" class="m-2 rounded-md overflow-hidden border border-gray-300 shadow-sm">
          <table class="w-full text-left">
            <thead>
              <tr class="border-b bg-gray-100 border-b-gray-200">
                <th class="py-2 px-2">Joueur</th>
                <th class="py-2 px-2">Score</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in sortedScores(r)" :key="s.id + '-' + s.score" :class="['hover:bg-gray-50 bg-white', (s.id === userId) ? 'font-semibold' : '', 'not-last:border-b border-gray-200']">
                <td class="py-2 px-2">{{ s.username || lookupUsername(s.id) || s.id }}</td>
                <td class="py-2 px-2">{{ s.score }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'RoundsAccordion',
  props: {
    rounds: { type: Array, default: () => [] },
    players: { type: Array, default: () => [] }, // optional, to map ids -> usernames
    userId: { type: [String, Number], default: null }
  },
  data() {
    return {
      openIndex: null
    }
  },
  computed: {
    // show newest first
    sortedRounds() {
      return (this.rounds || []).slice().sort((a, b) => b.roundNumber - a.roundNumber)
    }
  },
  methods: {
    toggle(idx) {
      this.openIndex = this.openIndex === idx ? null : idx
    },
    lookupUsername(id) {
      const p = (this.players || []).find(x => x.id === id)
      return p ? p.username : null
    },
    formatDate(ts) {
      if (!ts) return ''
      try {
        const d = typeof ts === 'number' ? new Date(ts) : new Date(ts)
        return d.toLocaleString()
      } catch (e) {
        return ''
      }
    },
    // return scores sorted by numeric score ascending (lower is better)
    sortedScores(round) {
      if (!round || !round.scores) return []
      return round.scores.slice().sort((a, b) => Number(a.score) - Number(b.score))
    }
  }
}
</script>

<style scoped>
table { width: 100%; border-collapse: collapse; }
th, td { padding: 0.5rem 0.5rem; }
</style>
