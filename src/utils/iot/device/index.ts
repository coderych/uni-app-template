import type { ConnectOptions, DeviceInfo, DeviceState, IotRetryConfig, IotTimeoutConfig, ScanOptions } from '../types'
import { ble } from '../adapter/ble'
import { logger } from '../logger'
import { permission } from '../permission'
import { withTimeout } from '../utils/async'
import { EventEmitter } from '../utils/emitter'

interface DeviceEvents {
  'scan:start': () => void
  'scan:stop': () => void
  'scan:discover': (device: DeviceInfo) => void
  'scan:error': (error: Error) => void
  'connect': (deviceId: string) => void
  'connect:fail': (deviceId: string, error: Error) => void
  'disconnect': (deviceId: string, reason: string) => void
  'state:change': (deviceId: string, state: DeviceState) => void
}

class DeviceManager extends EventEmitter<DeviceEvents> {
  private devices = new Map<string, DeviceInfo>()
  private states = new Map<string, DeviceState>()
  private manualDisconnecting = new Set<string>()
  private autoReconnectEnabled = new Map<string, boolean>()
  private reconnectTasks = new Map<string, { cancelled: boolean, promise: Promise<void> }>()
  private config: { retry: Required<Pick<IotRetryConfig, 'times' | 'interval' | 'backoff'>>, timeout: Required<Pick<IotTimeoutConfig, 'scan' | 'connect'>> } = {
    retry: { times: 3, interval: 1000, backoff: 1.5 },
    timeout: { scan: 10000, connect: 5000 },
  }

  constructor() {
    super()
    ble.on('connection:change', (deviceId, connected) => {
      const state = this.ensureState(deviceId)
      const previousState = state.state
      state.state = connected ? 'connected' : 'disconnected'
      state.channel = connected ? 'ble' : null
      if (connected) {
        state.connectedAt = Date.now()
        state.lastError = undefined
        this.clearReconnectTask(deviceId)
      }
      else if (previousState === 'connected' && !this.manualDisconnecting.has(deviceId)) {
        this.emit('disconnect', deviceId, 'connection-lost')
        if (this.shouldAutoReconnect(deviceId)) {
          state.state = 'connecting'
          void this.startAutoReconnect(deviceId)
        }
      }
      this.emit('state:change', deviceId, { ...state })
    })
  }

  private ensureState(deviceId: string) {
    if (!this.states.has(deviceId)) {
      this.states.set(deviceId, {
        id: deviceId,
        name: this.devices.get(deviceId)?.name ?? '未知设备',
        state: 'disconnected',
        channel: null,
      })
    }
    return this.states.get(deviceId)!
  }

  configure(config: { retry?: IotRetryConfig, timeout?: IotTimeoutConfig }) {
    if (config.retry) {
      this.config.retry = { ...this.config.retry, ...config.retry }
    }
    if (config.timeout) {
      this.config.timeout = {
        scan: config.timeout.scan ?? this.config.timeout.scan,
        connect: config.timeout.connect ?? this.config.timeout.connect,
      }
    }
  }

  async scan(options: ScanOptions = {}) {
    this.emit('scan:start')
    logger.info('device', '开始扫描设备')
    try {
      await permission.ensureAuthorized()
      const devices = await ble.scan({
        ...options,
        timeout: options.timeout ?? this.config.timeout.scan,
      })
      devices.forEach((item) => {
        this.devices.set(item.id, item)
        const state = this.ensureState(item.id)
        state.name = item.name
        state.rssi = item.rssi
        state.lastSeenAt = Date.now()
        this.emit('scan:discover', item)
      })
      return devices
    }
    catch (error) {
      const normalized = error instanceof Error ? error : new Error('扫描设备失败')
      logger.error('device', '扫描设备失败', normalized)
      this.emit('scan:error', normalized)
      throw normalized
    }
    finally {
      this.emit('scan:stop')
      logger.info('device', '设备扫描结束')
    }
  }

  async connect(id: string, options: ConnectOptions = {}) {
    const { timeout = this.config.timeout.connect, autoReconnect = true } = options
    this.autoReconnectEnabled.set(id, autoReconnect)
    this.cancelReconnectTask(id)
    const state = this.ensureState(id)
    state.state = 'connecting'
    this.emit('state:change', id, { ...state })
    try {
      await permission.ensureAuthorized()
      await withTimeout(ble.connect(id), timeout, '连接超时')
      state.state = 'connected'
      state.channel = 'ble'
      state.connectedAt = Date.now()
      this.emit('connect', id)
      this.emit('state:change', id, { ...state })
    }
    catch (error) {
      state.state = 'disconnected'
      state.lastError = error instanceof Error ? error.message : '连接失败'
      this.emit('connect:fail', id, error instanceof Error ? error : new Error('连接失败'))
      this.emit('state:change', id, { ...state })
      throw error
    }
  }

