import { bufferToHex, bufferToString, concatenateBuffer, stringToBuffer } from './buffer'

function isString(v: unknown): v is string {
  return typeof v === 'string' || typeof v === 'string'
}

function isNumber(v: unknown): v is number {
  return Number.isInteger(v)
}

function ensureBuffer(v: string | number | ArrayBuffer | Uint8Array): Uint8Array {
  if (v instanceof ArrayBuffer) {
    return new Uint8Array(v)
  }
  if (v instanceof Uint8Array) {
    return v
  }
  if (isString(v)) {
    return stringToBuffer(v)
  }
  if (isNumber(v)) {
    return encodeNumber(v)
  }
  throw new Error('invalid value, can not be converted to buffer')
}

// ==================== 数字编解码 ====================

/**
 * 将数字编码为 Uint8Array (大端序)
 */
export function encodeNumber(v: number): Uint8Array {
  if (v === 0) {
    const b = new Uint8Array(1)
    b[0] = 0
    return b
  }
  const b = new Uint8Array(8)
  const dv = new DataView(b.buffer)
  dv.setBigUint64(0, BigInt(v))
  let i = 0
  for (; i < 8; i++) {
    if (b[i] !== 0) {
      break
    }
  }
  return b.slice(i)
}

/**
 * 将 Uint8Array 解码为数字 (大端序)
 */
export function decodeNumber(v: Uint8Array): number {
  let n = 0
  if (v.length > 8) {
    v = v.slice(0, 8)
  }
  for (let i = 0; i < v.length; i++) {
    const b = v[i]
    n <<= 8
    n |= b
  }
  return n
}

// ==================== 长度编解码 ====================

/**
 * 编码长度 (变长编码,每7位携带1位继续标志)
 */
export function encodeLength(l: number): Uint8Array {
  const b = new Uint8Array(8)
  let i = 0
  while (l > 0) {
    b[i] = (l & 0x7F) | 0x80
    l >>= 7
    i++
    if (i > 8) {
      throw new Error('invalid length')
    }
  }
  const la = b.slice(0, i)
  la.reverse()
  la[i - 1] &= 0x7F
  return la
}

export interface DecodeLengthResult {
  code: number
  length: number
  lengthByteSize: number
}

/**
 * 解码长度
 */
export function decodeLength(buffer: Uint8Array): DecodeLengthResult {
  const la = new Uint8Array(8)
  let lengthByteSize = 0
  for (let i = 0; i < buffer.length; i++) {
    const b = buffer[i]
    la[i] = b & 0x7F
    lengthByteSize++
    if ((b & 0x80) === 0) {
      break
    }
  }
  if (lengthByteSize === 0 || lengthByteSize > 4) {
    return { code: 1, length: 0, lengthByteSize: 0 }
  }
  let length = 0
  for (let i = 0; i < lengthByteSize; i++) {
    length <<= 7
    length |= la[i]
  }
  return { code: 0, length, lengthByteSize }
}

// ==================== KV 类 ====================
const UNPACK_RESULT_CODE_EMPTY_BUF = 1
const UNPACK_RESULT_CODE_DECODE_LENGTH_FAIL = -1
const UNPACK_RESULT_CODE_BUF_NOT_ENOUGH = -2
const UNPACK_RESULT_CODE_WRONG_KEY_SIZE = -3

export interface UnpackResult {
  code: number
  kv: KV | null
  pendingParseBuffer: Uint8Array | null
}

export class KV {
  private _key: Uint8Array
  private _value: Uint8Array
  private _isStringKey: boolean

  constructor(key: string | number | Uint8Array, value: string | number | Uint8Array) {
    this._key = ensureBuffer(key as any)
    this._value = ensureBuffer(value as any)
    this._isStringKey = isString(key)

    if (!isString(key) && !isNumber(key)) {
      throw new Error('key is not string or number')
    }
  }

  /**
   * 打包 KV 为字节流
   * 格式: total length bytes + Key length byte(1 bit number/string flag + 7 bit length) + Key bytes + Value bytes
   */
  pack(): Uint8Array {
    const keyLength = this._key.length
    const totalLength = 1 + keyLength + this._value.length
    const lengthBuffer = encodeLength(totalLength)
    const lengthBufferSize = lengthBuffer.length
    const finalLength = lengthBufferSize + totalLength
    let keyLengthByte = keyLength & 0x7F
    if (this._isStringKey) {
      keyLengthByte |= 0x80
    }
    const buffer = new Uint8Array(finalLength)
    buffer.set(lengthBuffer, 0)
    buffer[lengthBufferSize] = keyLengthByte
    buffer.set(this._key, lengthBufferSize + 1)
    buffer.set(this._value, lengthBufferSize + 1 + keyLength)
    return buffer
  }

