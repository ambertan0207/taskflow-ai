export type QuickWorkspace = 'auto' | 'study' | 'business' | 'life'
export type Workspace = Exclude<QuickWorkspace, 'auto' | 'life'>
export type Priority = '高' | '中' | '低'
export type LifeCategory = '🍽️ 聚餐約會' | '🎨 展覽與活動' | '🛒 採買與生活' | '☕ 休閒放鬆' | '👨‍👩‍👧 家人朋友' | '✨ 其他'
export type TaskQuickDraft = { title: string; workspace: Workspace; category: string; dueDate: string; priority: Priority; minutes: number }
export type LifeQuickDraft = { title: string; date: string; startTime: string; endTime: string; location: string; people: string; category: LifeCategory; notes: string }

const lifeCategories: LifeCategory[] = ['🍽️ 聚餐約會', '🎨 展覽與活動', '🛒 採買與生活', '☕ 休閒放鬆', '👨‍👩‍👧 家人朋友', '✨ 其他']
const pad = (value: number) => String(value).padStart(2, '0')
const addDays = (day: string, amount: number) => {
  const date = new Date(`${day}T12:00:00`)
  date.setDate(date.getDate() + amount)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
const weekdayDate = (text: string, baseDate: string) => {
  const match = text.match(/(下週|下周|星期|週|周)([一二三四五六日天])/)
  if (!match) return undefined
  const weekday: Record<string, number> = { 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 }
  const base = new Date(`${baseDate}T12:00:00`)
  const offset = (weekday[match[2]] - base.getDay() + 7) % 7
  return addDays(baseDate, match[1] === '下週' || match[1] === '下周' ? offset || 7 : offset)
}

/** Classifies content first; a manual choice is only a fallback for ambiguous/unknown text. */
export function classifyQuickNote(text: string, selected: QuickWorkspace = 'auto'): Exclude<QuickWorkspace, 'auto'> | null {
  const matches = [
    /餐廳|酒館|半醒|備料|排班|員工|酒水|酒水訂單|啤酒|訂酒|訂貨|訂購|訂位|營運|採購|庫存|設備|海報|活動企劃/.test(text),
    /課程|課堂|上課|作業|繳交|交作業|考試|報告|複習|統計|微積分|SAS|程式|讀書/.test(text),
    /朋友|家人|同學|吃飯|晚餐|午餐|早餐|看展|展覽|逛超市|超市|購物|逛街|旅行|旅遊|約會|聚餐|聚會|電影|散步|咖啡/.test(text),
  ]
  const matched = matches.flatMap((yes, index) => yes ? [(['business', 'study', 'life'] as const)[index]] : [])
  if (matched.length === 1) return matched[0]
  return selected === 'auto' ? null : selected
}

export function parseNatural(text: string, workspace: Workspace, baseDate: string): TaskQuickDraft {
  let dueDate = baseDate
  if (/後天/.test(text)) dueDate = addDays(baseDate, 2)
  else if (/明天|明日/.test(text)) dueDate = addDays(baseDate, 1)
  else if (weekdayDate(text, baseDate)) dueDate = weekdayDate(text, baseDate)!
  else if (/下週|下周/.test(text)) dueDate = addDays(baseDate, 7)
  else { const match = text.match(/(\d{1,2})[月/](\d{1,2})[日號]?/); if (match) dueDate = `${new Date(`${baseDate}T12:00:00`).getFullYear()}-${pad(Number(match[1]))}-${pad(Number(match[2]))}` }
  let category = workspace === 'study' ? '報告與其他作業' : '行政與其他'
  const rules: [RegExp, string][] = workspace === 'study' ? [[/統計/, '統計學'], [/微積分|積分/, '微積分'], [/sas|程式|編程/i, 'SAS／程式作業'], [/考試|期中|期末|複習/, '考試複習']] : [[/活動|企劃|派對/, '活動企劃'], [/海報|宣傳|社群|貼文/, '宣傳與海報'], [/採購|庫存|補貨|盤點|訂貨|訂酒|酒水/, '採購與庫存'], [/設備|維修|保養/, '設備維護'], [/員工|排班|sop|流程/i, '員工 SOP']]
  for (const [pattern, value] of rules) if (pattern.test(text)) { category = value; break }
  const duration = text.match(/(\d+)\s*(分鐘|分|min|小時|hr|hours?)/i)
  const minutes = duration ? Number(duration[1]) * (/小時|hr|hours?/i.test(duration[0]) ? 60 : 1) : 30
  const title = text.replace(/(今天|明天|明日|後天|下週[一二三四五六日天]?|下周[一二三四五六日天]?|星期[一二三四五六日天]|週[一二三四五六日天]|周[一二三四五六日天])/g, '').replace(/\d{1,2}[月/]\d{1,2}[日號]?/g, '').replace(/(高優先|中優先|低優先|優先度高|優先度中|優先度低|高優先度|中優先度|低優先度)/g, '').replace(/\d+\s*(分鐘|分|min|小時|hr|hours?)/ig, '').replace(/(請幫我|幫我|提醒我|記得|要|安排|建立任務)/g, '').replace(/[，,。.!！；;\s]+$/g, '').trim() || text.trim()
  const priority: Priority = /高優先|優先度高|高優先度|考試|截止/.test(text) ? '高' : /低優先|優先度低|低優先度/.test(text) ? '低' : '中'
  return { title, workspace, category, dueDate, priority, minutes }
}

export function parseLifeQuickNote(text: string, baseDate: string): LifeQuickDraft {
  const source = text.trim()
  let date = ''
  if (/今天|今晚/.test(source)) date = baseDate
  else if (/明天|明晚/.test(source)) date = addDays(baseDate, 1)
  else if (/後天/.test(source)) date = addDays(baseDate, 2)
  else {
    const weekday = weekdayDate(source, baseDate)
    if (weekday) date = weekday
    else { const numeric = source.match(/(\d{1,2})[月/](\d{1,2})[日號]?/); if (numeric) date = `${new Date(`${baseDate}T12:00:00`).getFullYear()}-${pad(Number(numeric[1]))}-${pad(Number(numeric[2]))}` }
  }
  let startTime = ''
  const time = source.match(/(早上|上午|中午|下午|晚上|今晚)\s*(\d{1,2})(?::(\d{2}))?\s*(?:點|時)?|(\d{1,2}):(\d{2})|(\d{1,2})\s*(?:點|時)/)
  if (time) {
    let hour = Number(time[2] ?? time[4] ?? time[6]); const period = time[1]
    if ((period === '下午' || period === '晚上' || period === '今晚') && hour < 12) hour += 12
    if ((period === '早上' || period === '上午') && hour === 12) hour = 0
    startTime = `${pad(hour)}:${time[3] ?? time[5] ?? '00'}`
  }
  const peopleMatch = source.match(/(?:跟|和|與|及)([^，。！？\s在去]+)(?=在|去|吃|看|$)/)
  const people = peopleMatch?.[1] ?? ''
  const placeMatch = source.match(/在([^，。！？\s]+?)(?=吃|看|逛|買|約|玩|休息|聚餐|展覽|$|[，。！？])/) ?? source.match(/去(超市|展覽館|美術館|博物館|電影院|咖啡廳|餐廳|百貨公司|書店)/)
  const location = placeMatch?.[1] ?? ''
  const category: LifeCategory = /吃飯|晚餐|午餐|早餐|聚餐|約會/.test(source) ? lifeCategories[0] : /展覽|看展|活動|演唱會|市集/.test(source) ? lifeCategories[1] : /超市|購物|採買|買/.test(source) ? lifeCategories[2] : /休息|放鬆|咖啡|散步|電影/.test(source) ? lifeCategories[3] : /家人|朋友|同學/.test(source) ? lifeCategories[4] : lifeCategories[5]
  const title = source.replace(/(今天|今晚|明天|明晚|後天|(?:下週|下周|星期|週|周)[一二三四五六日天])/g, '').replace(/\d{1,2}[月/]\d{1,2}[日號]?/g, '').replace(/(?:早上|上午|中午|下午|晚上|今晚)?\s*\d{1,2}(?::\d{2})?\s*(?:點|時)?/g, '').replace(/(?:跟|和|與|及)[^，。！？\s在去]+/g, '').replace(placeMatch?.[0] ?? '', '').replace(/^[，,\s]+|[，,。！？\s]+$/g, '').trim()
  return { title: title || source, date, startTime, endTime: '', location, people, category, notes: '' }
}

export type OverviewTask = { id: string; title: string; workspace: Workspace; dueDate: string; priority: Priority; completed: boolean }
export type OverviewLifeEvent = { id: string; title: string; date: string; startTime: string; completed: boolean }
export type TodayOverviewItem = { id: string; title: string; workspace: 'study' | 'business' | 'life'; completed: boolean; priority?: Priority; startTime?: string }
export function getTodayOverview(tasks: OverviewTask[], lifeEvents: OverviewLifeEvent[], today: string) {
  const items: TodayOverviewItem[] = [
    ...tasks.filter(task => task.dueDate === today).map(task => ({ id: task.id, title: task.title, workspace: task.workspace, completed: task.completed, priority: task.priority })),
    ...lifeEvents.filter(event => event.date === today).map(event => ({ id: event.id, title: event.title, workspace: 'life' as const, completed: event.completed, startTime: event.startTime })),
  ]
  items.sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? '') || a.title.localeCompare(b.title, 'zh-Hant'))
  const pending = items.filter(item => !item.completed)
  const completed = items.filter(item => item.completed)
  return { items, pending, completed, percent: items.length ? Math.round(completed.length / items.length * 100) : 0 }
}