  async disconnect(id: string) {
    this.cancelReconnectTask(id)
    const state = this.ensureState(id)
    state.state = 'disconnecting'
    this.manualDisconnecting.add(id)
    this.emit('state:change', id, { ...state })
    try {
      await ble.disconnect(id)
      state.state = 'disconnected'
      state.channel = null
      this.emit('disconnect', id, 'manual')
      this.emit('state:change', id, { ...state })
    }
    finally {
      this.manualDisconnecting.delete(id)
    }
  }

  getState(id: string) {
    return { ...this.ensureState(id) }
  }

  getStates() {
    return Array.from(this.states.values(), item => ({ ...item }))
  }

  getDevices() {
    return Array.from(this.devices.values(), item => ({ ...item }))
  }

  isConnected(id: string) {
    return this.ensureState(id).state === 'connected'
  }

  async disconnectAll() {
    const connectedIds = this.getStates()
      .filter(item => item.state === 'connected')
      .map(item => item.id)
    await Promise.all(connectedIds.map(id => this.disconnect(id)))
  }

  private cancelReconnectTask(deviceId: string) {
    const task = this.reconnectTasks.get(deviceId)
    if (task) {
      task.cancelled = true
      this.reconnectTasks.delete(deviceId)
    }
  }

  private clearReconnectTask(deviceId: string) {
    this.reconnectTasks.delete(deviceId)
  }

  private async startAutoReconnect(deviceId: string) {
    const existingTask = this.reconnectTasks.get(deviceId)
    if (existingTask) {
      return existingTask.promise
    }

    const task = {} as { cancelled: boolean, promise: Promise<void> }
    task.cancelled = false
    this.reconnectTasks.set(deviceId, task)
    task.promise = this.runAutoReconnect(deviceId)

    try {
      await task.promise
    }
    finally {
      const currentTask = this.reconnectTasks.get(deviceId)
      if (currentTask === task) {
        this.reconnectTasks.delete(deviceId)
      }
    }
  }

  private async runAutoReconnect(deviceId: string) {
    const state = this.ensureState(deviceId)

    if (!this.shouldAutoReconnect(deviceId) || this.config.retry.times <= 0) {
      state.state = 'disconnected'
      state.channel = null
      this.emit('state:change', deviceId, { ...state })
      logger.info('device', '设备断线后未启用自动重连', { deviceId })
      return
    }

    for (let attempt = 1; attempt <= this.config.retry.times; attempt += 1) {
      const task = this.reconnectTasks.get(deviceId)
      if (!task || task.cancelled || this.manualDisconnecting.has(deviceId) || this.isConnected(deviceId)) {
        return
      }

      if (attempt > 1) {
        const delay = Math.max(0, Math.round(this.config.retry.interval * this.config.retry.backoff ** (attempt - 2)))
        logger.warn('device', '设备断线，准备自动重连', { deviceId, attempt, delay })
        await this.sleep(delay)
        if (task.cancelled || this.manualDisconnecting.has(deviceId) || this.isConnected(deviceId)) {
          return
        }
      }
      else {
        logger.warn('device', '设备断线，开始自动重连', { deviceId, attempt })
      }

      state.state = 'connecting'
      state.channel = null
      this.emit('state:change', deviceId, { ...state })

      try {
        await permission.ensureAuthorized()
        await withTimeout(ble.connect(deviceId), this.config.timeout.connect, '连接超时')
        return
      }
      catch (error) {
        state.lastError = error instanceof Error ? error.message : '自动重连失败'
        logger.warn('device', '自动重连失败', { deviceId, attempt, error })
      }
    }

    state.state = 'disconnected'
    state.channel = null
    const finalError = new Error('自动重连失败')
    this.emit('connect:fail', deviceId, finalError)
    this.emit('state:change', deviceId, { ...state })
    logger.error('device', '设备自动重连失败', { deviceId })
  }

  private sleep(ms: number) {
    return new Promise<void>(resolve => setTimeout(resolve, ms))
  }

  private shouldAutoReconnect(deviceId: string) {
    return this.autoReconnectEnabled.get(deviceId) ?? true
  }
}

export const device = new DeviceManager()
