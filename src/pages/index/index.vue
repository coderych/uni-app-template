<script setup lang="ts">
import { toast } from 'sard-uniapp'

definePage({
  layout: 'tabbar',
})

function handleClick() {
  toast.success('按钮点击成功')
}
</script>

<template>
  <view px-10 py-20 text-center @click="handleClick">
    <sar-button>按钮</sar-button>
  </view>
</template>

<style lang="scss" scoped>

</style>
