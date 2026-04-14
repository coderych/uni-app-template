import type { NetworkConfig, WriteOptions } from '../types'

class NetworkAdapter {
  private enabled = true

  configure(config: Partial<NetworkConfig>) {
    if (typeof config.enabled === 'boolean') {
      this.enabled = config.enabled
    }
  }

  async send(deviceId: string, data: ArrayBuffer, options: WriteOptions = {}) {
    if (!options.request) {
      throw new Error('network 通道缺少 request 配置')
    }

    return options.request({
      deviceId,
      data,
      options,
    })
  }

  isConfigured() {
    return this.enabled
  }
}

export const network = new NetworkAdapter()
