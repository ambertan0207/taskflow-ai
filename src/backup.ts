export type BackupData = {
  'taskflow-tasks': Record<string, unknown>[]
  'taskflow-life-events': Record<string, unknown>[]
}

export type TaskFlowBackup = {
  format: 'taskflow-ai-backup'
  version: 1
  exportedAt: string
  data: BackupData
}

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const optionalString = (value: Record<string, unknown>, key: string) => value[key] === undefined || typeof value[key] === 'string'
const optionalBoolean = (value: Record<string, unknown>, key: string) => value[key] === undefined || typeof value[key] === 'boolean'

function validateTasks(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error('備份中的學業／餐廳任務必須是清單格式。')
  for (const [index, task] of value.entries()) {
    if (!isRecord(task) || typeof task.title !== 'string') throw new Error(`第 ${index + 1} 筆任務資料格式不正確。`)
    if (!optionalString(task, 'id') || !optionalString(task, 'category') || !optionalString(task, 'dueDate') || !optionalString(task, 'priority') || !optionalBoolean(task, 'completed')) throw new Error(`第 ${index + 1} 筆任務欄位格式不正確。`)
    if (task.workspace !== undefined && task.workspace !== 'study' && task.workspace !== 'business') throw new Error(`第 ${index + 1} 筆任務的工作區無效。`)
    if (task.priority !== undefined && !['高', '中', '低'].includes(String(task.priority))) throw new Error(`第 ${index + 1} 筆任務的優先度無效。`)
    if (task.minutes !== undefined && (typeof task.minutes !== 'number' || !Number.isFinite(task.minutes) || task.minutes < 0)) throw new Error(`第 ${index + 1} 筆任務的預估時間無效。`)
  }
  return value
}

function validateLifeEvents(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error('備份中的生活行程必須是清單格式。')
  const stringFields = ['id', 'date', 'startTime', 'endTime', 'location', 'people', 'category', 'notes']
  for (const [index, event] of value.entries()) {
    if (!isRecord(event) || typeof event.title !== 'string') throw new Error(`第 ${index + 1} 筆生活行程資料格式不正確。`)
    if (stringFields.some(key => !optionalString(event, key)) || !optionalBoolean(event, 'completed')) throw new Error(`第 ${index + 1} 筆生活行程欄位格式不正確。`)
    if (typeof event.date === 'string' && event.date !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(event.date)) throw new Error(`第 ${index + 1} 筆生活行程的日期格式無效。`)
    for (const key of ['startTime', 'endTime']) if (typeof event[key] === 'string' && event[key] !== '' && !/^\d{2}:\d{2}$/.test(event[key] as string)) throw new Error(`第 ${index + 1} 筆生活行程的時間格式無效。`)
  }
  return value
}

export function validateBackup(value: unknown): TaskFlowBackup {
  if (!isRecord(value) || value.format !== 'taskflow-ai-backup' || value.version !== 1 || !isRecord(value.data)) throw new Error('檔案不是有效的 TaskFlow AI 備份格式。')
  const tasks = validateTasks(value.data['taskflow-tasks'])
  const lifeEvents = validateLifeEvents(value.data['taskflow-life-events'])
  return { format: 'taskflow-ai-backup', version: 1, exportedAt: typeof value.exportedAt === 'string' ? value.exportedAt : '', data: { 'taskflow-tasks': tasks, 'taskflow-life-events': lifeEvents } }
}

function parseStoredArray(raw: string | null, key: string): unknown[] {
  if (raw === null) return []
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { throw new Error(`目前的 ${key} 資料不是有效 JSON，無法匯出。`) }
  if (!Array.isArray(parsed)) throw new Error(`目前的 ${key} 資料格式不正確，無法匯出。`)
  return parsed
}

export function createBackupJson(tasksRaw: string | null, lifeEventsRaw: string | null, exportedAt = new Date().toISOString()): string {
  const backup: TaskFlowBackup = {
    format: 'taskflow-ai-backup',
    version: 1,
    exportedAt,
    data: {
      'taskflow-tasks': validateTasks(parseStoredArray(tasksRaw, 'taskflow-tasks')),
      'taskflow-life-events': validateLifeEvents(parseStoredArray(lifeEventsRaw, 'taskflow-life-events')),
    },
  }
  return JSON.stringify(backup, null, 2)
}

export function parseBackupJson(text: string): TaskFlowBackup {
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch { throw new Error('檔案內容不是有效的 JSON。') }
  return validateBackup(parsed)
}

export function commitBackup(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>, backup: TaskFlowBackup): void {
  const keys = ['taskflow-tasks', 'taskflow-life-events'] as const
  const previous = keys.map(key => storage.getItem(key))
  const replacements = [JSON.stringify(backup.data['taskflow-tasks']), JSON.stringify(backup.data['taskflow-life-events'])]
  try {
    storage.setItem(keys[0], replacements[0])
    storage.setItem(keys[1], replacements[1])
  } catch (error) {
    for (const [index, key] of keys.entries()) {
      try {
        if (previous[index] === null) storage.removeItem(key)
        else storage.setItem(key, previous[index]!)
      } catch { /* Preserve the original write error; browsers may block rollback too. */ }
    }
    throw new Error(`匯入備份失敗，原有資料已盡力回復。${error instanceof Error ? ` ${error.message}` : ''}`)
  }
}
