import type { CommandEntry, LogEntry, LoggerConfig, LogLevel } from '../types'
import { EventEmitter } from '../utils/emitter'

const LEVELS: LogLevel[] = ['verbose', 'debug', 'info', 'warn', 'error']

function canWrite(level: LogLevel, current: LogLevel) {
  return LEVELS.indexOf(level) >= LEVELS.indexOf(current)
}

interface LoggerEvents {
  log: (entry: LogEntry) => void
  clear: () => void
  command: (entry: CommandEntry) => void
  visibility: (visible: boolean) => void
}

class LoggerManager extends EventEmitter<LoggerEvents> {
  private config: LoggerConfig = {
    enabled: true,
    level: 'info',
    maxLogs: 200,
    showMetrics: true,
  }

  private logs: LogEntry[] = []
  private commands: CommandEntry[] = []
  private visible = false

  show() {
    this.visible = true
    this.emit('visibility', true)
  }

  hide() {
    this.visible = false
    this.emit('visibility', false)
  }

  isVisible() {
    return this.visible
  }

  configure(config: Partial<LoggerConfig>) {
    this.config = { ...this.config, ...config }
  }

  log(level: LogLevel, tag: string, message: string, data?: unknown) {
    if (!this.config.enabled || !canWrite(level, this.config.level)) {
      return
    }

    const entry: LogEntry = {
      time: Date.now(),
      level,
      tag,
      message,
      data,
    }

    this.logs.push(entry)
    if (this.logs.length > this.config.maxLogs) {
      this.logs.splice(0, this.logs.length - this.config.maxLogs)
    }
    this.emit('log', entry)

    console.log(entry)
  }

  verbose(tag: string, message: string, data?: unknown) {
    this.log('verbose', tag, message, data)
  }

  debug(tag: string, message: string, data?: unknown) {
    this.log('debug', tag, message, data)
  }

  info(tag: string, message: string, data?: unknown) {
    this.log('info', tag, message, data)
  }

  warn(tag: string, message: string, data?: unknown) {
    this.log('warn', tag, message, data)
  }

  error(tag: string, message: string, data?: unknown) {
    this.log('error', tag, message, data)
  }

  recordCommand(entry: CommandEntry) {
    this.commands.unshift(entry)
    if (this.commands.length > 50) {
      this.commands.length = 50
    }
    this.emit('command', entry)
  }

  getLogs() {
    return [...this.logs]
  }

  getCommands() {
    return [...this.commands]
  }

  clear() {
    this.logs = []
    this.emit('clear')
  }

  export() {
    return JSON.stringify(this.logs, null, 2)
  }

  get level() {
    return this.config.level
  }

  set level(value: LogLevel) {
    this.config.level = value
  }

  get settings() {
    return { ...this.config }
  }
}

export const logger = new LoggerManager()
