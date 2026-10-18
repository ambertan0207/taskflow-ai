const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')

const source = fs.readFileSync(path.join(__dirname, '../src/quickLogic.ts'), 'utf8')
const compiled = ts.transpile(source, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 })
const loadedModule = { exports: {} }
new Function('exports', 'require', 'module', compiled)(loadedModule.exports, require, loadedModule)
const { classifyQuickNote, getTodayOverview, parseLifeQuickNote, parseNatural } = loadedModule.exports

const today = '2026-10-18'

test('quick classification uses current text, not a previously selected workspace', () => {
  assert.equal(classifyQuickNote('明天晚上 7 點跟朋友在台北吃飯'), 'life')
  assert.equal(classifyQuickNote('明天交統計作業', 'life'), 'study')
  assert.equal(classifyQuickNote('今天餐廳備料'), 'business')
  assert.equal(classifyQuickNote('明天訂酒水訂單'), 'business')
  assert.equal(classifyQuickNote('下週一交微積分作業'), 'study')
})

test('unknown or overlapping quick entries require a current manual choice', () => {
  assert.equal(classifyQuickNote('明天處理一下'), null)
  assert.equal(classifyQuickNote('排班作業'), null)
  assert.equal(classifyQuickNote('明天處理一下', 'business'), 'business')
})

test('life quick parsing keeps tomorrow date, evening time, people, place, and category', () => {
  const event = parseLifeQuickNote('明天晚上 7 點跟朋友在台北吃飯', today)
  assert.equal(event.date, '2026-10-19')
  assert.equal(event.startTime, '19:00')
  assert.equal(event.location, '台北')
  assert.equal(event.people, '朋友')
  assert.equal(event.category, '🍽️ 聚餐約會')
  assert.equal(parseLifeQuickNote('明天跟朋友看電影', today).category, '☕ 休閒放鬆')
})

test('study parsing does not let date words change its workspace or category', () => {
  const task = parseNatural('明天交統計作業', 'study', today)
  assert.equal(task.workspace, 'study')
  assert.equal(task.dueDate, '2026-10-19')
  assert.equal(task.category, '統計學')
})

test('today overview includes only items dated today and recalculates counts from current arrays', () => {
  const tasks = [
    { id: 'a', title: 'Study due today', workspace: 'study', dueDate: today, priority: '中', completed: false },
    { id: 'b', title: 'Business completed today', workspace: 'business', dueDate: today, priority: '高', completed: true },
    { id: 'c', title: 'Business due today', workspace: 'business', dueDate: today, priority: '低', completed: false },
    { id: 'd', title: 'Future study task', workspace: 'study', dueDate: '2026-10-19', priority: '中', completed: false },
  ]
  const events = [
    { id: 'e', title: 'Life today', date: today, startTime: '19:00', completed: false },
    { id: 'f', title: 'Life completed today', date: today, startTime: '12:00', completed: true },
    { id: 'g', title: 'Life tomorrow', date: '2026-10-19', startTime: '09:00', completed: false },
  ]
  const summary = getTodayOverview(tasks, events, today)
  assert.equal(summary.items.length, 5)
  assert.equal(summary.pending.length, 3)
  assert.equal(summary.completed.length, 2)
  assert.equal(summary.percent, 40)
  assert.ok(summary.pending.some(item => item.id === 'e' && item.workspace === 'life'))
  assert.ok(summary.items.every(item => item.id !== 'd' && item.id !== 'g'))

  const changed = getTodayOverview(tasks.map(item => item.id === 'a' ? { ...item, completed: true } : item), events, today)
  assert.equal(changed.pending.length, 2)
  assert.equal(changed.completed.length, 3)
  assert.equal(changed.percent, 60)
  const removed = getTodayOverview(tasks.filter(item => item.id !== 'c'), events, today)
  assert.equal(removed.items.length, 4)
})