  /**
   * 从字节流解包 KV
   */
  static unpack(buffer: Uint8Array): UnpackResult {
    if (!buffer || buffer.length === 0) {
      return { code: UNPACK_RESULT_CODE_EMPTY_BUF, kv: null, pendingParseBuffer: buffer }
    }

    const dlr = decodeLength(buffer)
    if (dlr.code !== 0) {
      return { code: UNPACK_RESULT_CODE_DECODE_LENGTH_FAIL, kv: null, pendingParseBuffer: null }
    }

    const payloadLength = dlr.length
    const remainingLength = buffer.length - dlr.lengthByteSize - payloadLength
    if (remainingLength < 0 || buffer.length - dlr.lengthByteSize < 0) {
      return { code: UNPACK_RESULT_CODE_BUF_NOT_ENOUGH, kv: null, pendingParseBuffer: buffer }
    }

    const payload = buffer.slice(dlr.lengthByteSize, dlr.lengthByteSize + dlr.length)
    if (payload.length === 0) {
      return { code: UNPACK_RESULT_CODE_BUF_NOT_ENOUGH, kv: null, pendingParseBuffer: buffer }
    }

    let isStringKey = false
    const keySizeByte = payload[0]
    const keyLength = keySizeByte & 0x7F
    if ((keySizeByte & 0x80) !== 0) {
      isStringKey = true
    }

    const valueLength = payload.length - 1 - keyLength
    if (valueLength < 0) {
      return { code: UNPACK_RESULT_CODE_WRONG_KEY_SIZE, kv: null, pendingParseBuffer: buffer }
    }

    const keyBuffer = payload.slice(1, 1 + keyLength)
    const key = isStringKey ? bufferToString(keyBuffer) : decodeNumber(keyBuffer)
    const valueBuffer = payload.slice(1 + keyLength)
    const kv = new KV(key, valueBuffer)

    return {
      code: 0,
      kv,
      pendingParseBuffer: buffer.slice(dlr.lengthByteSize + dlr.length),
    }
  }

  isStringKey(): boolean {
    return this._isStringKey
  }

  key(): string | number {
    return this._isStringKey ? bufferToString(this._key) : decodeNumber(this._key)
  }

  value(): Uint8Array {
    return this._value
  }

  stringValue(): string {
    return bufferToString(this._value)
  }

  numberValue(): number {
    return decodeNumber(this._value)
  }
}

// ==================== BKV 类 ====================

export interface BKVUnpackResult {
  code: number
  bkv: BKV | null
  pendingParseBuffer: Uint8Array | null
}

/**
 * BKV (Buffer-Key-Value) 编解码器
 * 支持多个 KV 对的打包和解包
 */
export class BKV {
  private _kvs: KV[] = []

  /**
   * 打包所有 KV 对为字节流
   */
  pack(): Uint8Array {
    if (this._kvs.length === 0) {
      return new Uint8Array(0)
    }
    let buffer: Uint8Array = new Uint8Array(0)
    this._kvs.forEach((kv) => {
      buffer = concatenateBuffer(buffer, kv.pack())
    })
    return buffer
  }

  /**
   * 从字节流解包 BKV
   */
  static unpack(buffer: Uint8Array): BKVUnpackResult {
    const bkv = new BKV()
    while (true) {
      const pr = KV.unpack(buffer)
      if (pr.code === 0) {
        if (pr.kv != null) {
          bkv.add(pr.kv)
        }
        buffer = pr.pendingParseBuffer!
      }
      else {
        if (pr.code === UNPACK_RESULT_CODE_EMPTY_BUF) {
          break
        }
        else {
          return { code: pr.code, bkv: null, pendingParseBuffer: pr.pendingParseBuffer }
        }
      }
    }
    return { code: 0, bkv, pendingParseBuffer: null }
  }

  items(): KV[] {
    return this._kvs
  }

  add(kv: KV): void {
    this._kvs.push(kv)
  }

  addPair(key: string | number, value: string | number | Uint8Array): void {
    this.add(new KV(key, value))
  }

  getStringValue(key: string): string | undefined {
    for (const kv of this._kvs) {
      if (kv.key() === key) {
        return kv.stringValue()
      }
    }
    return undefined
  }

  getNumberValue(key: number): number | undefined {
    for (const kv of this._kvs) {
      if (kv.key() === key) {
        return kv.numberValue()
      }
    }
    return undefined
  }

  /**
   * 调试输出所有 KV 对
   */
  dump(): void {
    for (let i = 0; i < this._kvs.length; i++) {
      const kv = this._kvs[i]
      const valueString = bufferToHex(kv.value())
      const valueFirstByte = kv.value()[0]
      let extraInfo = ''
      if (valueFirstByte >= 0x20 && valueFirstByte <= 0x7E) {
        extraInfo = ` (s: ${bufferToString(kv.value())})`
      }
      if (kv.isStringKey()) {
        console.log(`kv[${i}] key[s]: ${kv.key()} -> value[${kv.value().length}]: ${valueString}${extraInfo}`)
      }
      else {
        console.log(`kv[${i}] key[n]: ${kv.key()} -> value[${kv.value().length}]: ${valueString}${extraInfo}`)
      }
    }
  }
}
