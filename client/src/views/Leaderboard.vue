<template>
  <div class="w-full max-w-[600px] mx-auto px-4 py-5">
    <h1 class="text-2xl font-bold mb-4">Classement</h1>
    <div v-if="loading" class="text-center">Chargement...</div>
    <div v-if="error" class="text-red-500 text-center">{{ error }}</div>
    <div v-if="leaderboard.length > 0">
      <table class="w-full text-left border-collapse">
        <thead>
          <tr>
            <th class="border-b p-2">Joueur</th>
            <th class="border-b p-2 text-right">Score moyen</th>
            <th class="border-b p-2 text-right">Parties jouées</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="player in leaderboard" :key="player.userId">
            <td class="border-b p-2">{{ player.username }}</td>
            <td class="border-b p-2 text-right">{{ player.avgScore.toFixed(2) }}</td>
            <td class="border-b p-2 text-right">{{ player.gamesPlayed }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-else-if="!loading" class="text-center text-gray-500 mt-4">
      Aucune donnée de classement disponible.
    </div>
    <router-link to="/" class="btn-secondary mt-4 inline-block">Retour à l'accueil</router-link>
  </div>
</template>

<script>
import GameService from '../service/GameService'

export default {
  name: 'Leaderboard',
  data() {
    return {
      leaderboard: [],
      loading: true,
      error: null
    }
  },
  async created() {
    try {
      this.leaderboard = await GameService.getLeaderboard()
    } catch (e) {
      this.error = 'Impossible de charger le classement.'
      console.error(e)
    } finally {
      this.loading = false
    }
  }
}
</script>

