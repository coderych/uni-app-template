export type DeviceChannel = 'ble' | 'network'
export type DeviceConnectionState = 'disconnected' | 'connecting' | 'connected' | 'disconnecting'
export type LogLevel = 'verbose' | 'debug' | 'info' | 'warn' | 'error'

export interface DeviceInfo {
  id: string
  name: string
  rssi: number
  manufacturer?: string
  advertisData?: ArrayBuffer
}

export interface DeviceState {
  id: string
  name: string
  state: DeviceConnectionState
  channel: DeviceChannel | null
  rssi?: number
  connectedAt?: number
  lastSeenAt?: number
  lastError?: string
}

export interface ScanOptions {
  timeout?: number
  allowDuplicatesKey?: boolean
  filter?: {
    name?: string[]
    service?: string[]
  }
}

export interface ConnectOptions {
  timeout?: number
  autoReconnect?: boolean
}

export interface WriteOptions {
  timeout?: number
  waitResponse?: boolean
  channel?: DeviceChannel
  responseCharacteristicId?: string
  matcher?: (request: ArrayBuffer | undefined, response: ArrayBuffer, context: NotifyPayload | undefined) => boolean
  serviceId?: string
  characteristicId?: string
  request?: NetworkRequest
  seq?: string
  /**
   * 是否启用多包响应收集模式
   * 当设备响应数据量过大需要分包推送时启用
   */
  multiPacket?: boolean
  /**
   * 多包收集完成的判断函数
   * 返回 true 表示所有包已收集完毕
   */
  isLastPacket?: (packets: ArrayBuffer[], current: ArrayBuffer, context: NotifyPayload | undefined) => boolean
  /**
   * 多包之间的超时时间（毫秒）
   * 默认 500ms，如果超过此时间未收到下一包则认为收集完成
   */
  packetTimeout?: number
}

export interface PermissionStatus {
  bluetooth: boolean
  location: boolean
  all: boolean
}

export interface LogEntry {
  time: number
  level: LogLevel
  tag: string
  message: string
  data?: unknown
}

export interface CommandEntry {
  id: string
  time: number
  name: string
  data: ArrayBuffer | string
  type: 'hex' | 'text'
  deviceId?: string
}

export interface LoggerConfig {
  enabled: boolean
  level: LogLevel
  maxLogs: number
  showMetrics: boolean
}

export interface BLEConfig {
  serviceId: string
  writeCharacteristicId: string
  notifyCharacteristicId: string
  readCharacteristicId?: string
  mtu?: number
}

export interface NetworkRequestContext {
  deviceId: string
  data: ArrayBuffer
  options: WriteOptions
}

export type NetworkRequest<TResult = unknown> = (context: NetworkRequestContext) => Promise<TResult>

export interface NetworkConfig {
  enabled?: boolean
}

export interface IotRetryConfig {
  times?: number
  interval?: number
  backoff?: number
}

export interface IotTimeoutConfig {
  scan?: number
  connect?: number
  response?: number
}

export interface IotConfig {
  defaultChannel?: DeviceChannel
  retry?: IotRetryConfig
  timeout?: IotTimeoutConfig
  logger?: Partial<LoggerConfig>
  ble?: Partial<BLEConfig>
  network?: Partial<NetworkConfig>
}

export interface NotifyPayload {
  deviceId: string
  value: ArrayBuffer
  characteristicId?: string
}

export interface ChannelAdapter {
  name: DeviceChannel
  send: (deviceId: string, data: ArrayBuffer, options?: WriteOptions) => Promise<any>
  available: (deviceId: string) => boolean
}

export interface IotEvents {
  'device:scan:start': () => void
  'device:scan:stop': () => void
  'device:scan:discover': (device: DeviceInfo) => void
  'device:scan:error': (error: Error) => void
  'device:connect': (deviceId: string) => void
  'device:connect:fail': (deviceId: string, error: Error) => void
  'device:disconnect': (deviceId: string, reason: string) => void
  'device:state:change': (deviceId: string, state: DeviceState) => void
  'ble:adapter:state': (state: 'on' | 'off' | 'unauthorized') => void
  'ble:connection:change': (deviceId: string, connected: boolean) => void
  'ble:rssi:update': (deviceId: string, rssi: number) => void
  'ble:notify': (payload: NotifyPayload) => void
  'ble:error': (deviceId: string, error: Error) => void
  'logger:new': (entry: LogEntry) => void
  'logger:clear': () => void
}
