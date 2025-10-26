<template>
  <div class="flex gap-2 flex-col">
    <input v-model="localScore" type="number" placeholder="Entrez votre score" class="flex-1" @keydown.enter="onSubmit" />
    <button @click="onSubmit" class="btn-main">Soumettre <i class="fa fa-hand-point-right ml-2"/></button>
  </div>
</template>

<script>
export default {
  name: 'ScoreInput',
  props: {
    initial: {
      type: [Number, String],
      default: ''
    }
  },
  data() {
    return { localScore: this.initial }
  },
  methods: {
    onSubmit() {
      const num = Number(this.localScore)
      if (this.localScore === '' || Number.isNaN(num)) {
        this.$emit('invalid')
        return
      }
      this.$emit('submit', num)
      this.localScore = ''
    }
  }
}
</script>

<style scoped>
input { padding: 0.4rem; }
button { padding: 0.4rem 0.8rem; }
</style>

