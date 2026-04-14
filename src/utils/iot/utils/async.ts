export interface WaitOptions<TRequest = unknown, TResponse = unknown> {
  timeout?: number
  seq?: string
  request?: TRequest
  matcher?: (request: TRequest | undefined, response: TResponse, context: unknown) => boolean
  /**
   * 是否启用多包收集模式
   */
  multiPacket?: boolean
  /**
   * 判断是否为最后一包的函数
   */
  isLastPacket?: (packets: TResponse[], current: TResponse, context: unknown) => boolean
  /**
   * 包间超时时间（毫秒），默认 500ms
   */
  packetTimeout?: number
}

interface PendingRequest<TRequest = unknown, TResponse = unknown> {
  id: string
  request?: TRequest
  matcher?: (request: TRequest | undefined, response: TResponse, context: unknown) => boolean
  resolve: (value: TResponse | TResponse[]) => void
  reject: (reason?: unknown) => void
  timer: ReturnType<typeof setTimeout>
  /**
   * 多包收集相关
   */
  multiPacket?: boolean
  isLastPacket?: (packets: TResponse[], current: TResponse, context: unknown) => boolean
  packetTimeout: number
  collectedPackets?: TResponse[]
  packetTimer?: ReturnType<typeof setTimeout>
}

const pendingRequests = new Map<string, PendingRequest<any, any>>()
let sequence = 0

export function generateSeq() {
  sequence = (sequence + 1) % 1000000
  return `${Date.now()}-${sequence}`
}

export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage = '操作超时') {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    promise
      .then((value) => {
        clearTimeout(timer)
        resolve(value)
      })
      .catch((error) => {
        clearTimeout(timer)
        reject(error)
      })
  })
}

export function waitForResponse<TResponse, TRequest = unknown>(send: () => void | Promise<void>, options: WaitOptions<TRequest, TResponse> = {}) {
  const pendingId = options.seq ?? generateSeq()
  const timeout = options.timeout ?? 10000
  const packetTimeout = options.packetTimeout ?? 500

  return new Promise<TResponse | TResponse[]>((resolve, reject) => {
    const timer = setTimeout(() => {
      const pending = pendingRequests.get(pendingId)
      if (pending?.packetTimer) {
        clearTimeout(pending.packetTimer)
      }
      pendingRequests.delete(pendingId)
      reject(new Error('等待响应超时'))
    }, timeout)

    pendingRequests.set(pendingId, {
      id: pendingId,
      request: options.request,
      matcher: options.matcher,
      resolve,
      reject,
      timer,
      multiPacket: options.multiPacket,
      isLastPacket: options.isLastPacket,
      packetTimeout,
      collectedPackets: options.multiPacket ? [] : undefined,
    })

    Promise.resolve(send()).catch((error) => {
      clearTimeout(timer)
      const pending = pendingRequests.get(pendingId)
      if (pending?.packetTimer) {
        clearTimeout(pending.packetTimer)
      }
      pendingRequests.delete(pendingId)
      reject(error)
    })
  })
}

export function resolveResponse<TResponse>(seq: string | undefined, data: TResponse) {
  if (seq && pendingRequests.has(seq)) {
    const pending = pendingRequests.get(seq)!
    clearTimeout(pending.timer)
    pendingRequests.delete(seq)
    pending.resolve(data)
    return true
  }

  return false
}

export function resolveResponseWithContext<TResponse, TContext = unknown>(seq: string | undefined, data: TResponse, context?: TContext) {
  if (resolveResponse(seq, data)) {
    return true
  }

  for (const [key, pending] of pendingRequests.entries()) {
    if (pending.matcher?.(pending.request, data, context)) {
      // 多包收集模式
      if (pending.multiPacket) {
        // 收集当前包
        pending.collectedPackets!.push(data)

        // 清除之前的包间定时器
        if (pending.packetTimer) {
          clearTimeout(pending.packetTimer)
        }

        // 检查是否为最后一包
        const isLast = pending.isLastPacket?.(pending.collectedPackets!, data, context) ?? false

        if (isLast) {
          // 最后一包，完成收集
          clearTimeout(pending.timer)
          pendingRequests.delete(key)
          pending.resolve(pending.collectedPackets!)
        }
        else {
          // 设置包间超时定时器
          pending.packetTimer = setTimeout(() => {
            // 包间超时，返回已收集的包
            clearTimeout(pending.timer)
            pendingRequests.delete(key)
            pending.resolve(pending.collectedPackets!)
          }, pending.packetTimeout)
        }
        return true
      }

      // 单包模式
      clearTimeout(pending.timer)
      pendingRequests.delete(key)
      pending.resolve(data)
      return true
    }
  }

  return false
}

export function rejectResponse(seq: string, reason: unknown) {
  const pending = pendingRequests.get(seq)
  if (!pending) {
    return false
  }
  clearTimeout(pending.timer)
  pendingRequests.delete(seq)
  pending.reject(reason)
  return true
}
