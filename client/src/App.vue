<script>
import playerService from "./service/playerService.js";

export default {
  name: 'App',
  data() {
    return {
      message: '',
      players: [],
      suggestions: [],
      newPlayerName: ''
    }
  },
  mounted() {
    this.fetchPlayers();
  },
  methods: {
    fetchPlayers() {
      playerService.getPlayers().then((players) => {
        this.players = players;
      })
    },
    async createPlayer() {
      if (this.newPlayerName.trim() === '') return;
      await playerService.addPlayer(this.newPlayerName);
      this.newPlayerName = '';
      this.fetchPlayers();

      await this.$nextTick(() => {
        this.$refs.newPlayerInput.focus();
      });
    },
    async enablePlayer(id) {
      await playerService.enablePlayer(id);
      this.fetchPlayers();
      this.suggestions = [];
      this.newPlayerName = '';

      await this.$nextTick(() => {
        this.$refs.newPlayerInput.focus();
      });
    },
    getSuggestions(value) {
      playerService.getSuggestions(value).then((suggestions) => {
        this.suggestions = suggestions;
      })
    },
    async disablePlayer(id) {
      await playerService.disablePlayer(id);
      this.fetchPlayers();
    },
    focusSuggestion() {
      this.$nextTick(() => {
        if (this.suggestions.length > 0) {
          this.$refs['suggestion_0'][0].focus();
        }
      });
    }
  },
  watch: {
    newPlayerName(value) {
      if (value.trim() === '') {
        this.suggestions = [];
        return;
      }
      this.getSuggestions(value);
    }
  }
}
</script>

<template>
  <main>
    <h1>Papayoo counter</h1>
    <h3 class="mt-20 mb-2 text-left">Players</h3>
    <div class="flex flex-col gap-2 mb-2">
      <div v-for="player in players" class="flex justify-between items-center gap-2" :key="player.id">
        <p class="bg-gray-200 w-full text-left py-1 px-2 rounded">{{ player.username }}</p>
        <button class="no-style px-3! hover:bg-gray-100! h-full!" @click="disablePlayer(player.id)">x</button>
      </div>
    </div>
    <div class="flex gap-2 w-full">
      <div class="relative">
        <input ref="newPlayerInput" type="text" v-model="newPlayerName" @keydown.enter="createPlayer" @keydown.down="focusSuggestion"
               placeholder="Entrez le nom d'un joueur..." class="w-80">
        <div v-if="suggestions.length > 0" class="absolute top flex flex-col gap-1 w-full mt-1 bg-gray-300 p-1 rounded-md">
          <div tabindex="0"
               :ref="'suggestion_' + index"
               class="bg-gray-100 text-black px-2 py-1 w-full text-left rounded-sm hover:bg-gray-200 cursor-pointer"
               v-for="(suggestion, index) in suggestions" @click="enablePlayer(suggestion.id)"
               @keydown.enter="enablePlayer(suggestion.id)">{{ suggestion.username }}
          </div>
        </div>
      </div>
      <button @click="createPlayer">Add player</button>
    </div>
  </main>
</template>

<style>
main {
  font-family: Arial, sans-serif;
  text-align: center;
  padding: 2rem;
}

button {
  padding: 0.5rem 1rem;
  font-size: 1rem;
  cursor: pointer;
}
</style>
