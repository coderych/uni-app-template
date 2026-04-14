import type { BLEConfig, DeviceInfo, NotifyPayload, ScanOptions, WriteOptions } from '../types'
import { logger } from '../logger'
import { callUni, getUni } from '../utils'
import { splitArrayBuffer } from '../utils/buffer'
import { EventEmitter } from '../utils/emitter'

interface BLEEvents {
  'adapter:state': (state: 'on' | 'off' | 'unauthorized') => void
  'connection:change': (deviceId: string, connected: boolean) => void
  'rssi:update': (deviceId: string, rssi: number) => void
  'notify': (payload: NotifyPayload) => void
  'error': (deviceId: string, error: Error) => void
}

function applyFilter(device: DeviceInfo, options?: ScanOptions) {
  if (!options?.filter) {
    return true
  }
  const { name } = options.filter
  return !(name?.length && !name.some(item => device.name.includes(item)))
}

class BLEAdapter extends EventEmitter<BLEEvents> {
  private config: BLEConfig = {
    serviceId: '',
    writeCharacteristicId: '',
    notifyCharacteristicId: '',
    readCharacteristicId: '',
    mtu: 20,
  }

  private connected = new Set<string>()
  private initialized = false
  private notifications = new Map<string, Map<string, Set<(data: ArrayBuffer) => void>>>()

  configure(config: Partial<BLEConfig>) {
    this.config = { ...this.config, ...config }
  }

  get settings() {
    return { ...this.config }
  }

  async init() {
    if (this.initialized) {
      return
    }
    await callUni('openBluetoothAdapter')
    this.initialized = true
    this.emit('adapter:state', 'on')
    logger.info('ble', '蓝牙适配器初始化完成')

    const uniRef = getUni()
    uniRef?.onBLEConnectionStateChange?.((result: { deviceId: string, connected: boolean }) => {
      if (result.connected) {
        this.connected.add(result.deviceId)
      }
      else {
        this.connected.delete(result.deviceId)
      }
      this.emit('connection:change', result.deviceId, result.connected)
    })

    uniRef?.onBLECharacteristicValueChange?.((result: { deviceId: string, value: ArrayBuffer, characteristicId?: string }) => {
      const payload: NotifyPayload = {
        deviceId: result.deviceId,
        value: result.value,
        characteristicId: result.characteristicId,
      }
      const characteristicId = result.characteristicId ?? ''
      this.notifications
        .get(result.deviceId)
        ?.get(characteristicId)
        ?.forEach(callback => callback(result.value))
      this.emit('notify', payload)
    })
  }

  async scan(options: ScanOptions = {}) {
    await this.init()

    const found = new Map<string, DeviceInfo>()
    const uniRef = getUni()
    const onFound = (result: { devices?: Array<Record<string, any>> }) => {
      result.devices?.forEach((device) => {
        const normalized: DeviceInfo = {
          id: device.deviceId,
          name: device.name || device.localName || '未命名设备',
          rssi: device.RSSI ?? device.rssi ?? 0,
          advertisData: device.advertisData,
        }
        if (!applyFilter(normalized, options)) {
          return
        }
        found.set(normalized.id, normalized)
      })
    }

    uniRef?.onBluetoothDeviceFound?.(onFound)

    try {
      await callUni('startBluetoothDevicesDiscovery', {
        allowDuplicatesKey: options.allowDuplicatesKey ?? false,
        services: options.filter?.service ?? [],
      })
      logger.info('ble', '开始扫描蓝牙设备')
      await new Promise(resolve => setTimeout(resolve, options.timeout ?? 5000))
      return [...found.values()]
    }
    finally {
      uniRef?.offBluetoothDeviceFound?.(onFound)
      await callUni('stopBluetoothDevicesDiscovery').catch(() => undefined)
      logger.info('ble', '蓝牙扫描结束')
    }
  }

