<script setup lang="ts">
import type { CommandEntry, DeviceInfo, DeviceState, LogEntry, LogLevel } from '@/iot'

import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { bufferToHex, ensureArrayBuffer, generateSeq, iot } from '@/iot'

// 状态
const logs = ref<LogEntry[]>(iot.logger.getLogs())
const commands = ref<CommandEntry[]>(iot.logger.getCommands())
const inputMode = ref<'hex' | 'text'>('text')
const commandName = ref('手动发送')
const commandText = ref('')
const waitResponse = ref(true)
const lastResponse = ref('')
const sending = ref(false)
const minimized = ref(false)
const currentTab = ref<'send' | 'logs' | 'commands'>('logs')
const currentLevel = ref<LogLevel>('info')
const show = ref<boolean>(false)
const deviceId = ref<string>('')
const devices = ref<DeviceInfo[]>(iot.getDevices())
const deviceStates = ref<Record<string, DeviceState>>({})
const showDevicePicker = ref(false)
const debug = ref(true)
const panelRef = ref<any>(null)

// 面板位置
const position = ref({ x: 10, y: 100 })
const isDragging = ref(false)
const dragStart = ref({ x: 0, y: 0 })

const panelStyle = computed(() => ({
  left: `${position.value.x}px`,
  top: `${position.value.y}px`,
}))

// 标签页
const tabs = [
  { key: 'logs' as const, label: '日志' },
  { key: 'commands' as const, label: '指令' },
  { key: 'send' as const, label: '发送' },
] as const

// 日志级别
const levels = ['verbose', 'debug', 'info', 'warn', 'error']
const levelIndex = computed(() => levels.indexOf(currentLevel.value))

let offLog = () => {}
let offClear = () => {}
let offCommand = () => {}
let offStateChange = () => {}

// 显示面板
function handleShow() {
  show.value = true
  iot.showDebug()
}

// 关闭面板
function closePanel() {
  show.value = false
  iot.hideDebug()
}

// 最小化/恢复
function toggleMinimize() {
  minimized.value = !minimized.value
}

// 拖拽
function startDrag(e: TouchEvent) {
  e.stopPropagation()
  isDragging.value = true
  dragStart.value = {
    x: e.touches[0].clientX - position.value.x,
    y: e.touches[0].clientY - position.value.y,
  }
}

function onDrag(e: TouchEvent) {
  if (!isDragging.value)
    return
  e.stopPropagation()
  e.preventDefault()
  position.value = {
    x: e.touches[0].clientX - dragStart.value.x,
    y: e.touches[0].clientY - dragStart.value.y,
  }
}

function endDrag() {
  isDragging.value = false
}

