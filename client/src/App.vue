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
  <main class="w-full flex flex-col items-center px-4 pt-5 gap-2 h-full">
    <img src="@assets/tallLogo.png" alt="" width="300">
    <h3 class="mt-5 font-[jaro] text-lg w-full">Qui joue ?</h3>
    <div class="flex flex-col gap-0.5 w-full rounded-2xl max-h-[400px] overflow-y-auto">
      <div v-for="player in players" class="flex justify-between items-center bg-white gap-2 py-3 px-3 rounded" :key="player.id">
        <span class="pfp">{{ player.username[0].toUpperCase() }}</span>
        <p class=" w-full font-medium">{{ player.username }}</p>
        <div class="px-2 hover:bg-gray-100 h-full cursor-pointer" @click="disablePlayer(player.id)">
          <i class="fas fa-trash-can"></i>
        </div>
      </div>
    </div>
    <div class="flex gap-2 w-full">
      <div class="relative w-full">
        <input ref="newPlayerInput" type="text" v-model="newPlayerName" @keydown.enter="createPlayer" @keydown.down="focusSuggestion"
               placeholder="Entrez le nom d'un joueur..." class="w-full rounded-full! px-4! z-20 relative">

        <div v-if="suggestions.length > 0" class="absolute top-0 pt-11 z-10 flex flex-col gap-1 w-full mt-1 bg-gray-300 p-1 rounded-2xl">
          <div tabindex="0"
               :ref="'suggestion_' + index"
               class="bg-gray-100 text-black px-3 py-1.5 w-full rounded-xl hover:bg-gray-200 cursor-pointer"
               v-for="(suggestion, index) in suggestions" @click="enablePlayer(suggestion.id)"
               @keydown.enter="enablePlayer(suggestion.id)">{{ suggestion.username }}
          </div>
        </div>

      </div>
      <button @click="createPlayer" class="btn-main">Ajouter</button>
    </div>
    <div class="grow w-60 flex flex-col justify-center gap-2">
      <button class="btn-main w-full py-2.5!">
        Nouvelle partie
        <i class="fa fa-play-circle ml-2"/>
      </button>
      <button class="btn-secondary w-full">
        Leaderboard
        <i class="fa fa-medal ml-2"/>
      </button>
    </div>
  </main>
</template>

<style>

.pfp {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  aspect-ratio: 1;
  border-radius: 50%;
  line-height: 2px;
  background-color: #d7d7d7;
  color: #363636;
  font-weight: 500;
  font-size: 12px;
}

button {
  padding: 0.5rem 1rem;
  font-size: 1rem;
  cursor: pointer;
}
</style>
