import type { BLEConfig, ChannelAdapter, ConnectOptions, DeviceInfo, DeviceState, IotConfig, IotEvents, ScanOptions, WriteOptions } from './types'
import { ble } from './adapter/ble'
import { network } from './adapter/network'
import { device } from './device'
import { logger } from './logger'
import DebugPanel from './logger/DebugPanel.vue'
import { permission } from './permission'
import { transfer } from './transfer'
import { EventEmitter } from './utils/emitter'

class IotModule {
  readonly device = device
  readonly transfer = transfer
  readonly permission = permission
  readonly logger = logger
  readonly ble = ble
  readonly network = network
  private readonly events = new EventEmitter<IotEvents>()

  emit<K extends keyof IotEvents>(event: K, ...args: Parameters<IotEvents[K]>) {
    this.events.emit(event, ...args)
  }

  async scan(options?: ScanOptions) {
    return this.device.scan(options)
  }

  async connect(id: string, options?: ConnectOptions) {
    return this.device.connect(id, options)
  }

  async disconnect(id: string) {
    return this.device.disconnect(id)
  }

  async disconnectAll() {
    return this.device.disconnectAll()
  }

  async write(deviceId: string, data: ArrayBuffer, options?: WriteOptions) {
    return this.transfer.write(deviceId, data, options)
  }

  async read(deviceId: string, characteristic: string) {
    return this.transfer.read(deviceId, characteristic)
  }

  subscribe(deviceId: string, characteristic: string, callback: (data: ArrayBuffer) => void) {
    return this.transfer.subscribe(deviceId, characteristic, callback)
  }

  unsubscribe(deviceId: string, characteristic: string) {
    return this.transfer.unsubscribe(deviceId, characteristic)
  }

  config(options: IotConfig) {
    if (options.timeout || options.retry) {
      this.device.configure({
        timeout: options.timeout,
        retry: options.retry,
      })
      this.transfer.configure({
        timeout: options.timeout,
      })
    }
    if (options.defaultChannel) {
      this.transfer.default(options.defaultChannel)
    }
    if (options.logger) {
      this.logger.configure(options.logger)
    }
    if (options.ble) {
      this.ble.configure(options.ble)
    }
    if (options.network) {
      this.network.configure(options.network)
    }
  }

  use(name: ChannelAdapter['name'], adapter: ChannelAdapter) {
    this.transfer.use(name, adapter)
  }

  default(channel: ChannelAdapter['name']) {
    this.transfer.default(channel)
  }

  showDebug() {
    this.logger.show()
  }

  hideDebug() {
    this.logger.hide()
  }

  getState(id: string): DeviceState {
    return this.device.getState(id)
  }

  getDevices(): DeviceInfo[] {
    return this.device.getDevices()
  }

  setBleConfig(config: Partial<BLEConfig>) {
    this.ble.configure(config)
  }

  on<K extends keyof IotEvents>(event: K, callback: IotEvents[K]) {
    return this.events.on(event, callback)
  }

  off<K extends keyof IotEvents>(event: K, callback?: IotEvents[K]) {
    return this.events.off(event, callback)
  }
}

export const iot = new IotModule()

ble.on('adapter:state', state => iot.emit('ble:adapter:state', state))
ble.on('connection:change', (deviceId, connected) => iot.emit('ble:connection:change', deviceId, connected))
ble.on('notify', payload => iot.emit('ble:notify', payload))
ble.on('error', (deviceId, error) => iot.emit('ble:error', deviceId, error))
device.on('scan:start', () => iot.emit('device:scan:start'))
device.on('scan:stop', () => iot.emit('device:scan:stop'))
device.on('scan:discover', payload => iot.emit('device:scan:discover', payload))
device.on('scan:error', error => iot.emit('device:scan:error', error))
device.on('connect', deviceId => iot.emit('device:connect', deviceId))
device.on('connect:fail', (deviceId, error) => iot.emit('device:connect:fail', deviceId, error))
device.on('disconnect', (deviceId, reason) => iot.emit('device:disconnect', deviceId, reason))
device.on('state:change', (deviceId, state) => iot.emit('device:state:change', deviceId, state))
logger.on('log', entry => iot.emit('logger:new', entry))
logger.on('clear', () => iot.emit('logger:clear'))

export * from './adapter/ble'
export * from './adapter/network'
export * from './device'
export * from './logger'
export * from './permission'
export * from './transfer'
export * from './types'
export * from './utils'

export { DebugPanel }
