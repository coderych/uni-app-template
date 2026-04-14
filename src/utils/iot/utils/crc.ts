const BKV_CRC16_POLY = 0xA001
const BKV_CRC16_INIT = 0x0000

// Pre-computed lookup table for CRC16 (性能优化)
const CRC16_TABLE: Uint16Array = (() => {
  const table = new Uint16Array(256)
  for (let i = 0; i < 256; i++) {
    let crc = i
    for (let j = 0; j < 8; j++) {
      crc = (crc & 1) ? ((crc >> 1) ^ BKV_CRC16_POLY) : (crc >> 1)
    }
    table[i] = crc
  }
  return table
})()

export function crc16(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  let crc = 0xFFFF

  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      const isOdd = crc & 0x0001
      crc >>= 1
      if (isOdd) {
        crc ^= 0xA001
      }
    }
  }

  return crc & 0xFFFF
}

export function appendCrc16(buffer: ArrayBuffer) {
  const checksum = crc16(buffer)
  const bytes = new Uint8Array(buffer.byteLength + 2)
  bytes.set(new Uint8Array(buffer), 0)
  bytes[bytes.length - 2] = checksum & 0xFF
  bytes[bytes.length - 1] = (checksum >> 8) & 0xFF
  return bytes.buffer
}

export function crc16Modbus(data: Uint8Array): number {
  let crc = BKV_CRC16_INIT
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ CRC16_TABLE[(crc ^ data[i]) & 0xFF]
  }
  return crc & 0xFFFF
}

export function crc16ToBytes(crc: number): Uint8Array {
  return new Uint8Array([(crc >> 8) & 0xFF, crc & 0xFF])
}
