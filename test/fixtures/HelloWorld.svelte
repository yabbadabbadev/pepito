<script lang="ts">
  let { name = 'Svelte' }: { name?: string } = $props()
</script>

<p>Hello from {name}</p>