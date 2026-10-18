import { useMemo, useRef, useState } from 'react'
import './App.css'
import { classifyQuickNote, getTodayOverview, parseLifeQuickNote, parseNatural, type LifeCategory, type LifeQuickDraft, type Priority, type QuickWorkspace, type Workspace } from './quickLogic'
import { commitBackup, createBackupJson, parseBackupJson } from './backup'

type Scope = 'all' | Workspace | 'life'
type Task = { id: string; title: string; workspace: Workspace; category: string; dueDate: string; priority: Priority; minutes: number; completed: boolean }
type Draft = Omit<Task, 'id' | 'completed'>
type LifeEvent = { id: string; title: string; date: string; startTime: string; endTime: string; location: string; people: string; category: LifeCategory; notes: string; completed: boolean }
type LifeDraft = LifeQuickDraft
const studyCategories = ['統計學', '微積分', 'SAS／程式作業', '考試複習', '報告與其他作業']
const businessCategories = ['活動企劃', '宣傳與海報', '採購與庫存', '設備維護', '員工 SOP', '行政與其他']
const priorities: Priority[] = ['高', '中', '低']
const lifeCategories: LifeCategory[] = ['🍽️ 聚餐約會', '🎨 展覽與活動', '🛒 採買與生活', '☕ 休閒放鬆', '👨‍👩‍👧 家人朋友', '✨ 其他']
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const addDays = (day: string, n: number) => { const d = new Date(`${day}T12:00:00`); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

const priorityRank = (p: Priority) => ({ 高: 0, 中: 1, 低: 2 })[p]
function loadLifeEvents(): LifeEvent[] { try { const raw = localStorage.getItem('taskflow-life-events'); if (!raw) return []; const parsed: unknown = JSON.parse(raw); if (!Array.isArray(parsed)) return []; return parsed.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && typeof item.title === 'string').map((item, index) => ({ id: typeof item.id === 'string' ? item.id : `life-${index}`, title: String(item.title), date: typeof item.date === 'string' ? item.date : today(), startTime: typeof item.startTime === 'string' ? item.startTime : '12:00', endTime: typeof item.endTime === 'string' ? item.endTime : '', location: typeof item.location === 'string' ? item.location : '', people: typeof item.people === 'string' ? item.people : '', category: lifeCategories.includes(item.category as LifeCategory) ? item.category as LifeCategory : lifeCategories[5], notes: typeof item.notes === 'string' ? item.notes : '', completed: item.completed === true })) } catch { return [] } }
const inferWorkspace = (category: string, saved?: unknown): Workspace => saved === 'business' || /餐廳|營運|活動企劃|宣傳|海報|採購|庫存|設備維護|員工 SOP|行政/.test(category) ? 'business' : 'study'
function loadTasks(): Task[] {
  try {
    const raw = localStorage.getItem('taskflow-tasks')
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && typeof item.title === 'string').map((item, index) => {
      const oldCategory = typeof item.category === 'string' ? item.category : '個人'
      const workspace = inferWorkspace(oldCategory, item.workspace)
      const category = workspace === 'study' ? (/微積分/.test(oldCategory) ? '微積分' : /統計/.test(oldCategory) ? '統計學' : /SAS|程式/.test(oldCategory) ? 'SAS／程式作業' : /考試/.test(oldCategory) ? '考試複習' : /學業/.test(oldCategory) ? '報告與其他作業' : studyCategories.includes(oldCategory) ? oldCategory : '報告與其他作業') : (/餐廳|工作/.test(oldCategory) ? '行政與其他' : businessCategories.includes(oldCategory) ? oldCategory : '行政與其他')
      return { id: typeof item.id === 'string' ? item.id : `legacy-${index}`, title: String(item.title), workspace, category, dueDate: typeof item.dueDate === 'string' ? item.dueDate : today(), priority: priorities.includes(item.priority as Priority) ? item.priority as Priority : '中', minutes: typeof item.minutes === 'number' && item.minutes > 0 ? item.minutes : 30, completed: item.completed === true }
    })
  } catch { return [] }
}
const dateText = (day: string) => day === today() ? '今天' : day === addDays(today(), 1) ? '明天' : new Date(`${day}T12:00:00`).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })
const App = () => {
  const [tasks, setTasks] = useState<Task[]>(loadTasks)
  const [lifeEvents, setLifeEvents] = useState<LifeEvent[]>(loadLifeEvents)
  const [scope, setScope] = useState<Scope>('all')
  const [filter, setFilter] = useState('全部')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<'date' | 'priority' | 'time'>('date')
  const [natural, setNatural] = useState('')
  const [quickWorkspace, setQuickWorkspace] = useState<QuickWorkspace>('auto')
  const [lifeQuickText, setLifeQuickText] = useState('')
  const [notice, setNotice] = useState('')
  const [editing, setEditing] = useState<Task | null>(null)
  const [modal, setModal] = useState(false)
  const [hours, setHours] = useState(() => { const n = Number(localStorage.getItem('taskflow-daily-hours')); return Number.isFinite(n) && n >= 0 ? n : 6 })
  const [draft, setDraft] = useState<Draft>({ title: '', workspace: 'study', category: studyCategories[0], dueDate: today(), priority: '中', minutes: 30 })
  const [view, setView] = useState<'overview' | 'tasks'>('overview')
  const [lifeFilter, setLifeFilter] = useState('即將到來')
  const [lifeQuery, setLifeQuery] = useState('')
  const [lifeModal, setLifeModal] = useState(false)
  const [editingLife, setEditingLife] = useState<LifeEvent | null>(null)
  const [lifeDraft, setLifeDraft] = useState<LifeDraft>({ title: '', date: today(), startTime: '12:00', endTime: '', location: '', people: '', category: lifeCategories[0], notes: '' })
  const backupFileRef = useRef<HTMLInputElement>(null)
  const scoped = tasks.filter(task => scope === 'all' || task.workspace === scope)
  const todayOverview = getTodayOverview(tasks, lifeEvents, today())
  const pending = scoped.filter(task => !task.completed)
  const completed = scoped.filter(task => task.completed)
  const percent = scoped.length ? Math.round(completed.length / scoped.length * 100) : 0
  const overviewPending = scope === 'all' ? todayOverview.pending : pending
  const overviewCompleted = scope === 'all' ? todayOverview.completed : completed
  const overviewPercent = scope === 'all' ? todayOverview.percent : percent
  const totalMinutes = pending.reduce((sum, task) => sum + task.minutes, 0)
  const availableMinutes = hours * 60
  const overdue = pending.filter(task => task.dueDate < today()).sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const upcoming = pending.filter(task => task.dueDate >= today() && task.dueDate <= addDays(today(), 2)).sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const focusTasks = useMemo(() => [...pending].sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || a.dueDate.localeCompare(b.dueDate) || a.minutes - b.minutes).slice(0, 3), [tasks, scope])
  const visible = [...scoped].filter(task => (filter === '全部' || (filter === '已完成' ? task.completed : task.category === filter)) && task.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())).sort((a, b) => (filter === '已完成' ? 0 : Number(a.completed) - Number(b.completed)) || (sort === 'priority' ? priorityRank(a.priority) - priorityRank(b.priority) : sort === 'time' ? a.minutes - b.minutes : a.dueDate.localeCompare(b.dueDate)))
  const categories = scope === 'business' ? businessCategories : scope === 'study' ? studyCategories : [...studyCategories, ...businessCategories]
  const todayEvents = lifeEvents.filter(event => event.date === today()).sort((a, b) => a.startTime.localeCompare(b.startTime))
  const sortedLifeEvents = [...lifeEvents].sort((a, b) => (a.date || '9999-99-99').localeCompare(b.date || '9999-99-99') || a.startTime.localeCompare(b.startTime))
  const visibleLifeEvents = sortedLifeEvents.filter(event => {
    const search = `${event.title} ${event.location} ${event.people}`.toLocaleLowerCase()
    const isPast = (Boolean(event.date) && event.date < today()) || event.completed
    return (lifeFilter === '全部' || (lifeFilter === '即將到來' && !isPast) || (lifeFilter === '今日行程' && event.date === today()) || (lifeFilter === '過去紀錄' && isPast) || event.category === lifeFilter) && search.includes(lifeQuery.toLocaleLowerCase())
  })
  const save = (next: Task[]) => { setTasks(next); localStorage.setItem('taskflow-tasks', JSON.stringify(next)) }
  const saveLife = (next: LifeEvent[]) => { setLifeEvents(next); localStorage.setItem('taskflow-life-events', JSON.stringify(next)) }
  const addQuickEntry = (text: string, workspace: Exclude<QuickWorkspace, 'auto'>): boolean => {
    const value = text.trim()
    if (!value) return false
    if (workspace === 'life') {
      const parsed = parseLifeQuickNote(value, today())
      saveLife([...lifeEvents, { ...parsed, id: crypto.randomUUID(), completed: false }])
    } else {
      const parsed = parseNatural(value, workspace, today())
      save([{ ...parsed, id: crypto.randomUUID(), completed: false }, ...tasks])
    }
    return true
  }
  const openNew = () => { setEditing(null); const workspace = scope === 'business' ? 'business' : 'study'; setDraft({ title: '', workspace, category: workspace === 'business' ? businessCategories[0] : studyCategories[0], dueDate: today(), priority: '中', minutes: 30 }); setModal(true) }
  const openEdit = (task: Task) => { setEditing(task); setDraft({ ...task }); setModal(true) }
  const openLifeNew = () => { setEditingLife(null); setLifeDraft({ title: '', date: today(), startTime: '12:00', endTime: '', location: '', people: '', category: lifeCategories[0], notes: '' }); setLifeModal(true) }
  const openLifeEdit = (event: LifeEvent) => { setEditingLife(event); setLifeDraft({ title: event.title, date: event.date, startTime: event.startTime, endTime: event.endTime, location: event.location, people: event.people, category: event.category, notes: event.notes }); setLifeModal(true) }
  const submitLife = (event: React.FormEvent) => { event.preventDefault(); if (!lifeDraft.title.trim()) return; saveLife(editingLife ? lifeEvents.map(item => item.id === editingLife.id ? { ...item, ...lifeDraft, title: lifeDraft.title.trim() } : item) : [...lifeEvents, { ...lifeDraft, id: crypto.randomUUID(), title: lifeDraft.title.trim(), completed: false }]); setLifeModal(false) }
  const toggleLife = (id: string) => saveLife(lifeEvents.map(item => item.id === id ? { ...item, completed: !item.completed } : item))
  const deleteLife = (id: string) => { if (window.confirm('確定要刪除這筆生活安排嗎？')) saveLife(lifeEvents.filter(item => item.id !== id)) }
  const updateDraft = (changes: Partial<Draft>) => setDraft(current => { const next = { ...current, ...changes }; if (changes.workspace && changes.workspace !== current.workspace) next.category = changes.workspace === 'study' ? studyCategories[0] : businessCategories[0]; return next })
  const submit = (event: React.FormEvent) => { event.preventDefault(); if (!draft.title.trim()) return; save(editing ? tasks.map(task => task.id === editing.id ? { ...task, ...draft, title: draft.title.trim() } : task) : [{ ...draft, id: crypto.randomUUID(), title: draft.title.trim(), completed: false }, ...tasks]); setModal(false) }
  const addNatural = () => {
    if (!natural.trim()) { setNotice('請先輸入待辦描述'); return }
    const workspace = classifyQuickNote(natural, quickWorkspace)
    if (!workspace) { setNotice('無法確定工作區，請先從快速記下旁選擇工作區'); return }
    if (!addQuickEntry(natural, workspace)) return
    setNatural(''); setQuickWorkspace('auto'); setNotice(`已新增至${workspace === 'study' ? '學業' : workspace === 'business' ? '餐廳營運' : '生活日常'}工作區`); window.setTimeout(() => setNotice(''), 2800)
  }
  const addLifeQuick = () => { if (!addQuickEntry(lifeQuickText, 'life')) return; setLifeQuickText(''); setNotice('生活安排已快速記下'); window.setTimeout(() => setNotice(''), 2800) }
  const exportBackup = () => {
    try {
      const json = createBackupJson(localStorage.getItem('taskflow-tasks'), localStorage.getItem('taskflow-life-events'))
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `taskflow-ai-backup-${today()}.json`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setNotice('備份 JSON 已下載')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '無法匯出備份。')
    }
    window.setTimeout(() => setNotice(''), 3500)
  }
  const importBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return
    try {
      const backup = parseBackupJson(await file.text())
      const tasks = backup.data['taskflow-tasks'].length
      const lifeEvents = backup.data['taskflow-life-events'].length
      const accepted = window.confirm(`即將匯入 ${tasks} 項任務與 ${lifeEvents} 項生活行程。匯入會完整取代目前 taskflow-tasks 與 taskflow-life-events 的資料，不會合併；取消則不會變更任何資料。確定要繼續嗎？`)
      if (!accepted) return
      commitBackup(localStorage, backup)
      setTasks(loadTasks())
      setLifeEvents(loadLifeEvents())
      setNotice('備份已還原，畫面已更新')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '無法匯入備份。現有資料未變更。')
    } finally {
      input.value = ''
      window.setTimeout(() => setNotice(''), 4500)
    }
  }
  const toggle = (id: string) => save(tasks.map(task => task.id === id ? { ...task, completed: !task.completed } : task))
  const remove = (id: string) => { if (window.confirm('確定要刪除這項任務嗎？')) save(tasks.filter(task => task.id !== id)) }
  const day = new Date()
  const title = scope === 'study' ? '學業工作區' : scope === 'business' ? '餐廳營運工作區' : scope === 'life' ? '生活日常' : '今日總覽'
  return <main className={`journal theme-${scope}`}>
    <header className="masthead"><div className="brand-block"><div className="brand-name">TaskFlow <span>AI</span></div><div className="brand-subtitle">把重要的事，一件一件完成。</div></div><div className="date-block"><div className="date-large">{day.toLocaleDateString('zh-TW', { month: 'long', day: 'numeric' })}</div><div className="date-detail">{day.toLocaleDateString('zh-TW', { weekday: 'long', year: 'numeric' })} <span className="date-separator">/</span> 今日完成 {scope === 'life' ? lifeEvents.filter(item => item.date === today() && item.completed).length : scope === 'all' ? todayOverview.completed.length : completed.length} 項，共 {scope === 'life' ? todayEvents.length : scope === 'all' ? todayOverview.items.length : pending.length + completed.length} 項</div></div></header>
    <nav className="workspace-tabs" aria-label="工作區切換">{([['all', '今日總覽', 'OVERVIEW'], ['study', '學業', 'STUDY'], ['business', '餐廳營運', 'BUSINESS'], ['life', '生活日常', 'LIFE']] as const).map(([key, label, english]) => <button key={key} className={`workspace-tab ${scope === key ? 'selected' : ''}`} onClick={() => { setScope(key); setFilter('全部'); setLifeFilter('即將到來'); setView('overview') }}><span>{label}</span><small>{english}</small></button>)}</nav>
    <div className="work-area"><section className="intro-line"><div><div className="eyebrow">{scope === 'all' ? '每日工作手帳' : scope === 'study' ? '課業與複習' : scope === 'business' ? '半醒小酒館' : '私人生活安排'}</div><h1>{title}<span className="title-period">.</span></h1><p>今天星期{day.toLocaleDateString('zh-TW', { weekday: 'long' }).replace('星期', '')}，{scope === 'life' ? `接下來有 ${lifeEvents.filter(item => !item.completed && item.date >= today()).length} 項生活安排。` : pending.length ? `還有 ${pending.length} 項待辦，按重要程度逐步完成。` : '目前沒有待辦，享受一下留白時間。'}</p></div><button className="add-button" onClick={scope === 'life' ? openLifeNew : openNew}>＋ <span>{scope === 'life' ? '新增安排' : '新增任務'}</span></button></section>
    <section className="daily-overview"><div className="overview-main"><div className="section-overline">TODAY AT A GLANCE</div><div className="metric-strip"><div className="metric"><strong>{overviewPending.length}</strong><span>尚未完成</span></div><div className="metric"><strong>{overviewCompleted.length}</strong><span>今日已完成</span></div><div className="metric"><strong>{overviewPercent}<small>%</small></strong><span>完成率</span></div></div><div className="completion-line"><span style={{ width: `${overviewPercent}%` }}/></div><div className="focus-title">{scope === "all" ? "今日待辦" : "今天先完成這三項"}</div>{overviewPending.length ? <ol className="priority-list">{(scope === 'all' ? overviewPending : focusTasks).map((item, index) => <li key={`${item.workspace}-${item.id}`}><span className="priority-number">{String(index + 1).padStart(2, '0')}</span><button onClick={() => item.workspace === 'life' ? toggleLife(item.id) : toggle(item.id)} className="priority-task">{item.title}</button><span className={`priority-text ${item.priority ? `priority-${item.priority}` : ''}`}>{item.priority ? `${item.priority}優先` : '生活安排'}</span></li>)}</ol> : <p className="quiet-empty">待辦清單已清空，做得很好。</p>}</div><aside className="reminders"><div className="section-overline">提醒</div><div className={`reminder-block ${overdue.length ? 'has-overdue' : ''}`}><span className="reminder-count">{overdue.length}</span><div><strong>逾期事項</strong><p>{overdue.length ? overdue.slice(0, 2).map(task => task.title).join('、') : '目前沒有逾期任務'}</p></div></div><div className="reminder-block"><span className="reminder-count upcoming-count">{upcoming.length}</span><div><strong>近期到期</strong><p>{upcoming.length ? `${upcoming[0].title} · ${dateText(upcoming[0].dueDate)}` : '未來三天沒有到期事項'}</p></div></div></aside></section>
    {scope === 'all' && <section className="life-today"><div className="life-today-heading"><div><div className="section-overline">LIFE · TODAY</div><h2>今日生活安排</h2></div><button onClick={() => { setScope('life'); openLifeNew() }}>＋ 新增安排</button></div>{todayEvents.length ? <div className="life-event-list">{todayEvents.map(event => <LifeEventRow key={event.id} event={event} onToggle={toggleLife} onEdit={openLifeEdit} onDelete={deleteLife}/>)}</div> : <p className="life-empty-line">今天還沒有生活安排。 <button onClick={() => { setScope('life'); openLifeNew() }}>安排一點自己的時間 →</button></p>}</section>}
    {scope === 'life' && <section className="life-page"><div className="life-page-head"><div><div className="section-overline">LIFE CALENDAR</div><h2>生活行程</h2><p>聚餐、活動與日常採買，都在這裡好好安排。</p></div><button className="life-add-button" onClick={openLifeNew}>＋ 新增生活安排</button></div><div className="life-tools"><label className="life-search"><span>⌕</span><input value={lifeQuery} onChange={event => setLifeQuery(event.target.value)} placeholder="搜尋名稱、地點或對象"/></label><div className="life-filters">{['即將到來', '今日行程', '過去紀錄', '全部', ...lifeCategories].map(item => <button key={item} className={lifeFilter === item ? 'active' : ''} onClick={() => setLifeFilter(item)}>{item}</button>)}</div></div><div className="life-event-list">{visibleLifeEvents.length ? visibleLifeEvents.map(event => <LifeEventRow key={event.id} event={event} onToggle={toggleLife} onEdit={openLifeEdit} onDelete={deleteLife}/>) : <div className="life-empty">{lifeEvents.length ? '找不到符合條件的生活安排。' : '還沒有生活安排，留一點時間給自己吧。'}<button onClick={openLifeNew}>新增第一筆安排 →</button></div>}</div><div className="life-quick-note"><label htmlFor="life-quick-input">快速記下<span>日期、時間或地點不明確時可留空，按 Shift + Enter 換行</span></label><textarea id="life-quick-input" value={lifeQuickText} onChange={event => setLifeQuickText(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); addLifeQuick() } }} placeholder="記下生活安排，例如：明晚 7 點跟朋友吃飯" rows={2}/><button onClick={addLifeQuick}>加入生活行程 →</button></div></section>}
    <section className="budget-section"><div className="budget-heading"><div><div className="section-overline">TIME BUDGET</div><h2>今天的時間預算</h2></div><label className="hours-input">可用時間 <input type="number" min="0" max="24" step="0.5" value={hours} onChange={event => { const value = Math.max(0, Number(event.target.value)); setHours(value); localStorage.setItem('taskflow-daily-hours', String(value)) }}/> 小時</label></div><div className="budget-values"><div><span>未完成任務預估</span><strong>{totalMinutes >= 60 ? `${Math.floor(totalMinutes / 60)} 小時 ${totalMinutes % 60 ? `${totalMinutes % 60} 分` : ''}` : `${totalMinutes} 分鐘`}</strong></div><div><span>可用時間</span><strong>{hours} 小時</strong></div><div><span>{totalMinutes > availableMinutes ? '超出時間' : '剩餘時間'}</span><strong className={totalMinutes > availableMinutes ? 'over-budget' : ''}>{Math.abs(totalMinutes - availableMinutes) >= 60 ? `${Math.floor(Math.abs(totalMinutes - availableMinutes) / 60)} 小時 ${Math.abs(totalMinutes - availableMinutes) % 60 ? `${Math.abs(totalMinutes - availableMinutes) % 60} 分` : ''}` : `${Math.abs(totalMinutes - availableMinutes)} 分鐘`}</strong></div></div>{totalMinutes > availableMinutes && <p className="budget-warning">任務預估時間超過今天的可用時間。建議先處理逾期與高優先項目，再調整今天的安排。</p>}<div className="budget-footnote">依優先度建議處理順序；此處為時間預算，並非精確日曆排程。</div></section>
    <section className="task-section"><div className="task-section-header"><div><div className="section-overline">YOUR TASKS</div><h2>{view === 'tasks' ? '全部任務' : scope === 'study' ? '學業任務' : scope === 'business' ? '營運任務' : '任務清單'} <span>（{visible.length}）</span></h2></div><div className="list-controls"><label className="search-field"><span>⌕</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜尋任務"/></label><select aria-label="排序方式" value={sort} onChange={event => setSort(event.target.value as typeof sort)}><option value="date">依截止日期</option><option value="priority">依優先度</option><option value="time">依預估時間</option></select></div></div><div className="filters"><button className={filter === '全部' ? 'filter-active' : ''} onClick={() => setFilter('全部')}>全部分類</button>{categories.map(category => <button key={category} className={filter === category ? 'filter-active' : ''} onClick={() => setFilter(category)}>{category}</button>)}<button className={filter === '已完成' ? 'filter-active' : ''} onClick={() => setFilter(filter === '已完成' ? '全部' : '已完成')}>已完成</button></div><div className="task-list">{visible.length ? visible.map((task, index) => <TaskRow key={task.id} task={task} index={index} onToggle={toggle} onEdit={openEdit} onDelete={remove}/>) : <div className="list-empty">{tasks.length ? '沒有符合條件的任務。' : '尚未新增任務，從一件重要的小事開始。'} <button onClick={openNew}>新增任務 →</button></div>}</div></section>
    <section className="quick-add"><div className="quick-label"><span>快速記下</span><small>本機文字解析</small></div><div className="quick-entry"><input value={natural} onChange={event => { setNatural(event.target.value); setQuickWorkspace('auto') }} onKeyDown={event => { if (event.key === 'Enter') addNatural() }} placeholder="例如：明天交統計作業／今晚跟朋友吃飯"/><button onClick={addNatural}>加入清單 <span>→</span></button></div><label className="quick-workspace-choice"><span>歸類</span><select value={quickWorkspace} onChange={event => setQuickWorkspace(event.target.value as QuickWorkspace)}><option value="auto">自動判斷</option><option value="study">學業 Study</option><option value="business">餐廳營運 Business</option><option value="life">生活日常 Life</option></select></label></section>
    <section className="backup-toolbar" aria-label="資料備份"><div className="backup-toolbar-copy"><strong>資料備份</strong><span>備份包含全部學業、餐廳與生活資料</span></div><div className="backup-toolbar-actions"><button type="button" onClick={exportBackup}>匯出備份</button><button type="button" onClick={() => backupFileRef.current?.click()}>匯入還原</button><input ref={backupFileRef} className="backup-file-input" type="file" accept="application/json,.json" onChange={importBackup}/></div></section>
    <footer className="page-footer"><span>TASKFLOW AI <i>·</i> 個人工作手帳</span><span>資料保存在此裝置的瀏覽器中</span></footer></div>
    {notice && <div className="toast">{notice}</div>}
    {modal && <div className="modal-overlay" onClick={event => { if (event.target === event.currentTarget) setModal(false) }}><form className="task-dialog" onSubmit={submit}><div className="dialog-head"><div><div className="section-overline">TASK ENTRY</div><h2>{editing ? '編輯任務' : '新增任務'}</h2></div><button type="button" className="close-dialog" onClick={() => setModal(false)} aria-label="關閉">×</button></div><label className="form-field">任務名稱<input autoFocus required value={draft.title} onChange={event => updateDraft({ title: event.target.value })} placeholder="寫下要完成的事"/></label><div className="form-grid"><label className="form-field">工作區<select value={draft.workspace} onChange={event => updateDraft({ workspace: event.target.value as Workspace })}><option value="study">學業 STUDY</option><option value="business">餐廳營運 BUSINESS</option></select></label><label className="form-field">分類<select value={draft.category} onChange={event => updateDraft({ category: event.target.value })}>{(draft.workspace === 'study' ? studyCategories : businessCategories).map(category => <option key={category}>{category}</option>)}</select></label><label className="form-field">截止日期<input type="date" required value={draft.dueDate} onChange={event => updateDraft({ dueDate: event.target.value })}/></label><label className="form-field">優先度<select value={draft.priority} onChange={event => updateDraft({ priority: event.target.value as Priority })}>{priorities.map(priority => <option key={priority}>{priority}</option>)}</select></label><label className="form-field">預估時間（分鐘）<input type="number" min="1" required value={draft.minutes} onChange={event => updateDraft({ minutes: Number(event.target.value) })}/></label></div><div className="dialog-actions"><button type="button" className="cancel-button" onClick={() => setModal(false)}>取消</button><button type="submit" className="save-button">{editing ? '儲存變更' : '建立任務'} →</button></div></form></div>}
    {lifeModal && <div className="modal-overlay" onClick={event => { if (event.target === event.currentTarget) setLifeModal(false) }}><form className="task-dialog life-dialog" onSubmit={submitLife}><div className="dialog-head"><div><div className="section-overline">LIFE EVENT</div><h2>{editingLife ? '編輯生活安排' : '新增生活安排'}</h2></div><button type="button" className="close-dialog" onClick={() => setLifeModal(false)} aria-label="關閉">×</button></div><label className="form-field">事項名稱<input autoFocus required value={lifeDraft.title} onChange={event => setLifeDraft({ ...lifeDraft, title: event.target.value })} placeholder="例如：和小美吃晚餐"/></label><div className="form-grid"><label className="form-field">日期<input type="date" value={lifeDraft.date} onChange={event => setLifeDraft({ ...lifeDraft, date: event.target.value })}/></label><label className="form-field">開始時間<input type="time" value={lifeDraft.startTime} onChange={event => setLifeDraft({ ...lifeDraft, startTime: event.target.value })}/></label><label className="form-field">結束時間（選填）<input type="time" value={lifeDraft.endTime} onChange={event => setLifeDraft({ ...lifeDraft, endTime: event.target.value })}/></label><label className="form-field">分類<select value={lifeDraft.category} onChange={event => setLifeDraft({ ...lifeDraft, category: event.target.value as LifeCategory })}>{lifeCategories.map(category => <option key={category}>{category}</option>)}</select></label><label className="form-field">地點（選填）<input value={lifeDraft.location} onChange={event => setLifeDraft({ ...lifeDraft, location: event.target.value })} placeholder="餐廳、展覽館…"/></label><label className="form-field">對象（選填）<input value={lifeDraft.people} onChange={event => setLifeDraft({ ...lifeDraft, people: event.target.value })} placeholder="朋友、家人或姓名"/></label></div><label className="form-field">備註（選填）<textarea rows={3} value={lifeDraft.notes} onChange={event => setLifeDraft({ ...lifeDraft, notes: event.target.value })} placeholder="訂位資訊、門票或要買的東西"/></label><div className="dialog-actions"><button type="button" className="cancel-button" onClick={() => setLifeModal(false)}>取消</button><button type="submit" className="save-button">{editingLife ? '儲存變更' : '儲存安排'} →</button></div></form></div>}
  </main>
}
function TaskRow({ task, index, onToggle, onEdit, onDelete }: { task: Task; index: number; onToggle: (id: string) => void; onEdit: (task: Task) => void; onDelete: (id: string) => void }) {
  const late = !task.completed && task.dueDate < today()
  return <article className={`task-row ${task.completed ? 'task-done' : ''}`}><button className={`task-check ${task.completed ? 'checked' : ''}`} onClick={() => onToggle(task.id)} aria-label={task.completed ? '標記為未完成' : '標記為完成'}>{task.completed ? '✓' : ''}</button><span className="row-index">{String(index + 1).padStart(2, '0')}</span><div className="row-content"><div className="row-title-line"><h3>{task.title}</h3><span className={`workspace-label ${task.workspace}`}>{task.workspace === 'study' ? 'STUDY' : 'BUSINESS'}</span></div><div className="row-details"><span>{task.category}</span><span>{late ? '逾期 · ' : ''}{dateText(task.dueDate)}</span><span className={`priority-text priority-${task.priority}`}>{task.priority}優先</span><span>{task.minutes} 分鐘</span></div></div><div className="row-actions"><button title="編輯任務" onClick={() => onEdit(task)}>編輯</button><button title="刪除任務" onClick={() => onDelete(task.id)}>刪除</button></div></article>
}
function LifeEventRow({ event, onToggle, onEdit, onDelete }: { event: LifeEvent; onToggle: (id: string) => void; onEdit: (event: LifeEvent) => void; onDelete: (id: string) => void }) {
  return <article className={`life-event-row ${event.completed ? 'event-done' : ''}`}><button className={`task-check ${event.completed ? 'checked' : ''}`} onClick={() => onToggle(event.id)} aria-label={event.completed ? '標記為未完成' : '標記為已完成'}>{event.completed ? '✓' : ''}</button><div className="event-time"><strong>{event.startTime || '時間未定'}</strong>{event.endTime && <span>至 {event.endTime}</span>}</div><div className="event-copy"><h3>{event.title}</h3><div className="event-meta"><span>{event.category}</span>{event.location && <span>⌖ {event.location}</span>}{event.people && <span>和 {event.people}</span>}</div>{event.notes && <p>{event.notes}</p>}</div><div className="event-date">{event.date ? new Date(`${event.date}T12:00:00`).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric', weekday: 'short' }) : '日期未定'}</div><div className="row-actions"><button onClick={() => onEdit(event)}>編輯</button><button onClick={() => onDelete(event.id)}>刪除</button></div></article>
}
export default App