// 格式化时间
function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`
}

// 级别变更
function onLevelChange(e: any) {
  const level = levels[e.detail.value] as LogLevel
  currentLevel.value = level
  iot.logger.level = level
}

// 清空日志
function clearLogs() {
  iot.logger.clear()
  logs.value = []
}

// 导出日志
function exportLogs() {
  const data = iot.logger.export()
  uni.setClipboardData({
    data,
    success() {
      uni.showToast({ title: '已复制到剪贴板', icon: 'none' })
    },
  })
}

async function sendCommand() {
  if (!commandText.value.trim()) {
    return
  }
  sending.value = true
  lastResponse.value = ''
  try {
    const buffer = ensureArrayBuffer(commandText.value, inputMode.value)
    const entry: CommandEntry = {
      id: generateSeq(),
      time: Date.now(),
      name: commandName.value,
      data: commandText.value,
      type: inputMode.value,
      deviceId: deviceId.value,
    }
    iot.logger.recordCommand(entry)
    const response = await iot.write(deviceId.value, buffer, {
      waitResponse: waitResponse.value,
    })
    if (response instanceof ArrayBuffer) {
      lastResponse.value = bufferToHex(response)
    }
    else {
      lastResponse.value = '发送完成，未等待到二进制响应'
    }
  }
  catch (error) {
    lastResponse.value = error instanceof Error ? error.message : '发送失败'
  }
  finally {
    sending.value = false
  }
}

// 快速选择历史指令
function selectCommand(cmd: CommandEntry) {
  commandName.value = cmd.name
  commandText.value = typeof cmd.data === 'string' ? cmd.data : bufferToHex(cmd.data)
  inputMode.value = cmd.type
}

// 获取设备列表
function refreshDevices() {
  devices.value = iot.getDevices()
}

// 选择设备
function selectDevice(device: DeviceInfo) {
  deviceId.value = device.id
  showDevicePicker.value = false
}

// 切换设备选择器
function toggleDevicePicker() {
  refreshDevices()
  showDevicePicker.value = !showDevicePicker.value
}

watch(() => show.value, (value) => {
  if (value) {
    iot.showDebug()
  }
  else {
    iot.hideDebug()
  }
})

onMounted(() => {
  currentLevel.value = iot.logger.level
  refreshDevices()
  offLog = iot.logger.on('log', (entry) => {
    logs.value = [...logs.value, entry].slice(-iot.logger.settings.maxLogs)
  })
  offClear = iot.logger.on('clear', () => {
    logs.value = []
  })
  offCommand = iot.logger.on('command', () => {
    commands.value = iot.logger.getCommands()
  })
  offStateChange = iot.device.on('state:change', (id, state) => {
    deviceStates.value = { ...deviceStates.value, [id]: state }
  })
  debug.value = iot.logger.settings?.enabled || false

  // 点击外部区域最小化
  const handleClickOutside = (e: TouchEvent | MouseEvent) => {
    if (!show.value || minimized.value)
      return
    // 获取面板元素 - uni-app ref 需要通过 $el 获取实际 DOM
    const panelEl = panelRef.value?.$el || panelRef.value
    if (!panelEl)
      return
    const target = e.target as Node
    if (!panelEl.contains?.(target)) {
      minimized.value = true
    }
  }
  // 支持触摸和鼠标事件
  setTimeout(() => {
    document?.addEventListener?.('touchstart', handleClickOutside)
    document?.addEventListener?.('mousedown', handleClickOutside)
  }, 0)

  // 保存清理函数到组件实例
  const cleanup = () => {
    document?.removeEventListener?.('touchstart', handleClickOutside)
    document?.removeEventListener?.('mousedown', handleClickOutside)
  }
  ;(panelRef.value as any)?._cleanup?.()
  ;(panelRef.value as any)._cleanup = cleanup
})

onUnmounted(() => {
  offLog()
  offClear()
  offCommand()
  offStateChange()
  // 清理事件监听
  try {
    ;(panelRef.value as any)?._cleanup?.()
  }
  catch {
    // ignore
  }
})
</script>

<template>
  <!-- 悬浮按钮 -->
  <view v-if="!show && debug" class="debug-fab" @click="handleShow()">
    <text class="fab-text">Debug</text>
  </view>

  <!-- 调试面板 -->
  <view v-if="show" ref="panelRef" class="debug-panel" :style="panelStyle">
    <!-- 标题栏 -->
    <view class="debug-header" @touchstart="startDrag" @touchmove="onDrag" @touchend="endDrag">
      <text class="debug-title">IoT 调试面板</text>
      <view class="debug-actions">
        <text class="debug-btn" @click="toggleMinimize">{{ minimized ? '□' : '−' }}</text>
        <text class="debug-btn" @click="closePanel">×</text>
      </view>
    </view>

    <!-- 内容区 -->
    <view v-if="!minimized" class="debug-content">
      <!-- 标签页 -->
      <view class="debug-tabs">
        <text
          v-for="tab in tabs"
          :key="tab.key"
          class="debug-tab"
          :class="{ active: currentTab === tab.key }"
          @click="currentTab = tab.key"
        >
          {{ tab.label }}
        </text>
      </view>

      <!-- 发送页 -->
      <scroll-view v-if="currentTab === 'send'" class="debug-scroll" scroll-y>
        <view class="send-section">
          <!-- 设备选择 -->
          <text class="section-label">目标设备</text>
          <view class="device-selector-box" @click="toggleDevicePicker">
            <text class="device-selector-value">{{ deviceId ? (devices.find(d => d.id === deviceId)?.name || deviceId) : '点击选择设备' }}</text>
            <text class="device-selector-arrow">{{ showDevicePicker ? '▲' : '▼' }}</text>
          </view>

          <!-- 设备下拉列表 -->
          <view v-if="showDevicePicker" class="device-dropdown">
            <view v-if="devices.length === 0" class="device-empty">
              <text>暂无可用设备，请先扫描</text>
            </view>
            <view
              v-for="device in devices"
              :key="device.id"
              class="device-option"
              :class="{ active: deviceId === device.id }"
              @click="selectDevice(device)"
            >
              <text class="device-option-name">{{ device.name }}</text>
              <text class="device-option-id">{{ device.id }}</text>
              <text class="device-option-state" :class="deviceStates[device.id]?.state">{{ deviceStates[device.id]?.state === 'connected' ? '已连接' : '未连接' }}</text>
            </view>
          </view>

          <text class="section-label">发送模式</text>
          <view class="mode-selector">
            <text
              class="mode-option"
              :class="{ active: inputMode === 'text' }"
              @click="inputMode = 'text'"
            >
              文本
            </text>
            <text
              class="mode-option"
              :class="{ active: inputMode === 'hex' }"
              @click="inputMode = 'hex'"
            >
              HEX
            </text>
          </view>
          <input v-model="commandName" class="debug-input" placeholder="指令名称">
          <textarea v-model="commandText" class="debug-textarea" placeholder="请输入文本或 HEX 数据" />
          <view class="send-options">
            <text class="option-label" @click="waitResponse = !waitResponse">
              <text class="checkbox">{{ waitResponse ? '☑' : '☐' }}</text>
              等待响应
            </text>
          </view>
          <button class="debug-send-btn" :disabled="!deviceId || sending" @click="sendCommand">
            {{ sending ? '发送中...' : '发送指令' }}
          </button>
          <view v-if="lastResponse" class="response-box">
            <text class="response-label">响应:</text>
            <text class="response-value">{{ lastResponse }}</text>
          </view>
        </view>
      </scroll-view>

      <!-- 日志页 -->
      <scroll-view v-if="currentTab === 'logs'" class="debug-scroll" scroll-y>
        <view
          v-for="(entry, index) in logs.slice().reverse()"
          :key="`${entry.time}-${index}`"
          class="debug-log-item"
          :class="entry.level"
        >
          <text class="log-time">{{ formatTime(entry.time) }}</text>
          <text class="log-level">[{{ entry.level.toUpperCase() }}]</text>
          <text class="log-tag">{{ entry.tag }}</text>
          <text class="log-message">{{ entry.message }}</text>
        </view>
      </scroll-view>

      <!-- 指令页 -->
      <scroll-view v-if="currentTab === 'commands'" class="debug-scroll" scroll-y>
        <view
          v-for="item in commands"
          :key="item.id"
          class="debug-command-item"
          @click="selectCommand(item)"
        >
          <text class="cmd-time">{{ formatTime(item.time) }}</text>
          <text class="cmd-type">[{{ item.type.toUpperCase() }}]</text>
          <text class="cmd-name">{{ item.name }}</text>
        </view>
        <view v-if="commands.length === 0" class="empty-tip">
          <text>暂无历史指令</text>
        </view>
      </scroll-view>

      <!-- 工具栏 -->
      <view class="debug-toolbar">
        <text class="toolbar-btn" @click="clearLogs">清空</text>
        <text class="toolbar-btn" @click="exportLogs">导出</text>
        <picker class="toolbar-picker" mode="selector" :range="levels" :value="levelIndex" @change="onLevelChange">
          <text class="toolbar-btn">级别: {{ currentLevel }}</text>
        </picker>
      </view>
    </view>
  </view>
</template>

<style scoped>
/* 面板容器 */
.debug-panel {
  position: fixed;
  width: 320px;
  background: rgba(0, 0, 0, 0.9);
  border-radius: 8px;
  z-index: 9999;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  touch-action: none;
}

/* 标题栏 */
.debug-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 8px 8px 0 0;
  cursor: move;
  touch-action: none;
}

.debug-title {
  color: #fff;
  font-size: 14px;
  font-weight: bold;
}

.debug-actions {
  display: flex;
  gap: 8px;
}

.debug-btn {
  color: #fff;
  font-size: 16px;
  padding: 0 4px;
}

/* 内容区 */
.debug-content {
  padding: 8px;
}

/* 设备选择器 */
.device-selector-box {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  margin-bottom: 8px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  cursor: pointer;
}

.device-selector-value {
  color: #6cf;
  font-size: 12px;
  font-family: monospace;
}

.device-selector-arrow {
  color: #999;
  font-size: 10px;
}

/* 设备下拉列表 */
.device-dropdown {
  max-height: 150px;
  overflow-y: auto;
  background: rgba(0, 0, 0, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  margin-bottom: 8px;
  padding: 4px;
}

.device-empty {
  padding: 12px;
  text-align: center;
  color: #666;
  font-size: 11px;
}

.device-option {
  padding: 8px;
  border-radius: 4px;
  margin-bottom: 4px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.device-option:last-child {
  margin-bottom: 0;
}

.device-option:hover,
.device-option.active {
  background: rgba(0, 122, 255, 0.2);
}

.device-option-name {
  color: #fff;
  font-size: 12px;
  font-weight: bold;
}

.device-option-id {
  color: #666;
  font-size: 10px;
  font-family: monospace;
}

.device-option-state {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 2px;
  align-self: flex-start;
}

.device-option-state.connected {
  color: #9f9;
  background: rgba(0, 255, 0, 0.1);
}

.device-option-state.disconnected {
  color: #999;
  background: rgba(255, 255, 255, 0.05);
}

/* 标签页 */
.debug-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.debug-tab {
  color: #999;
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 4px;
}

.debug-tab.active {
  color: #fff;
  background: rgba(255, 255, 255, 0.2);
}

/* 滚动区域 */
.debug-scroll {
  height: 200px;
  background: rgba(0, 0, 0, 0.5);
  border-radius: 4px;
  padding: 8px;
  box-sizing: border-box;
}

/* 发送区域 */
.send-section {
  padding: 4px;
}

.section-label {
  display: block;
  color: #999;
  font-size: 11px;
  margin-bottom: 6px;
}

.mode-selector {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.mode-option {
  color: #999;
  font-size: 12px;
  padding: 4px 12px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.05);
}

.mode-option.active {
  color: #fff;
  background: rgba(0, 122, 255, 0.6);
}

.debug-input,
.debug-textarea {
  width: 100%;
  margin-bottom: 8px;
  padding: 8px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font-size: 12px;
  box-sizing: border-box;
  border: none;
  min-height: 40px;
}

.debug-textarea {
  min-height: 80px;
}

.send-options {
  margin-bottom: 8px;
}

.option-label {
  color: #ccc;
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.checkbox {
  color: #6cf;
  font-size: 14px;
}

.debug-send-btn {
  width: 100%;
  padding: 8px;
  border-radius: 4px;
  background: #007aff;
  color: #fff;
  font-size: 13px;
  text-align: center;
  border: none;
}

.debug-send-btn[disabled] {
  background: rgba(0, 122, 255, 0.4);
  color: rgba(255, 255, 255, 0.6);
}

.response-box {
  margin-top: 8px;
  padding: 8px;
  background: rgba(0, 255, 0, 0.1);
  border-radius: 4px;
}

.response-label {
  display: block;
  color: #9f9;
  font-size: 11px;
  margin-bottom: 4px;
}

.response-value {
  color: #fff;
  font-size: 11px;
  font-family: monospace;
  word-break: break-all;
}

/* 日志项 */
.debug-log-item {
  font-size: 11px;
  margin-bottom: 4px;
  word-break: break-all;
}

.debug-log-item.verbose {
  color: #999;
}
.debug-log-item.debug {
  color: #6cf;
}
.debug-log-item.info {
  color: #9f9;
}
.debug-log-item.warn {
  color: #fc6;
}
.debug-log-item.error {
  color: #f66;
}

.log-time {
  color: #666;
  margin-right: 4px;
}
.log-level {
  margin-right: 4px;
}
.log-tag {
  color: #c9c;
  margin-right: 4px;
}
.log-message {
  color: #fff;
}

/* 指令项 */
.debug-command-item {
  font-size: 11px;
  margin-bottom: 6px;
  padding: 6px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
  cursor: pointer;
}

.cmd-time {
  color: #666;
  margin-right: 4px;
}
.cmd-type {
  color: #6cf;
  margin-right: 4px;
}
.cmd-name {
  color: #fff;
}

.empty-tip {
  text-align: center;
  padding: 20px;
  color: #666;
  font-size: 12px;
}

/* 工具栏 */
.debug-toolbar {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.toolbar-btn {
  color: #6cf;
  font-size: 12px;
  padding: 4px 8px;
}

.toolbar-picker {
  flex: 1;
  text-align: right;
}

/* 悬浮按钮 */
.debug-fab {
  position: fixed;
  right: 16px;
  bottom: 100px;
  width: 56px;
  height: 56px;
  background: #007aff;
  border-radius: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(0, 122, 255, 0.4);
  z-index: 9999;
}

.fab-text {
  color: #fff;
  font-size: 12px;
  font-weight: bold;
}
</style>
