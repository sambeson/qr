/* Townie: guess the New Jersey town. No build step, no dependencies. */
(() => {
  'use strict'

  const TOWNS = window.TOWNS
  const NJ = window.NJ
  const MAX_GUESSES = 6
  const LAUNCH = Date.UTC(2026, 10, 9)         // No. 1 = 9 Nov 2026 (Eastern)
  const TZ = 'America/New_York'
  const SEED = 0x7041E                         // fixed: everyone gets the same order
  const MAX_MILES = 170                        // ~ High Point → Cape May Point
  const STORE_KEY = 'townie:v1'
  const UNIT = NJ.unitsPerMile

  const $ = (s) => document.querySelector(s)
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  const fmt = (n) => n.toLocaleString('en-US')

  /* ── calendar (Eastern time) ───────────────────────────── */
  const etParts = (d = new Date()) => {
    const p = {}
    new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' })
      .formatToParts(d).forEach(({ type, value }) => { p[type] = +value })
    return p
  }
  const puzzleNo = (d) => { const p = etParts(d); return Math.floor((Date.UTC(p.year, p.month - 1, p.day) - LAUNCH) / 864e5) + 1 }
  const secondsToMidnight = () => { const p = etParts(); return 86400 - (p.hour * 3600 + p.minute * 60 + p.second) }

  /* ── deterministic daily order ─────────────────────────── */
  const mulberry32 = (a) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 }
  const orderCache = {}
  const cycleOrder = (cycle) => {
    if (orderCache[cycle]) return orderCache[cycle]
    const rand = mulberry32(SEED + cycle * 7919)
    const o = TOWNS.map((_, i) => i)
    for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [o[i], o[j]] = [o[j], o[i]] }
    return (orderCache[cycle] = o)
  }
  const answerFor = (no) => {
    const k = Math.max(0, no - 1)
    return cycleOrder(Math.floor(k / TOWNS.length))[k % TOWNS.length]
  }

  /* ── geometry ──────────────────────────────────────────── */
  const rad = (d) => d * Math.PI / 180
  const miles = (a, b) => {
    const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon)
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2
    return 3958.8 * 2 * Math.asin(Math.sqrt(h))
  }
  const bearing = (a, b) => {
    const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat))
    const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon))
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
  }
  const proximity = (d) => Math.max(0, Math.round((1 - d / MAX_MILES) * 100))
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI']
  const ARROWS = ['⬆️', '↗️', '➡️', '↘️', '⬇️', '↙️', '⬅️', '↖️']
  const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  const octant = (deg) => Math.round(deg / 45) % 8

  /* ── persistence ───────────────────────────────────────── */
  const blank = () => ({ stats: { played: 0, wins: 0, cur: 0, max: 0, dist: [0, 0, 0, 0, 0, 0], losses: 0, lastWinNo: null, lastPlayedNo: null }, games: {}, settings: { theme: 'auto', tips: 'on' }, seenHelp: false })
  const load = () => {
    try {
      const s = JSON.parse(localStorage.getItem(STORE_KEY))
      if (s && s.stats) { const b = blank(); return { ...b, ...s, stats: { ...b.stats, ...s.stats }, settings: { ...b.settings, ...s.settings } } }
    } catch (e) {}
    return blank()
  }
  let store = load()
  const save = () => {
    // keep the last 60 daily games
    const keys = Object.keys(store.games).map(Number).sort((a, b) => b - a)
    keys.slice(60).forEach((k) => delete store.games[k])
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)) } catch (e) {}
  }

  /* ── state ─────────────────────────────────────────────── */
  let today = puzzleNo()
  let game = null           // { mode, no, answer, guesses:[idx], over, won, hard }
  let selected = null       // town index chosen from the list
  let active = -1           // highlighted suggestion

  const dailyGame = () => {
    const saved = store.games[today]
    return { mode: 'daily', no: today, answer: answerFor(today), guesses: saved ? saved.g.slice() : [], over: !!(saved && saved.over), won: !!(saved && saved.won), hard: saved ? !!saved.hard : store.settings.tips === 'off' }
  }
  const practiceGame = () => {
    let a; do { a = Math.floor(Math.random() * TOWNS.length) } while (a === answerFor(today))
    return { mode: 'practice', no: null, answer: a, guesses: [], over: false, won: false, hard: store.settings.tips === 'off' }
  }
  const persist = () => {
    if (game.mode !== 'daily') return
    store.games[game.no] = { g: game.guesses, over: game.over, won: game.won, hard: game.hard }
    save()
  }

  // a streak breaks if you skip a day
  const settleStreak = () => {
    const s = store.stats
    if (s.cur > 0 && s.lastWinNo != null && s.lastWinNo < today - 1) { s.cur = 0; save() }
  }

  /* ── search ────────────────────────────────────────────── */
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[.'’]/g, '').replace(/\btwp\b/g, 'township').replace(/\bboro\b/g, 'borough').replace(/\bmt\b/g, 'mount')
    .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
  const INDEX = TOWNS.map((t, i) => ({ i, key: norm(t.s), full: norm(t.n), words: norm(t.n).split(' ') }))
  const search = (q) => {
    q = norm(q)
    if (!q) return []
    const out = []
    for (const r of INDEX) {
      let rank = -1
      if (r.key.startsWith(q) || r.full.startsWith(q)) rank = 0
      else if (r.words.some((w, wi) => r.words.slice(wi).join(' ').startsWith(q))) rank = 1
      else if (q.length >= 3 && r.full.includes(q)) rank = 2
      if (rank >= 0) out.push([rank, -TOWNS[r.i].p, r.i])
    }
    return out.sort((a, b) => a[0] - b[0] || a[1] - b[1]).slice(0, 8).map((x) => x[2])
  }
  const resolveExact = (q) => {
    q = norm(q)
    const hits = INDEX.filter((r) => r.key === q || r.full === q)
    return hits.length === 1 ? hits[0].i : null
  }

  /* ── rendering: silhouette ─────────────────────────────── */
  const SVGNS = 'http://www.w3.org/2000/svg'
  const svgEl = (tag, attrs) => { const e = document.createElementNS(SVGNS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e }

  let plateSpan = 1
  const drawPlate = (animate) => {
    const t = TOWNS[game.answer]
    const svg = $('#silhouette')
    const [x, y, w, h] = t.b
    const S = Math.max(w, h) * 1.06
    plateSpan = S
    svg.setAttribute('viewBox', `${x + w / 2 - S / 2} ${y + h / 2 - S / 2} ${S} ${S}`)
    svg.replaceChildren(svgEl('path', { d: t.d, class: animate ? 'reveal-in' : '' }))
    svg.classList.toggle('solved', game.over && game.won)
    svg.classList.toggle('missed', game.over && !game.won)
    drawScale()
  }
  const drawScale = () => {
    const px = $('#silhouette').getBoundingClientRect().width || 180
    const pxPerMile = (UNIT / plateSpan) * px
    const steps = [0.05, 0.1, 0.25, 0.5, 1, 2, 3, 5, 10, 20]
    let len = steps[0]
    for (const s of steps) { if (s * pxPerMile <= 110) len = s }
    $('#scale-bar').style.width = `${Math.round(len * pxPerMile)}px`
    const label = len === 0.25 ? '¼' : len === 0.5 ? '½' : String(len)
    $('#scale-label').textContent = `${label} mi`
  }

  /* ── rendering: order rows ─────────────────────────────── */
  const arrowSvg = (deg) => `<svg viewBox="0 0 24 24" style="transform:rotate(${deg.toFixed(0)}deg)" aria-hidden="true"><path d="M12 3l5 9h-3.2v9h-3.6v-9H7z"/></svg>`
  const starSvg = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7"/></svg>'

  const rowFor = (gi, isNew) => {
    const li = el('li', 'row')
    const idx = game.guesses[gi]
    if (idx == null) {
      li.classList.add('empty')
      li.innerHTML = `<span class="no">${ROMAN[gi]}</span><span class="item"><b>&nbsp;</b><small>&nbsp;</small></span><span class="leader"></span><span class="miles"></span><span class="dir"></span><span class="pct"></span>`
      return li
    }
    const g = TOWNS[idx], a = TOWNS[game.answer]
    const win = idx === game.answer
    const d = win ? 0 : miles(g, a)
    const pct = win ? 100 : proximity(d)
    const deg = bearing(g, a)
    if (win) li.classList.add('win')
    if (isNew) li.classList.add('new')
    const dist = win ? '0' : d < 10 ? d.toFixed(1) : Math.round(d)
    li.innerHTML =
      `<span class="no">${ROMAN[gi]}</span>` +
      `<span class="item"><b>${esc(g.s)}</b><small>${esc(g.t)}, ${esc(g.c)} Co.</small></span>` +
      `<span class="leader"></span>` +
      `<span class="miles">${dist}<small>mi</small></span>` +
      `<span class="dir">${win ? starSvg : arrowSvg(deg)}</span>` +
      `<span class="pct" style="--p:${pct}%">${pct}%</span>`
    li.setAttribute('aria-label', win
      ? `Guess ${gi + 1}: ${g.n}, ${g.c} County. Correct!`
      : `Guess ${gi + 1}: ${g.n}, ${g.c} County. ${dist} miles away, head ${COMPASS[octant(deg)]}. ${pct}% close.`)
    return li
  }
  const drawRows = (newIdx = -1) => {
    const ol = $('#order-list')
    ol.replaceChildren(...Array.from({ length: MAX_GUESSES }, (_, i) => rowFor(i, i === newIdx)))
  }

  /* ── server’s tips ─────────────────────────────────────── */
  const drawTip = () => {
    const tip = $('#tip')
    const misses = game.guesses.filter((g) => g !== game.answer).length
    if (store.settings.tips === 'off' || game.over || misses < 3) { tip.hidden = true; return }
    const a = TOWNS[game.answer]
    let msg = `<span class="tip-label">Hint</span>${esc(a.c)} County.`
    if (misses >= 5) msg += ` A ${esc(a.t.toLowerCase())} of about ${fmt(roundPop(a.p))} people.`
    tip.innerHTML = msg
    tip.hidden = false
  }
  const roundPop = (p) => p < 100 ? p : p < 1000 ? Math.round(p / 10) * 10 : p < 10000 ? Math.round(p / 100) * 100 : Math.round(p / 1000) * 1000

  /* ── reveal ────────────────────────────────────────────── */
  let mapBase = null
  const drawMap = () => {
    const svg = $('#nj-map')
    const pad = 300
    svg.setAttribute('viewBox', `${-pad} ${-pad} ${NJ.width + pad * 2} ${NJ.height + pad * 2}`)
    if (!mapBase) {
      mapBase = svgEl('g', {})
      // one combined path keeps the DOM light
      mapBase.appendChild(svgEl('path', { class: 'muni', d: TOWNS.map((t) => t.d).join('') }))
    }
    const a = TOWNS[game.answer]
    const over = svgEl('g', {})
    over.appendChild(svgEl('path', { class: 'answer', d: a.d }))
    for (const gi of game.guesses) {
      if (gi === game.answer) continue
      const g = TOWNS[gi]
      over.appendChild(svgEl('line', { class: 'guess-line', x1: g.x, y1: g.y, x2: a.x, y2: a.y }))
    }
    for (const gi of game.guesses) {
      if (gi === game.answer) continue
      over.appendChild(svgEl('circle', { class: 'guess-dot', cx: TOWNS[gi].x, cy: TOWNS[gi].y, r: 260 }))
    }
    over.appendChild(svgEl('circle', { class: 'ring', cx: a.x, cy: a.y, r: Math.max(700, Math.max(a.b[2], a.b[3]) * 0.7) }))
    svg.replaceChildren(mapBase, over)
  }
  const drawReveal = () => {
    const r = $('#reveal')
    const pad = $('#order-pad')
    if (!game.over) { r.hidden = true; pad.hidden = false; return }
    pad.hidden = true
    r.hidden = false
    const a = TOWNS[game.answer]
    const n = game.guesses.length
    $('#reveal-verdict').innerHTML = game.won
      ? `<b>Opa!</b>${n === 1 ? 'First guess.' : `Got it in ${n}.`}`
      : '<b>Out of guesses</b>The answer was'
    $('#reveal-name').textContent = a.s
    const best = game.guesses.filter((g) => g !== game.answer).map((g) => miles(TOWNS[g], a))
    const rows = [
      ['County', a.c],
      ['Type', a.t],
      ['Pop. (2010)', fmt(a.p)],
      ['Area', `${a.a} sq mi`],
      ['Your score', game.won ? `${n}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`],
    ]
    if (best.length) rows.push(['Closest miss', `${Math.min(...best).toFixed(1)} mi`])
    $('#facts').innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')
    drawMap()
    const daily = game.mode === 'daily'
    $('#share-btn').textContent = daily ? 'Share' : 'Back to today'
    $('#refill-btn').textContent = daily ? 'Practice' : 'Another one'
  }

  /* ── input & suggestions ───────────────────────────────── */
  const input = $('#guess-input')
  const list = $('#suggestions')
  let suggestions = []
  const closeList = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); active = -1 }
  const highlight = (name, q) => {
    const nq = norm(q)
    const n = norm(name)
    const at = n.indexOf(nq)
    // norm() keeps character positions for plain names; fall back gracefully otherwise
    if (!nq || at < 0 || n.length !== name.length) return esc(name)
    return esc(name.slice(0, at)) + '<mark>' + esc(name.slice(at, at + nq.length)) + '</mark>' + esc(name.slice(at + nq.length))
  }
  const openList = () => {
    const q = input.value
    suggestions = search(q)
    if (!q.trim()) { closeList(); return }
    list.replaceChildren()
    if (!suggestions.length) {
      list.appendChild(el('li', 'none', 'No matches.'))
    } else {
      suggestions.forEach((i, k) => {
        const t = TOWNS[i]
        const li = el('li', game.guesses.includes(i) ? 'used' : '', `<b>${highlight(t.s, q)}</b><span>${esc(t.t)}, ${esc(t.c)} Co.</span>`)
        li.id = `sug-${k}`
        li.setAttribute('role', 'option')
        li.setAttribute('aria-selected', k === active ? 'true' : 'false')
        li.addEventListener('mousedown', (e) => { e.preventDefault(); choose(k) })
        list.appendChild(li)
      })
    }
    list.hidden = false
    input.setAttribute('aria-expanded', 'true')
  }
  const setActive = (k) => {
    active = k
    list.querySelectorAll('[role=option]').forEach((li, j) => li.setAttribute('aria-selected', j === k ? 'true' : 'false'))
    if (k >= 0) { input.setAttribute('aria-activedescendant', `sug-${k}`); list.children[k]?.scrollIntoView({ block: 'nearest' }) }
  }
  const choose = (k) => {
    const i = suggestions[k]
    if (i == null) return
    selected = i
    input.value = TOWNS[i].s
    closeList()
    submit()
  }

  input.addEventListener('input', () => { selected = null; active = -1; openList(); if (suggestions.length) setActive(0) })
  input.addEventListener('focus', () => { if (input.value.trim() && selected == null) openList() })
  input.addEventListener('blur', () => setTimeout(closeList, 120))
  input.addEventListener('keydown', (e) => {
    if (list.hidden || !suggestions.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((active + 1) % suggestions.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((active - 1 + suggestions.length) % suggestions.length) }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); choose(active) }
    else if (e.key === 'Escape') closeList()
  })
  $('#order-pad').addEventListener('submit', (e) => { e.preventDefault(); submit() })

  const reject = (msg) => {
    toast(msg)
    const c = $('.combo'); c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake')
  }

  const submit = () => {
    if (game.over) return
    let i = selected
    if (i == null) i = resolveExact(input.value)
    if (i == null) {
      const s = search(input.value)
      if (s.length === 1) i = s[0]
    }
    if (i == null) { reject(input.value.trim() ? 'Pick a town from the list.' : 'Type a town name.'); return }
    if (game.guesses.includes(i)) { reject('Already guessed.'); return }

    game.guesses.push(i)
    selected = null
    input.value = ''
    closeList()
    const won = i === game.answer
    if (won || game.guesses.length >= MAX_GUESSES) finish(won)
    persist()
    drawRows(game.guesses.length - 1)
    drawTip()
    if (game.over) {
      drawPlate(false)
      drawReveal()
      setTimeout(() => $('#reveal').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }), 350)
      if (game.mode === 'daily') setTimeout(() => openStats(), 2200)
    } else {
      input.focus()
    }
  }

  const finish = (won) => {
    game.over = true
    game.won = won
    if (game.mode !== 'daily') return
    const s = store.stats
    s.played++
    s.lastPlayedNo = game.no
    if (won) {
      s.wins++
      s.dist[game.guesses.length - 1]++
      s.cur = s.lastWinNo === game.no - 1 ? s.cur + 1 : 1
      s.max = Math.max(s.max, s.cur)
      s.lastWinNo = game.no
    } else {
      s.losses++
      s.cur = 0
    }
  }

  /* ── share ─────────────────────────────────────────────── */
  const shareText = (g) => {
    const a = TOWNS[g.answer]
    const lines = g.guesses.map((gi) => {
      if (gi === g.answer) return '🟦🟦🟦🟦🟦 🏛️'
      const full = Math.round(proximity(miles(TOWNS[gi], a)) / 20)
      return '🟦'.repeat(full) + '⬜'.repeat(5 - full) + ' ' + ARROWS[octant(bearing(TOWNS[gi], a))]
    })
    const score = g.won ? g.guesses.length : 'X'
    const url = location.href.split(/[?#]/)[0]
    return `Townie #${g.no} ${score}/${MAX_GUESSES}${g.hard ? '*' : ''}\n\n${lines.join('\n')}\n\n${url}`
  }
  const share = async (g = game) => {
    const text = shareText(g)
    const touch = matchMedia('(pointer: coarse)').matches
    if (touch && navigator.share) {
      try { await navigator.share({ text }); return } catch (e) { if (e.name === 'AbortError') return }
    }
    try { await navigator.clipboard.writeText(text); toast('Copied to clipboard.') }
    catch (e) { prompt('Copy your result:', text) }
  }

  /* ── stats (guest check) ───────────────────────────────── */
  const openStats = () => {
    const s = store.stats
    $('#check-no').textContent = String(today).padStart(4, '0')
    const pct = s.played ? Math.round((s.wins / s.played) * 100) : 0
    $('#stat-grid').innerHTML = [[s.played, 'Played'], [pct, 'Win %'], [s.cur, 'Streak'], [s.max, 'Best']]
      .map(([v, k]) => `<div><b>${v}</b><span>${k}</span></div>`).join('')
    const todays = store.games[today]
    const rows = [...s.dist.map((v, i) => [String(i + 1), v, todays && todays.won && todays.g.length === i + 1]), ['✕', s.losses, todays && todays.over && !todays.won]]
    const max = Math.max(1, ...rows.map((r) => r[1]))
    $('#dist').innerHTML = rows.map(([k, v, hot]) =>
      `<div class="dist-row${hot ? ' today' : ''}"><span>${k}</span><span class="dist-bar" style="width:${Math.max(8, (v / max) * 100)}%">${v}</span></div>`).join('')
    $('#stats-share').hidden = !(todays && todays.over)
    showDialog('#dlg-stats')
  }
  $('#stats-share').addEventListener('click', () => share(dailyGame()))

  /* ── dialogs, toast, settings ──────────────────────────── */
  const showDialog = (sel) => {
    const d = $(sel)
    document.querySelectorAll('dialog[open]').forEach((o) => o !== d && o.close())
    if (!d.open) d.showModal()
  }
  document.querySelectorAll('dialog').forEach((d) => {
    d.addEventListener('click', (e) => { if (e.target === d) d.close() }) // backdrop click
  })
  $('#dlg-help').addEventListener('close', () => { if (!store.seenHelp) { store.seenHelp = true; save() } })

  let toastTimer
  const toast = (msg) => {
    const t = $('#toast')
    t.textContent = msg
    t.classList.add('show')
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => t.classList.remove('show'), 2200)
  }

  const applyTheme = () => {
    const th = store.settings.theme
    if (th === 'auto') delete document.documentElement.dataset.theme
    else document.documentElement.dataset.theme = th
  }
  document.querySelectorAll('input[name=theme]').forEach((r) => {
    r.checked = r.value === store.settings.theme
    r.addEventListener('change', () => { store.settings.theme = r.value; save(); applyTheme() })
  })
  document.querySelectorAll('input[name=tips]').forEach((r) => {
    r.checked = r.value === store.settings.tips
    r.addEventListener('change', () => {
      store.settings.tips = r.value
      // turning tips on mid-game forfeits the hard-mode star
      if (r.value === 'on' && !game.over) { game.hard = false; persist() }
      if (r.value === 'off' && !game.over && game.guesses.length === 0) { game.hard = true; persist() }
      save(); drawTip()
    })
  })

  $('#btn-help').addEventListener('click', () => showDialog('#dlg-help'))
  $('#btn-stats').addEventListener('click', openStats)
  $('#btn-settings').addEventListener('click', () => showDialog('#dlg-settings'))
  $('#share-btn').addEventListener('click', () => { if (game.mode === 'daily') share(); else start(dailyGame()) })
  $('#refill-btn').addEventListener('click', () => { start(practiceGame()); window.scrollTo({ top: 0, behavior: 'smooth' }) })

  /* ── countdown & day rollover ──────────────────────────── */
  const tick = () => {
    const s = secondsToMidnight()
    const hh = String(Math.floor(s / 3600)).padStart(2, '0')
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
    const ss = String(s % 60).padStart(2, '0')
    $('#countdown').textContent = `${hh}:${mm}:${ss}`
    const now = puzzleNo()
    if (now !== today) {
      today = now
      settleStreak()
      drawMeta()
      if (game.mode === 'daily') { start(dailyGame()); toast('A new town is up.') }
    }
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick() })

  const drawMeta = () => {
    $('#meta-no').textContent = `#${today}`
    $('#meta-date').textContent = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric' }).format(new Date())
  }

  /* ── boot ──────────────────────────────────────────────── */
  const start = (g) => {
    game = g
    selected = null
    input.value = ''
    input.disabled = false
    $('#mode-tag').hidden = game.mode !== 'practice'
    $('#special-title').textContent = game.mode === 'practice' ? 'Practice' : 'Today’s Special'
    drawPlate(true)
    drawRows()
    drawTip()
    drawReveal()
  }

  settleStreak()
  applyTheme()
  drawMeta()
  start(dailyGame())
  tick()
  setInterval(tick, 1000)
  window.addEventListener('resize', drawScale)
  if (document.fonts) document.fonts.ready.then(drawScale)
  if (!store.seenHelp) showDialog('#dlg-help')

  // test hook (harmless in production)
  window.__townie = { answerFor, puzzleNo, TOWNS }
})()
