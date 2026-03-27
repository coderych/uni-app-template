<script setup lang="ts">
import { ref } from 'vue'

const current = ref(0)
</script>

<template>
  <view>
    <slot />
    <sar-tabbar v-model:current="current" safe-area-inset-bottom fixed>
      <sar-tabbar-item
        :name="0"
        icon="list"
        text="首页"
      />
      <sar-tabbar-item
        :name="3"
        icon="person"
        text="我的"
      />
    </sar-tabbar>
    <sar-dialog-agent />
    <sar-notify-agent />
    <sar-toast-agent />
  </view>
</template>
