<template>
  <div id="app" class="w-full max-h-dvh h-dvh overflow-y-auto relative">
    <main class="flex flex-col items-center p-4 pt-0 gap-2 h-full max-w-[600px] mx-auto ">
      <div class="sticky top-0 bg-[var(--bg-color)] w-full flex justify-center z-10">
        <router-link to="/">
          <img src="@assets/tallLogo.png" alt="" width="200">
        </router-link>

      </div><router-view/>
    </main>
  </div>
</template>

<script>
export default {
  name: 'App',
}
</script>
