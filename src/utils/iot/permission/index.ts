import type { PermissionStatus } from '../types'
import { logger } from '../logger'
import { getUni, isSupportBluetooth } from '../utils'

class PermissionManager {
  private bluetoothAuthorized: boolean | null = null

  async authorize() {
    if (!isSupportBluetooth()) {
      logger.warn('permission', '当前环境不支持蓝牙 API，已跳过权限申请')
      this.bluetoothAuthorized = false
      return false
    }

    const uniRef = getUni()!
    try {
      await new Promise<void>((resolve, reject) => {
        uniRef.openBluetoothAdapter({
          success: () => resolve(),
          fail: (error: unknown) => reject(error),
        })
      })
      logger.info('permission', '蓝牙权限检查通过')
      this.bluetoothAuthorized = true
      return true
    }
    catch (error) {
      logger.error('permission', '蓝牙权限申请失败', error)
      this.bluetoothAuthorized = false
      return false
    }
  }

  async ensureAuthorized() {
    const granted = await this.authorize()
    if (!granted) {
      this.guide()
      throw new Error('蓝牙权限未授权或当前环境不支持蓝牙')
    }
  }

  permitted(): PermissionStatus {
    const uniRef = getUni()
    const appAuthorizeSetting = uniRef?.getAppAuthorizeSetting?.()
    const bluetooth = typeof appAuthorizeSetting?.bluetoothAuthorized === 'boolean'
      ? appAuthorizeSetting.bluetoothAuthorized
      : (this.bluetoothAuthorized ?? isSupportBluetooth())
    const location = typeof appAuthorizeSetting?.locationAuthorized === 'boolean'
      ? appAuthorizeSetting.locationAuthorized
      : false
    return {
      bluetooth,
      location,
      all: bluetooth && location,
    }
  }

  guide() {
    const uniRef = getUni()
    uniRef?.showModal?.({
      title: '权限提示',
      content: '请在系统设置中开启蓝牙与定位权限后重试。',
      showCancel: false,
    })
  }
}

export const permission = new PermissionManager()
