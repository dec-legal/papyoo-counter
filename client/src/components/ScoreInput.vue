<template>
  <div class="flex gap-1 flex-row input-container rounded-full p-1">
    <input v-model="localScore" type="text" inputmode="tel" placeholder="Entrez votre score" class="flex-1 py-2! pl-5! input-elem" @keydown.enter="onSubmit" onkeypress="return event.charCode >= 48 && event.charCode <= 57 || event.charCode === 43"/>
    <button @click="onSubmit" class="btn-main py-2! btn-elem">OK <i class="fa fa-hand-point-right ml-2"/></button>
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
      const raw = String(this.localScore).trim()
      if (raw === '') { this.$emit('invalid'); return }
      // Allow additive expressions like "5+10+15"
      const num = /^[\d+]+$/.test(raw)
        ? raw.split('+').reduce((s, t) => s + (parseInt(t, 10) || 0), 0)
        : Number(raw)
      if (Number.isNaN(num) || num > 250 || num < 0) {
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

.input-container {
  border: 2px solid #4b9ace;
  background-color: rgba(113, 171, 204, 0.13);
}

input {
  border: none;
  outline: none;
  background-color: transparent;
}

</style>
