<template>
  <div class="flex gap-1 flex-row">
    <input v-model="localScore" type="number" placeholder="Entrez votre score" class="flex-1 py-3! pl-7! input-elem" :min="0" :max="250" @keydown.enter="onSubmit" :step="1" onkeypress="return event.charCode >= 48 && event.charCode <= 57"/>
    <button @click="onSubmit" class="btn-main py-3! btn-elem">Soumettre <i class="fa fa-hand-point-right ml-2"/></button>
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
      if (this.localScore === '' || Number.isNaN(num) || Number(num) > 250 || Number(num) < 0) {
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
.input-elem {
  border-top-right-radius: 8px;
  border-bottom-right-radius: 8px;
}

.btn-elem {
  border-top-left-radius: 8px;
  border-bottom-left-radius: 8px;
}

</style>
