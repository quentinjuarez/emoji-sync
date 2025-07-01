<template>
  <section class="mt-8 p-4 border rounded shadow-sm bg-white">
    <h2 class="text-xl font-semibold mb-4">Synchronisation d'emojis MVP</h2>

    <Button
      label="Synchroniser Slack vers GitLab"
      icon="pi pi-refresh"
      class="w-full"
      @click="handleSync"
    />

    <h2 class="text-xl font-semibold mb-4">Delete emoji MVP</h2>

    <Button
      label="Supprimer un emoji"
      icon="pi pi-trash"
      class="w-full"
      @click="deleteEmoji"
    />
  </section>
</template>

<script setup lang="ts">
async function handleSync() {
  try {
    const gitlabData = localStorage.getItem('gitlabData');

    if (!gitlabData) {
      return;
    }

    const { groups } = JSON.parse(gitlabData);

    const res = await fetch(`${import.meta.env.VITE_BACK_URL}/gitlab/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'smile-test',
        url: 'https://a.slack-edge.com/80588/img/emoji_2017_12_06/apple/simple_smile.png',
        groupPath: groups[0],
      }),
    });

    console.log(res);
  } catch (err) {
    console.error(err);
  }
}

const deleteEmoji = async () => {
  try {
    const gitlabData = localStorage.getItem('gitlabData');

    if (!gitlabData) {
      return;
    }

    const { groups } = JSON.parse(gitlabData);

    const res = await fetch(`${import.meta.env.VITE_BACK_URL}/gitlab/emoji`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        groupPath: groups[0],
        emojiId: 'gid://gitlab/CustomEmoji/2039181',
      }),
    });

    console.log(res);
  } catch (err) {
    console.error(err);
  }
};
</script>
