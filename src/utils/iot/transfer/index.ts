import type { ChannelAdapter, DeviceChannel, IotTimeoutConfig, NotifyPayload, WriteOptions } from '../types'
import { ble } from '../adapter/ble'
import { network } from '../adapter/network'
import { device } from '../device'
import { logger } from '../logger'
import { resolveResponseWithContext, waitForResponse } from '../utils/async'
import { EventEmitter } from '../utils/emitter'

interface TransferEvents {
  notify: (deviceId: string, value: ArrayBuffer) => void
}

class TransferManager extends EventEmitter<TransferEvents> {
  private channelMap = new Map<DeviceChannel, ChannelAdapter>()
  private defaultChannel: DeviceChannel = 'ble'
  private responseTimeout = 10000

  constructor() {
    super()
    this.use('ble', {
      name: 'ble',
      send: (deviceId, data, options) => ble.write(deviceId, data, options),
      available: deviceId => ble.getConnectedState(deviceId),
    })
    this.use('network', {
      name: 'network',
      send: (deviceId, data, options) => network.send(deviceId, data, options),
      available: () => network.isConfigured(),
    })

    ble.on('notify', ({ deviceId, value, characteristicId }) => {
      const payload: NotifyPayload = { deviceId, value, characteristicId }
      resolveResponseWithContext(undefined, value, payload)
      this.emit('notify', deviceId, value)
    })
  }

  use(name: DeviceChannel, adapter: ChannelAdapter) {
    this.channelMap.set(name, adapter)
  }

  channels(deviceId: string) {
    return [...this.channelMap.values()]
      .filter(adapter => adapter.available(deviceId))
      .map(adapter => adapter.name)
  }

  default(channel: DeviceChannel) {
    this.defaultChannel = channel
  }

  configure(config: { timeout?: IotTimeoutConfig }) {
    if (typeof config.timeout?.response === 'number') {
      this.responseTimeout = config.timeout.response
    }
  }

  private pickChannel(deviceId: string, options?: WriteOptions) {
    if (options?.channel) {
      const forced = this.channelMap.get(options.channel)
      if (!forced || !forced.available(deviceId)) {
        throw new Error(`通道 ${options.channel} 不可用`)
      }
      return forced
    }

    const preferred = this.channelMap.get(this.defaultChannel)
    if (preferred?.available(deviceId)) {
      return preferred
    }

    const fallback = [...this.channelMap.values()].find(adapter => adapter.available(deviceId))
    if (!fallback) {
      throw new Error('没有可用通道')
    }
    return fallback
  }

  async write(deviceId: string, data: ArrayBuffer, options: WriteOptions = {}): Promise<ArrayBuffer | ArrayBuffer[] | void> {
    const channel = this.pickChannel(deviceId, options)
    logger.info('transfer', '发送数据', {
      deviceId,
      channel: channel.name,
      waitResponse: !!options.waitResponse,
      size: data.byteLength,
      multiPacket: options.multiPacket,
    })

    if (!options.waitResponse) {
      return channel.send(deviceId, data, options)
    }

    if (channel.name === 'network') {
      return await channel.send(deviceId, data, options)
    }

    const {
      responseCharacteristicId = ble.settings.notifyCharacteristicId,
      timeout = this.responseTimeout,
    } = options

    return waitForResponse<ArrayBuffer, ArrayBuffer>(() => channel.send(deviceId, data, options).then(() => undefined), {
      timeout,
      request: data,
      matcher: (request, response, context) => {
        const notify = context as NotifyPayload | undefined
        if (!notify || notify.deviceId !== deviceId) {
          return false
        }

        if (responseCharacteristicId && notify.characteristicId !== responseCharacteristicId) {
          return false
        }

        if (options.matcher) {
          return options.matcher(request, response, notify)
        }

        return true
      },
      seq: options.seq,
      multiPacket: options.multiPacket,
      isLastPacket: options.isLastPacket
        ? (packets, current, context) => {
            const notify = context as NotifyPayload | undefined
            return options.isLastPacket!(packets, current, notify)
          }
        : undefined,
      packetTimeout: options.packetTimeout,
    })
  }

  async read(deviceId: string, characteristic: string) {
    return ble.read(deviceId, characteristic)
  }

  async subscribe(deviceId: string, characteristic: string, callback: (data: ArrayBuffer) => void) {
    await ble.notify(deviceId, characteristic, callback)
  }

  async unsubscribe(deviceId: string, characteristic: string, callback?: (data: ArrayBuffer) => void) {
    await ble.unnotify(deviceId, characteristic, callback)
  }

  getDefaultChannel() {
    return this.defaultChannel
  }

  getDeviceState(deviceId: string) {
    return device.getState(deviceId)
  }
}

export const transfer = new TransferManager()
