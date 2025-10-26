<template>
  <div class="mt-3 text-center border py-8 rounded">
    <div>Votre score : <b>{{playerScore.score}}</b></div>
    <div class="mt-2 flex gap-2">
      <!-- If the current user's score was auto-filled, show a validation button for them -->
      <button
        v-if="!isReady"
        @click="$emit('ready')"
        :disabled="isReady"
        class="btn-main mx-auto">
        Valider le score calculé
      </button>
      <div v-else class="text-sm">
        En attente des autres joueurs ({{pending.ready.length}}/{{playersCount}} prêts)
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
