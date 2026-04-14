type EventCallback = (...args: any[]) => void

function getUniEmitter() {
  const uniRef = (globalThis as { uni?: Record<string, any> }).uni
  if (
    uniRef
    && typeof uniRef.$emit === 'function'
    && typeof uniRef.$on === 'function'
    && typeof uniRef.$off === 'function'
  ) {
    return uniRef
  }
  return null
}

type EventHandlerMap<T> = {
  [K in keyof T]: (...args: any[]) => void
}

export class EventEmitter<T extends EventHandlerMap<T>> {
  private events = new Map<keyof T, Set<EventCallback>>()

  on<K extends keyof T>(event: K, callback: T[K]) {
    if (!this.events.has(event)) {
      this.events.set(event, new Set())
    }
    this.events.get(event)!.add(callback as EventCallback)
    return () => this.off(event, callback)
  }

  once<K extends keyof T>(event: K, callback: T[K]) {
    const wrapped = ((...args: Parameters<T[K]>) => {
      this.off(event, wrapped as T[K])
      callback(...args)
    }) as T[K]
    return this.on(event, wrapped)
  }

  off<K extends keyof T>(event: K, callback?: T[K]) {
    if (!callback) {
      this.events.delete(event)
      return
    }
    this.events.get(event)?.delete(callback as EventCallback)
    if (this.events.get(event)?.size === 0) {
      this.events.delete(event)
    }
  }

  emit<K extends keyof T>(event: K, ...args: Parameters<T[K]>) {
    this.events.get(event)?.forEach(callback => callback(...args))
    getUniEmitter()?.$emit(String(event), ...args)
  }

  bridge<K extends keyof T>(event: K, callback: T[K]) {
    getUniEmitter()?.$on(String(event), callback)
    return () => getUniEmitter()?.$off(String(event), callback)
  }

  clear() {
    this.events.clear()
  }
}
