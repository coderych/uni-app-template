export function getUni() {
  const uni = (globalThis as { uni?: Record<string, any> }).uni
  if (!uni) {
    throw new Error('uni 未定义')
  }
  return uni
}

export function callUni<T>(method: keyof typeof uni, payload?: Record<string, any>) {
  const uniRef = getUni()
  if (!uniRef || typeof uniRef[method] !== 'function') {
    return Promise.reject(new Error(`uni.${method} 不可用`))
  }

  return new Promise<T>((resolve, reject) => {
    uniRef[method]({
      ...(payload ?? {}),
      success: (result: T) => resolve(result),
      fail: (error: { errMsg?: string }) => reject(new Error(error?.errMsg ?? `${method} 调用失败`)),
    })
  })
}

export function isSupportBluetooth() {
  const uniRef = getUni()
  return !!uniRef && typeof uniRef.openBluetoothAdapter === 'function'
}

export * from './async'
export * from './bkv'
export * from './buffer'
export * from './crc'
export * from './emitter'
