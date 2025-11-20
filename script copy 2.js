// ---------- script.js (simplificado y estable) ----------
// Funcionalidades:
// - Soporta rangos (p.ej. "2-3") para transporte, comida y descanso
// - Muestreo uniforme reproducible con semilla
// - Asignación greedy de bloques de estudio respetando clases, transporte y comidas
// - Resumen simple y guardado/carga de escenarios en localStorage
// ---------------------------------------------------------

// Colores para exámenes
const examColors = ["#6366f1","#8b5cf6","#ec4899","#f59e0b","#10b981","#3b82f6","#ef4444","#14b8a6","#f97316","#a855f7"]
const daysOfWeek = ["LU","MA","MI","JU","VI","SA"]

/* ------------------- Utilidades ------------------- */
function $(id){ return document.getElementById(id) }
function safeParseFloat(v, fallback=0){ const n = parseFloat(v); return isNaN(n) ? fallback : n }

// Parseo de rangos horarios tipo "8-10,14-16" -> [{start:8,end:10},...]
function parseTimeRanges(str){
  if(!str) return []
  return str.split(",")
    .map(s => s.trim())
    .map(r => {
      const [a,b] = r.split("-").map(x => x && x.trim())
      if(!a || !b) return null
      const s = Number.parseFloat(a), e = Number.parseFloat(b)
      if(isNaN(s)||isNaN(e)||s>=e) return null
      return { start: s, end: e }
    })
    .filter(Boolean)
    .sort((x,y)=>x.start-y.start)
}

// Parseo simple de rango "2-3" o "2" -> {min,max}
function parseRangeSimple(str){
  if(!str) return null
  const parts = str.split("-").map(p=>p.trim())
  if(parts.length===1){
    const v=safeParseFloat(parts[0], NaN); if(isNaN(v)) return null; return {min:v,max:v}
  }
  const a=safeParseFloat(parts[0], NaN), b=safeParseFloat(parts[1], NaN)
  if(isNaN(a)||isNaN(b)) return null
  return {min: Math.min(a,b), max: Math.max(a,b)}
}

// Suma horas en ranges [{start,end},...]
function totalRangesHours(ranges){ return ranges.reduce((s,r)=>s + Math.max(0, r.end - r.start), 0) }

