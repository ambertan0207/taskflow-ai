const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')

const source = fs.readFileSync(path.join(__dirname, '../src/backup.ts'), 'utf8')
const compiled = ts.transpile(source, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 })
const loadedModule = { exports: {} }
new Function('exports', 'require', 'module', compiled)(loadedModule.exports, require, loadedModule)
const { commitBackup, createBackupJson, parseBackupJson } = loadedModule.exports

const task = { id: 'task-1', title: '統計作業', workspace: 'study', category: '統計學', dueDate: '2026-10-20', priority: '高', minutes: 45, completed: false, customField: { preserved: true } }
const event = { id: 'life-1', title: '朋友晚餐', date: '2026-10-19', startTime: '19:00', endTime: '', location: '台北', people: '朋友', category: '🍽️ 聚餐約會', notes: '已訂位', completed: false, customField: 'preserved' }

test('backup JSON contains both existing storage datasets and preserves extra fields', () => {
  const json = createBackupJson(JSON.stringify([task]), JSON.stringify([event]), '2026-10-18T00:00:00.000Z')
  const backup = parseBackupJson(json)
  assert.equal(backup.format, 'taskflow-ai-backup')
  assert.equal(backup.data['taskflow-tasks'][0].customField.preserved, true)
  assert.equal(backup.data['taskflow-life-events'][0].customField, 'preserved')
})

test('invalid JSON and invalid records are rejected before storage is touched', () => {
  assert.throws(() => parseBackupJson('{'), /JSON/)
  assert.throws(() => parseBackupJson(JSON.stringify({ format: 'taskflow-ai-backup', version: 1, data: { 'taskflow-tasks': [{ title: 'x', workspace: 'life' }], 'taskflow-life-events': [] } })), /工作區/)
})

test('import replaces only the two backup keys with the validated data', () => {
  const storage = new Map([
    ['taskflow-tasks', JSON.stringify([{ id: 'old-task', title: 'old' }])],
    ['taskflow-life-events', JSON.stringify([{ id: 'old-life', title: 'old life' }])],
    ['taskflow-daily-hours', '6'],
  ])
  const adapter = {
    getItem: key => storage.has(key) ? storage.get(key) : null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key),
  }
  const backup = parseBackupJson(createBackupJson(JSON.stringify([task]), JSON.stringify([event])))
  commitBackup(adapter, backup)
  assert.deepEqual(JSON.parse(storage.get('taskflow-tasks')), [task])
  assert.deepEqual(JSON.parse(storage.get('taskflow-life-events')), [event])
  assert.equal(storage.get('taskflow-daily-hours'), '6')
})

test('failed second write restores the previous task storage value', () => {
  const storage = new Map([['taskflow-tasks', '[{"title":"old"}]'], ['taskflow-life-events', '[{"title":"old life"}]']])
  let failOnce = true
  const adapter = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => {
      if (key === 'taskflow-life-events' && failOnce) { failOnce = false; throw new Error('quota') }
      storage.set(key, value)
    },
    removeItem: key => storage.delete(key),
  }
  const backup = parseBackupJson(createBackupJson(JSON.stringify([task]), JSON.stringify([event])))
  assert.throws(() => commitBackup(adapter, backup), /回復/)
  assert.equal(storage.get('taskflow-tasks'), '[{"title":"old"}]')
  assert.equal(storage.get('taskflow-life-events'), '[{"title":"old life"}]')
})
