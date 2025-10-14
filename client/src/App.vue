<template>
  <main>
    <h1>Vue (Options API) + Express</h1>
    <button @click="fetchMessage">Fetch API</button>
    <p v-if="message">Response: {{ message }}</p>
  </main>
</template>

<script>
export default {
  name: 'App',
  data() {
    return {
      message: ''
    }
  },
  methods: {
    async fetchMessage() {
      try {
        const res = await fetch('/api/hello')
        const data = await res.json()
        this.message = data.message
      } catch (err) {
        console.error(err)
      }
    }
  }
}
</script>

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