// PRNG reproducible (mulberry32)
function mulberry32(seed){
  let t = seed >>> 0
  return function(){
    t += 0x6D2B79F5
    let r = Math.imul(t ^ (t >>> 15), t | 1)
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}
function sampleUniform(range, rng){
  if(!range) return 0
  if(Math.abs(range.max - range.min) < 1e-9) return range.min
  return range.min + rng() * (range.max - range.min)
}

/* ------------------- Bloques libres en un día ------------------- */
// startHour,endHour: números (p.ej. 7, 22)
// occupied: array [{start,end}] (pueden solaparse)
function freeBlocksInDay(startHour, endHour, occupied){
  const result = []
  if(!occupied || occupied.length===0){ result.push({start:startHour,end:endHour}); return result }
  // ordenar y fusionar ocupados
  const occ = occupied.slice().sort((a,b)=>a.start-b.start)
  const merged = []
  for(const r of occ){
    if(merged.length===0) merged.push({start:r.start,end:r.end})
    else {
      const last = merged[merged.length-1]
      if(r.start <= last.end + 1e-9) last.end = Math.max(last.end, r.end)
      else merged.push({start:r.start,end:r.end})
    }
  }
  let cursor = startHour
  for(const m of merged){
    if(cursor < m.start) result.push({start:cursor, end: m.start})
    cursor = Math.max(cursor, m.end)
  }
  if(cursor < endHour) result.push({start: cursor, end: endHour})
  // filtrar bloques de duración positiva
  return result.filter(b => b.end - b.start > 1e-6)
}

/* ------------------- Asignación simple y robusta ------------------- */
/*
  exams: [{index,name,daysRemaining,difficulty}]
  classSchedules: {LU:[{start,end}], ...}
  startHour,endHour: enteros
  transportSlots, mealSlots: arrays of {start,end} (apply every day)
  sampledRest: número de horas de descanso total (repartimos equitativamente)
  currentDayIndex: 0..5
*/
function allocateStudy(exams, classSchedules, startHour, endHour, transportSlots, mealSlots, sampledRest, currentDayIndex){
  // preparar output
  const schedule = {}
  const capacityPerDay = {}
  daysOfWeek.forEach(d => schedule[d]=[])
  // fixed rest per day
  const restPerDay = sampledRest / 6
  // crear bloques libres y capacidad por día
  const dayFreeBlocks = {}
  daysOfWeek.forEach(d => {
    const occupied = []
    ;(classSchedules[d]||[]).forEach(c => occupied.push({start:c.start,end:c.end}))
    transportSlots.forEach(t => occupied.push({start:t.start,end:t.end}))
    mealSlots.forEach(m => occupied.push({start:m.start,end:m.end}))
    const free = freeBlocksInDay(startHour,endHour,occupied)
    dayFreeBlocks[d] = free
    const totalFree = totalRangesHours(free)
    capacityPerDay[d] = Math.max(0, totalFree - restPerDay)
  })

  // ordenar examenes por fecha (urgencia)
  const sorted = exams.slice().sort((a,b)=>a.daysRemaining - b.daysRemaining)

  // helper para consumir bloques en un día: intenta asignar 'hours' y devuelve cuanto asignó
  function allocateToDay(dayCode, hours, examName){
    if(hours <= 0) return 0
    const blocks = dayFreeBlocks[dayCode]
    let remaining = hours
    for(let i=0;i<blocks.length && remaining>1e-6;){
      const b = blocks[i]
      const avail = b.end - b.start
      if(avail <= 1e-6){ blocks.splice(i,1); continue }
      const use = Math.min(avail, remaining)
      schedule[dayCode].push({ start: b.start, end: b.start + use, exam: examName })
      b.start += use
      remaining -= use
      if(b.end - b.start <= 1e-6) blocks.splice(i,1)
      else i++
    }
    return hours - remaining
  }

  // asignación greedy por exam
  for(const ex of sorted){
    const hoursNeeded = ex.difficulty === 1 ? 2 : ex.difficulty === 2 ? 6 : 10
    ex.totalHours = hoursNeeded
    let remaining = hoursNeeded
    const window = Math.max(1, Math.min(ex.daysRemaining, 6))
    const perDayTarget = hoursNeeded / window

    // pase 1: intenta distribuir perDayTarget en ventana
    for(let off=0; off<window && remaining>1e-6; off++){
      const idx = (currentDayIndex + off) % 6
      const day = daysOfWeek[idx]
      const availableToday = Math.max(0, capacityPerDay[day] - schedule[day].reduce((s,b)=>s+(b.end-b.start),0))
      if(availableToday <= 1e-6) continue
      const want = Math.min(perDayTarget, remaining, availableToday)
      const assigned = allocateToDay(day, want, ex.name)
      remaining -= assigned
    }

    // pase 2: rellenar con lo que quede dentro de la ventana
    for(let off=0; off<window && remaining>1e-6; off++){
      const idx = (currentDayIndex + off) % 6
      const day = daysOfWeek[idx]
      const availableToday = Math.max(0, capacityPerDay[day] - schedule[day].reduce((s,b)=>s+(b.end-b.start),0))
      if(availableToday <= 1e-6) continue
      const assigned = allocateToDay(day, Math.min(availableToday, remaining), ex.name)
      remaining -= assigned
    }

    // pase 3: intentar en días posteriores hasta completar (hasta cubrir 6 días total)
    for(let off=window; off<6 && remaining>1e-6; off++){
      const idx = (currentDayIndex + off) % 6
      const day = daysOfWeek[idx]
      const availableToday = Math.max(0, capacityPerDay[day] - schedule[day].reduce((s,b)=>s+(b.end-b.start),0))
      if(availableToday <= 1e-6) continue
      const assigned = allocateToDay(day, Math.min(availableToday, remaining), ex.name)
      remaining -= assigned
    }

    ex.unassigned = remaining > 1e-6 ? Number(remaining.toFixed(2)) : 0
  }

  // ordenar bloques y consolidar contiguos por examen (limpio)
  daysOfWeek.forEach(d => {
    schedule[d].sort((a,b)=>a.start-b.start)
    const out = []
    for(const b of schedule[d]){
      if(out.length === 0) out.push({...b})
      else {
        const last = out[out.length-1]
        if(Math.abs(last.end - b.start) < 1e-6 && last.exam === b.exam) last.end = b.end
        else out.push({...b})
      }
    }
    schedule[d] = out
  })

  return { schedule, capacityPerDay }
}

/* ------------------- UI, lectura y validação ------------------- */
function init(){
  // generar exámenes al cargar si hay valor
  const genBtn = $("generateExamsBtn"); if(genBtn) genBtn.addEventListener("click", generateExamFields)
  const form = $("studyForm"); if(form) form.addEventListener("submit", e => { e.preventDefault(); onGenerate() })
  // botón regresar ya en HTML llama a regresar()
  // auto-generate if button exists
  if(genBtn) genBtn.click()
}

function generateExamFields(){
  const num = parseInt( $("numExams") ? $("numExams").value : 0 ) || 0
  const container = $("examsContainer"); if(!container) return
  container.innerHTML = ""
  for(let i=0;i<num;i++){
    const div = document.createElement("div")
    div.className = "exam-item"
    div.style.borderLeft = `4px solid ${examColors[i % examColors.length]}`
    div.innerHTML = `
      <h3>Examen ${i+1}</h3>
      <div class="form-row">
        <div class="form-group"><label>Nombre:</label><input type="text" id="examName${i}" placeholder="Matemáticas"></div>
        <div class="form-group"><label>Días restantes:</label><input type="number" id="examDays${i}" min="1" value="7"></div>
        <div class="form-group"><label>Dificultad:</label><input type="number" id="examDifficulty${i}" min="1" max="3" value="2"></div>
      </div>
    `
    container.appendChild(div)
  }
}

function readFormInputs(){
  const startTime = $("startTime") ? $("startTime").value : "06:00"
  const endTime = $("endTime") ? $("endTime").value : "22:00"
  const startHour = safeParseFloat(startTime.split(":")[0], 6)
  const endHour = safeParseFloat(endTime.split(":")[0], 22)
  const currentDay = $("currentDay") ? $("currentDay").value : "LU"
  const currentDayIndex = Math.max(0, daysOfWeek.indexOf(currentDay))

  const transportRangeRaw = $("transportHoursRange") ? $("transportHoursRange").value : null
  const mealRangeRaw = $("mealHoursRange") ? $("mealHoursRange").value : null
  const restRangeRaw = $("restHoursRange") ? $("restHoursRange").value : null

  const transportRange = parseRangeSimple(transportRangeRaw)
  const mealRange = parseRangeSimple(mealRangeRaw)
  const restRange = parseRangeSimple(restRangeRaw)

  const classSchedules = {}
  daysOfWeek.forEach(d => {
    const el = $("class"+d)
    classSchedules[d] = el ? parseTimeRanges(el.value) : []
  })

  const transportSlots = $("transportSlots") ? parseTimeRanges($("transportSlots").value) : []
  const mealSlots = $("mealSlots") ? parseTimeRanges($("mealSlots").value) : []

  const exams = []
  const numExams = parseInt($("numExams") ? $("numExams").value : 0) || 0
  for(let i=0;i<numExams;i++){
    const name = $("examName"+i) ? ($("examName"+i).value || `Examen ${i+1}`) : `Examen ${i+1}`
    const daysRemaining = Math.max(1, parseInt($("examDays"+i) ? $("examDays"+i).value : 1) || 1)
    const difficulty = Math.min(3, Math.max(1, parseInt($("examDifficulty"+i) ? $("examDifficulty"+i).value : 2) || 2))
    exams.push({ index:i, name, daysRemaining, difficulty })
  }

  return {
    startHour, endHour, currentDayIndex, transportRange, mealRange, restRange,
    transportSlots, mealSlots, classSchedules, exams, currentDay
  }
}

function onGenerate(){
  // leer form
  const data = readFormInputs()
  if(!data.transportRange || !data.mealRange || !data.restRange){
    return alert("Ingresa rangos válidos para transporte, comida y descanso (ej: 2-3, 1-2, 6-8).")
  }

  // semilla y rng
  const seed = Math.floor(Math.random() * 2**31)
  const rng = mulberry32(seed)

  const sampledTransport = Number(sampleUniform(data.transportRange, rng).toFixed(2))
  const sampledMeal = Number(sampleUniform(data.mealRange, rng).toFixed(2))
  const sampledRest = Number(sampleUniform(data.restRange, rng).toFixed(2))

  // validar sumas de slots vs horas muestreadas (tolerancia)
  const EPS = 0.5
  const transSlotsSum = totalRangesHours(data.transportSlots)
  const mealSlotsSum = totalRangesHours(data.mealSlots)
  if(Math.abs(transSlotsSum - sampledTransport) > EPS){
    if(!confirm(`Transporte muestreado ${sampledTransport}h no coincide con suma de rangos ${transSlotsSum.toFixed(2)}h.\nContinuar con muestreo?`)) return
  }
  if(Math.abs(mealSlotsSum - sampledMeal) > EPS){
    if(!confirm(`Comida muestreada ${sampledMeal}h no coincide con suma de rangos ${mealSlotsSum.toFixed(2)}h.\nContinuar con muestreo?`)) return
  }

  // asignación
  const { schedule, capacityPerDay } = allocateStudy(
    data.exams,
    data.classSchedules,
    data.startHour,
    data.endHour,
    data.transportSlots,
    data.mealSlots,
    sampledRest,
    data.currentDayIndex
  )

  // metadata y mostrar
  const meta = {
    seed, sampledTransport, sampledMeal, sampledRest,
    declared: { transportRange: $("transportHoursRange")? $("transportHoursRange").value : "", mealRange: $("mealHoursRange")? $("mealHoursRange").value:"", restRange: $("restHoursRange")? $("restHoursRange").value:"" },
    inputSummary: { startHour: data.startHour, endHour: data.endHour, currentDay: data.currentDay }
  }

  showResults(data.exams, schedule, data.currentDay, meta, capacityPerDay)
}

/* ------------------- Mostrar resultados simples ------------------- */
function showResults(exams, schedule, currentDay, meta, capacityPerDay){
  const results = $("results"), summary = $("summary"), scheduleDiv = $("schedule")
  if(results) results.classList.remove("hidden")

  // header resumen
  let html = `<h3>📋 Resumen (semilla: ${meta.seed})</h3>`
  html += `<div>Valores muestreados: Transporte ${meta.sampledTransport}h • Comida ${meta.sampledMeal}h • Descanso ${meta.sampledRest}h</div>`
  html += `<div style="margin-top:8px;">`

  let totalRequired = 0, totalAssigned = 0
  exams.forEach(ex => {
    const assigned = daysOfWeek.reduce((s,d)=> s + (schedule[d] ? schedule[d].filter(b=>b.exam===ex.name).reduce((ss,bb)=>ss+(bb.end-bb.start),0):0), 0)
    const required = ex.difficulty === 1 ? 2 : ex.difficulty === 2 ? 6 : 10
    totalRequired += required
    totalAssigned += assigned
    html += `<div style="border-left:4px solid ${examColors[ex.index%examColors.length]}; padding:6px; margin:6px 0;">
      <strong>${ex.name}</strong> • Req: ${required}h • Asig: ${assigned.toFixed(2)}h ${ex.unassigned?`• No asig: ${ex.unassigned}h`:""}
    </div>`
  })

  html += `<div style="margin-top:6px; padding:6px; background:#f5f5f5;">Total req: ${totalRequired}h — Total asig: ${totalAssigned.toFixed(2)}h — Falta: ${(totalRequired - totalAssigned).toFixed(2)}h</div>`
  html += `</div>`
  if(summary) summary.innerHTML = html

  // detalle por dia
  let sh = `<h3>🗓 Horario (LU→SA)</h3>`
  daysOfWeek.forEach(d => {
    sh += `<div style="border:1px solid #eee; padding:8px; margin:6px 0;"><strong>${d}${d===currentDay ? " (Hoy)" : ""}</strong> — Capacidad: ${capacityPerDay && capacityPerDay[d] ? capacityPerDay[d].toFixed(2) : "0.00"}h`
    const blocks = schedule[d] || []
    if(blocks.length === 0) sh += `<div style="color:#666; margin-top:6px;">Sin bloques</div>`
    else {
      blocks.forEach(b => {
        sh += `<div style="display:flex; justify-content:space-between; padding:6px; border-left:4px solid ${examColors.find((c,idx)=> exams.findIndex(e=>e.index===idx)!==-1) || "#999"}; margin-top:6px;">
          <div><strong>${b.exam}</strong><div style="font-size:0.9rem;color:#444">${formatTime(b.start)} - ${formatTime(b.end)}</div></div>
          <div style="background:#333;color:#fff;padding:6px;border-radius:6px">${(b.end-b.start).toFixed(2)}h</div>
        </div>`
      })
    }
    sh += `</div>`
  })
  if(scheduleDiv) scheduleDiv.innerHTML = sh

  // botones guardar / listar (creados una sola vez)
  if($("scenarioControls")) return
  const controls = document.createElement("div"); controls.id = "scenarioControls"; controls.style.margin = "8px 0"
  const saveBtn = document.createElement("button"); saveBtn.textContent = "💾 Guardar escenario"; saveBtn.className = "btn-secondary"
  saveBtn.onclick = () => {
    const name = prompt("Nombre escenario:")
    if(!name) return
    const key = "sim_simples_v1"
    const arr = localStorage.getItem(key) ? JSON.parse(localStorage.getItem(key)) : []
    arr.push({ id:Date.now(), name, created: new Date().toISOString(), payload: { meta, schedule, exams } })
    localStorage.setItem(key, JSON.stringify(arr))
    alert("Guardado ✅")
  }
  const listBtn = document.createElement("button"); listBtn.textContent = "📂 Cargar escenario"; listBtn.className = "btn-secondary"; listBtn.style.marginLeft="8px"
  listBtn.onclick = () => {
    const key = "sim_simples_v1"
    const arr = localStorage.getItem(key) ? JSON.parse(localStorage.getItem(key)) : []
    if(!arr.length) return alert("No hay escenarios guardados.")
    let txt = "Escenarios:\n"
    arr.forEach((s,i)=> txt += `${i+1}. ${s.name} — ${new Date(s.created).toLocaleString()}\n`)
    const sel = prompt(txt + "\nIngresa número para cargar:")
    if(!sel) return
    const idx = parseInt(sel)-1
    if(isNaN(idx) || idx<0 || idx>=arr.length) return alert("Selección inválida")
    const chosen = arr[idx]
    // mostrar elegido: payload contiene schedule y exams
    showResults(chosen.payload.exams, chosen.payload.schedule, $("currentDay") ? $("currentDay").value : "LU", chosen.payload.meta, chosen.payload.meta.capacityPerDay || {})
  }
  const result = $("results")
  if(result) {
    controls.appendChild(saveBtn); controls.appendChild(listBtn)
    result.prepend(controls)
  }
}

// Formateo hora simple
function formatTime(hour){
  const h = Math.floor(hour); const m = Math.round((hour - h) * 60)
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`
}

/* --------------- Inicializar --------------- */
document.addEventListener("DOMContentLoaded", init)
