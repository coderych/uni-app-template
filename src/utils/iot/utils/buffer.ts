function normalizeHex(hex: string) {
  // eslint-disable-next-line e18e/prefer-static-regex
  return hex.replace(/0x/gi, '').replace(/\s+/g, '').trim()
}

export function textToBuffer(text: string) {
  return new TextEncoder().encode(text).buffer
}

export function bufferToText(buffer: ArrayBuffer) {
  return new TextDecoder().decode(new Uint8Array(buffer))
}

export function hexToBuffer(hex: string) {
  const normalized = normalizeHex(hex)
  if (normalized.length === 0) {
    return new ArrayBuffer(0)
  }
  if (normalized.length % 2 !== 0) {
    throw new Error('HEX 字符串长度必须为偶数')
  }
  const bytes = new Uint8Array(normalized.length / 2)
  for (let index = 0; index < normalized.length; index += 2) {
    bytes[index / 2] = Number.parseInt(normalized.slice(index, index + 2), 16)
  }
  return bytes.buffer
}

export function bufferToHex(buffer: Uint8Array): string {
  let hex = ''
  for (let i = 0; i < buffer.length; i++) {
    const h = `00${buffer[i].toString(16)}`
    hex += h.slice(-2)
  }
  return hex
}

export function bufferToString(buffer: Uint8Array): string {
  let content = ''
  for (let i = 0; i < buffer.length; i++) {
    content += String.fromCharCode(buffer[i])
  }
  return content
}

export function bufferToCompactHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, '0').toUpperCase())
    .join('')
}

export function compactHexToBuffer(hex: string) {
  return hexToBuffer(hex)
}

/**
 * 字符串转 Uint8Array
 */
export function stringToBuffer(content: string): Uint8Array {
  const buf = new Uint8Array(content.length)
  for (let i = 0; i < content.length; i++) {
    buf[i] = content.charCodeAt(i)
  }
  return buf
}

export function concatArrayBuffers(buffers: ArrayBuffer[]) {
  const total = buffers.reduce((sum, item) => sum + item.byteLength, 0)
  const merged = new Uint8Array(total)
  let offset = 0
  buffers.forEach((buffer) => {
    merged.set(new Uint8Array(buffer), offset)
    offset += buffer.byteLength
  })
  return merged.buffer
}

/**
 * 拼接多个 Uint8Array
 */
export function concatenateBuffer(...arrays: Uint8Array[]): Uint8Array {
  let totalLength = 0
  for (const arr of arrays) {
    totalLength += arr.length
  }
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const arr of arrays) {
    result.set(arr, offset)
    offset += arr.length
  }
  return result
}

export function splitArrayBuffer(buffer: ArrayBuffer, chunkSize: number) {
  if (chunkSize <= 0) {
    throw new Error('chunkSize 必须大于 0')
  }
  const chunks: ArrayBuffer[] = []
  const bytes = new Uint8Array(buffer)
  for (let start = 0; start < bytes.length; start += chunkSize) {
    chunks.push(bytes.slice(start, start + chunkSize).buffer)
  }
  return chunks
}

export function ensureArrayBuffer(input: ArrayBuffer | Uint8Array | string, mode: 'hex' | 'text' = 'text') {
  if (input instanceof ArrayBuffer) {
    return input
  }
  if (input instanceof Uint8Array) {
    const output = new Uint8Array(input.byteLength)
    output.set(input)
    return output.buffer
  }
  return mode === 'hex' ? hexToBuffer(input) : textToBuffer(input)
}