  async connect(id: string) {
    await this.init()
    if (this.connected.has(id)) {
      logger.debug('ble', '设备已连接，无需重复操作', { id })
      return
    }
    await callUni('createBLEConnection', { deviceId: id })
    this.connected.add(id)
    if (this.config.notifyCharacteristicId) {
      await callUni('notifyBLECharacteristicValueChange', {
        deviceId: id,
        serviceId: this.config.serviceId,
        characteristicId: this.config.notifyCharacteristicId,
        state: true,
      }).catch((error) => {
        logger.warn('ble', '通知订阅失败', error)
      })
    }
    this.emit('connection:change', id, true)
    logger.info('ble', '设备连接成功', { id })
  }

  async disconnect(id: string) {
    await callUni('closeBLEConnection', { deviceId: id }).catch(() => undefined)
    this.connected.delete(id)
    this.emit('connection:change', id, false)
    logger.info('ble', '设备已断开', { id })
  }

  async write(id: string, data: ArrayBuffer, options: Pick<WriteOptions, 'serviceId' | 'characteristicId'> = {}) {
    const {
      serviceId = this.config.serviceId,
      characteristicId = this.config.writeCharacteristicId,
    } = options
    if (!serviceId || !characteristicId) {
      throw new Error('BLE 写入配置缺失，请先配置 serviceId 和 writeCharacteristicId')
    }

    const chunkSize = Math.max(1, this.config.mtu ?? 20)
    const chunks = data.byteLength > chunkSize ? splitArrayBuffer(data, chunkSize) : [data]

    for (const chunk of chunks) {
      await callUni('writeBLECharacteristicValue', {
        deviceId: id,
        serviceId,
        characteristicId,
        value: chunk,
      })
    }

    logger.debug('ble', 'BLE 写入成功', { id, size: data.byteLength, chunks: chunks.length, serviceId, characteristicId })
  }

  async read(id: string, characteristicId: string) {
    if (!this.config.serviceId) {
      throw new Error('BLE 读取配置缺失，请先配置 serviceId')
    }
    const result = await callUni<{ value: ArrayBuffer }>('readBLECharacteristicValue', {
      deviceId: id,
      serviceId: this.config.serviceId,
      characteristicId,
    })
    logger.debug('ble', 'BLE 读取成功', { id, characteristicId })
    return result.value
  }

  async notify(id: string, characteristicId: string, callback: (data: ArrayBuffer) => void) {
    let deviceSubscriptions = this.notifications.get(id)
    if (!deviceSubscriptions) {
      deviceSubscriptions = new Map()
      this.notifications.set(id, deviceSubscriptions)
    }

    let callbacks = deviceSubscriptions.get(characteristicId)
    const shouldEnable = !callbacks || callbacks.size === 0
    if (!callbacks) {
      callbacks = new Set()
      deviceSubscriptions.set(characteristicId, callbacks)
    }
    callbacks.add(callback)

    if (!shouldEnable) {
      return
    }

    await callUni('notifyBLECharacteristicValueChange', {
      deviceId: id,
      serviceId: this.config.serviceId,
      characteristicId,
      state: true,
    })
  }

  async unnotify(id: string, characteristicId: string, callback?: (data: ArrayBuffer) => void) {
    const deviceSubscriptions = this.notifications.get(id)
    const callbacks = deviceSubscriptions?.get(characteristicId)
    if (!callbacks) {
      return
    }

    if (callback) {
      callbacks.delete(callback)
    }
    else {
      callbacks.clear()
    }

    if (callbacks.size > 0) {
      return
    }

    deviceSubscriptions?.delete(characteristicId)
    if (deviceSubscriptions?.size === 0) {
      this.notifications.delete(id)
    }

    await callUni('notifyBLECharacteristicValueChange', {
      deviceId: id,
      serviceId: this.config.serviceId,
      characteristicId,
      state: false,
    }).catch((error) => {
      logger.warn('ble', '取消通知订阅失败', error)
    })
  }

  getConnectedState(id: string) {
    return this.connected.has(id)
  }

  getAdapterState() {
    return this.initialized ? 'on' : 'off'
  }
}

export const ble = new BLEAdapter()
