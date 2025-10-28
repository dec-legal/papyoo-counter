<template>
  <div class="text-center border py-8 px-2 rounded-md border-gray-300">
    <div v-if="playerScore">
      Votre score : <b>{{ playerScore.score }}</b>
      <span v-if="playerScore.autoFilled" class="text-sm text-gray-500"> (auto-calculé)</span>
    </div>

    <div class="mt-2 flex gap-2 justify-center">
      <!-- If the user is not ready (i.e. the auto-filled player), show action buttons -->
      <template v-if="!isReady">
        <button
          @click="$emit('ready')"
          class="btn-main">
          Valider le score
        </button>
        <button
          v-if="playerScore && playerScore.autoFilled"
          @click="$emit('reject')"
          class="btn-danger">
          Rejeter
        </button>
      </template>

      <!-- If the user is ready (submitted manually), show waiting message -->
      <div v-else class="text-sm">
        En attente de la validation du dernier joueur... ({{ pending.ready.length }}/{{ playersCount }} prêts)
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'PendingRoundReview',
  props: {
    pending: { type: Object, required: true },
    userId: { type: String, default: null },
    playersCount: { type: Number, default: 0 }
  },
  computed: {
    isReady() {
      if (!this.pending) return false
      return (this.pending.ready || []).includes(this.userId)
    },
    playerScore() {
      if (!this.pending || !this.pending.scores) return null
      return this.pending.scores.find(s => s.id === this.userId) || null
    }
  }
}
</script>

<style scoped>
ul { margin: 0; padding: 0; list-style: none; }
</style>
