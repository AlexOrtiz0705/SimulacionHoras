// Colores para cada examen
const examColors = [
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#ef4444",
  "#14b8a6",
  "#f97316",
  "#a855f7",
]

// Días de la semana (6 días: LU..SA)
const daysOfWeek = ["LU", "MA", "MI", "JU", "VI", "SA"]

// Generar campos de exámenes
document.getElementById("generateExamsBtn").addEventListener("click", () => {
  const numExams = Number.parseInt(document.getElementById("numExams").value) || 0
  const container = document.getElementById("examsContainer")
  container.innerHTML = ""

  for (let i = 0; i < numExams; i++) {
    const examDiv = document.createElement("div")
    examDiv.className = "exam-item"
    examDiv.style.borderLeftColor = examColors[i % examColors.length]
    examDiv.innerHTML = `
            <h3>Examen ${i + 1}</h3>
            <div class="form-row">
                <div class="form-group">
                    <label>Nombre del examen:</label>
                    <input type="text" id="examName${i}" placeholder="ej: Matemáticas" required>
                </div>
                <div class="form-group">
                    <label>Días restantes:</label>
                    <input type="number" id="examDays${i}" min="1" max="365" placeholder="7" required>
                </div>
                <div class="form-group">
                    <label>Dificultad (1=fácil, 3=difícil):</label>
                    <input type="number" id="examDifficulty${i}" min="1" max="3" value="2" required>
                </div>
            </div>
        `
    container.appendChild(examDiv)
  }
})

// Procesar el formulario
document.getElementById("studyForm").addEventListener("submit", (e) => {
  e.preventDefault()
  generateSchedule()
})

// Parsear horarios tipo "8-10,14-16" -> [{start:8,end:10},...]
function parseTimeRanges(scheduleStr) {
  if (!scheduleStr || scheduleStr.trim() === "") return []
  const ranges = scheduleStr.split(",")
  const result = []

  ranges.forEach((range) => {
    const [startStr, endStr] = range.trim().split("-")
    if (!startStr || !endStr) return
    const start = Number.parseFloat(startStr)
    const end = Number.parseFloat(endStr)
    if (!isNaN(start) && !isNaN(end) && start < end) {
      result.push({ start, end })
    }
  })

  // ordenar por inicio
  result.sort((a, b) => a.start - b.start)
  return result
}

// Calcular la duración total de un arreglo de ranges
function totalRangeHours(ranges) {
  return ranges.reduce((s, r) => s + (r.end - r.start), 0)
}

// Generar bloques libres para un día considerando ocupados (clases, transporte, comidas)
// occupiedGlobal: array de ranges aplicables ese día (clases + transporte + comidas)
function generateDayBlocksWithOccupied(startHour, endHour, occupiedGlobal) {
  const blocks = []
  if (!occupiedGlobal || occupiedGlobal.length === 0) {
    blocks.push({ start: startHour, end: endHour, duration: endHour - startHour })
    return blocks
  }

  // ordenar y fusionar ocupados si se solapan
  const occ = [...occupiedGlobal].sort((a, b) => a.start - b.start)
  const merged = []
  for (const r of occ) {
    if (merged.length === 0) merged.push({ ...r })
    else {
      const last = merged[merged.length - 1]
      if (r.start <= last.end + 1e-9) {
        last.end = Math.max(last.end, r.end)
      } else merged.push({ ...r })
    }
  }

  let cursor = startHour
  for (const m of merged) {
    if (cursor < m.start) {
      blocks.push({ start: cursor, end: m.start, duration: m.start - cursor })
    }
    cursor = Math.max(cursor, m.end)
  }
  if (cursor < endHour) blocks.push({ start: cursor, end: endHour, duration: endHour - cursor })

  return blocks
}

// Helper: copia profunda de bloques (para manipular remanentes)
function cloneBlocks(blocks) {
  return blocks.map((b) => ({ start: b.start, end: b.end, duration: b.duration }))
}

// Generar bloques de estudio EXACTOS por examen respetando horas fijas y ocupados (clases/transporte/comida)
function generateExactStudyBlocks(exams, classSchedules, startHour, endHour, transportRanges, mealRanges, rest, currentDayIndex) {
  // studySchedule: mapa dayCode -> array de bloques {start,end,exam}
  const studySchedule = {}
  daysOfWeek.forEach((d) => (studySchedule[d] = []))

  // Preparar bloques disponibles y capacidad por día (restando solo descanso como fijo)
  const dayBlocksRemaining = {}
  const capacityPerDay = {}
  const fixedRestPerDay = rest / 6 // repartir descanso entre 6 días

  daysOfWeek.forEach((d) => {
    // combinar ocupados: clases + transport + meal (transport/meal aplican a todos los días)
    const occupied = []
    const classes = classSchedules[d] || []
    classes.forEach((c) => occupied.push({ start: c.start, end: c.end }))
    transportRanges.forEach((t) => occupied.push({ start: t.start, end: t.end }))
    mealRanges.forEach((m) => occupied.push({ start: m.start, end: m.end }))

    const blocks = generateDayBlocksWithOccupied(startHour, endHour, occupied)
    dayBlocksRemaining[d] = cloneBlocks(blocks)
    const totalBlocksHours = blocks.reduce((s, b) => s + b.duration, 0)
    // capacity = tiempo libre en bloques menos descanso
    capacityPerDay[d] = Math.max(0, totalBlocksHours - fixedRestPerDay)
  })

  // Track how much assigned per day (to not exceed capacity)
  const assignedPerDay = {}
  daysOfWeek.forEach((d) => (assignedPerDay[d] = 0))

  // Sort exams by fecha (daysRemaining asc) to priorizar los más cercanos
  const sortedExams = [...exams].sort((a, b) => a.daysRemaining - b.daysRemaining)

  for (const exam of sortedExams) {
    // total hours based on difficulty mapping
    let totalHours
    if (exam.difficulty === 1) totalHours = 2
    else if (exam.difficulty === 2) totalHours = 6
    else if (exam.difficulty === 3) totalHours = 10
    else totalHours = 6

    exam.totalHours = totalHours
    const daysToUse = Math.max(1, Math.min(exam.daysRemaining, 6)) // limit max to 6 (LU-SA)
    const hoursPerDayTarget = totalHours / daysToUse

    let remaining = totalHours

    // First pass: assign hoursPerDayTarget across the days window
    for (let offset = 0; offset < daysToUse && remaining > 0; offset++) {
      const dayIndex = (currentDayIndex + offset) % 6
      const dayCode = daysOfWeek[dayIndex]

      const availableForDay = Math.max(0, capacityPerDay[dayCode] - assignedPerDay[dayCode])
      if (availableForDay <= 0) continue

      // try to assign target (but not exceed remaining or availability)
      const want = Math.min(hoursPerDayTarget, remaining, availableForDay)
      if (want <= 0) continue

      // allocate 'want' into the day's blocks (consume from dayBlocksRemaining)
      let toAllocate = want
      const blocks = dayBlocksRemaining[dayCode]
      for (let i = 0; i < blocks.length && toAllocate > 0; ) {
        const b = blocks[i]
        const blockAvail = b.end - b.start
        if (blockAvail <= 0.00001) {
          blocks.splice(i, 1)
          continue
        }
        const assign = Math.min(blockAvail, toAllocate)
        const start = b.start
        const end = start + assign
        studySchedule[dayCode].push({ start, end, exam: exam.name })
        // advance the block start
        b.start = end
        // tracking
        assignedPerDay[dayCode] += assign
        remaining -= assign
        toAllocate -= assign
        if (b.end - b.start <= 0.00001) blocks.splice(i, 1)
        else i++
      }
    }

    // Second pass: distribute leftovers in window
    if (remaining > 0) {
      for (let offset = 0; offset < daysToUse && remaining > 0; offset++) {
        const dayIndex = (currentDayIndex + offset) % 6
        const dayCode = daysOfWeek[dayIndex]
        const availableForDay = Math.max(0, capacityPerDay[dayCode] - assignedPerDay[dayCode])
        if (availableForDay <= 0) continue

        let toAllocate = Math.min(availableForDay, remaining)
        const blocks = dayBlocksRemaining[dayCode]
        for (let i = 0; i < blocks.length && toAllocate > 0; ) {
          const b = blocks[i]
          const blockAvail = b.end - b.start
          if (blockAvail <= 0.00001) {
            blocks.splice(i, 1)
            continue
          }
          const assign = Math.min(blockAvail, toAllocate)
          const start = b.start
          const end = start + assign
          studySchedule[dayCode].push({ start, end, exam: exam.name })
          b.start = end
          assignedPerDay[dayCode] += assign
          remaining -= assign
          toAllocate -= assign
          if (b.end - b.start <= 0.00001) blocks.splice(i, 1)
          else i++
        }
      }
    }

    // Third pass: try days beyond window (up to 6 days total)
    if (remaining > 0) {
      for (let offset = daysToUse; offset < 6 && remaining > 0; offset++) {
        const dayIndex = (currentDayIndex + offset) % 6
        const dayCode = daysOfWeek[dayIndex]
        const availableForDay = Math.max(0, capacityPerDay[dayCode] - assignedPerDay[dayCode])
        if (availableForDay <= 0) continue

        let toAllocate = Math.min(availableForDay, remaining)
        const blocks = dayBlocksRemaining[dayCode]
        for (let i = 0; i < blocks.length && toAllocate > 0; ) {
          const b = blocks[i]
          const blockAvail = b.end - b.start
          if (blockAvail <= 0.00001) {
            blocks.splice(i, 1)
            continue
          }
          const assign = Math.min(blockAvail, toAllocate)
          const start = b.start
          const end = start + assign
          studySchedule[dayCode].push({ start, end, exam: exam.name })
          b.start = end
          assignedPerDay[dayCode] += assign
          remaining -= assign
          toAllocate -= assign
          if (b.end - b.start <= 0.00001) blocks.splice(i, 1)
          else i++
        }
      }
    }

    if (remaining > 0.0001) {
      console.warn(`No se pudo asignar ${remaining.toFixed(2)}h del examen "${exam.name}". Capacidad insuficiente.`)
    }
  }

  // Ordenar bloques por hora en cada día y consolidar contiguos del mismo examen
  daysOfWeek.forEach((d) => {
    studySchedule[d].sort((a, b) => a.start - b.start)
    const consolidated = []
    for (const blk of studySchedule[d]) {
      if (consolidated.length === 0) consolidated.push({ ...blk })
      else {
        const last = consolidated[consolidated.length - 1]
        if (Math.abs(last.end - blk.start) < 1e-6 && last.exam === blk.exam) last.end = blk.end
        else consolidated.push({ ...blk })
      }
    }
    studySchedule[d] = consolidated
  })

  return studySchedule
}

// Generar el horario completo
function generateSchedule() {
  // leer formulario
  const currentDay = document.getElementById("currentDay").value || "LU"
  const startTime = document.getElementById("startTime").value || "07:00"
  const endTime = document.getElementById("endTime").value || "22:00"
  const transportHours = Number.parseFloat(document.getElementById("transportHours").value) || 0
  const mealHours = Number.parseFloat(document.getElementById("mealHours").value) || 0
  const restHours = Number.parseFloat(document.getElementById("restHours").value) || 0
  const numExams = Number.parseInt(document.getElementById("numExams").value) || 0

  const startHour = Number.parseFloat(startTime.split(":")[0])
  const endHour = Number.parseFloat(endTime.split(":")[0])

  // horarios de clases por dia
  const classSchedules = {}
  daysOfWeek.forEach((day) => {
    const schedule = document.getElementById(`class${day}`).value
    classSchedules[day] = parseTimeRanges(schedule)
  })

  // parse transport & meal ranges (aplican a todos los dias)
  const transportRanges = parseTimeRanges(document.getElementById("transportSlots").value)
  const mealRanges = parseTimeRanges(document.getElementById("mealSlots").value)

  // validar que la suma de rangos coincida con horas declaradas (permite pequeña tolerancia)
  const transSum = totalRangeHours(transportRanges)
  const mealSum = totalRangeHours(mealRanges)
  const EPS = 0.25 // tolerancia en horas

  if (Math.abs(transSum - transportHours) > EPS) {
    alert(
      `Las horas totales de transporte declaradas (${transportHours}h) NO coinciden con la suma de rangos (${transSum.toFixed(
        2,
      )}h). Ajusta los rangos o la cantidad de horas.`,
    )
    return
  }

  if (Math.abs(mealSum - mealHours) > EPS) {
    alert(
      `Las horas totales de comida declaradas (${mealHours}h) NO coinciden con la suma de rangos (${mealSum.toFixed(
        2,
      )}h). Ajusta los rangos o la cantidad de horas.`,
    )
    return
  }

  // leer exámenes y mapear
  const exams = []
  for (let i = 0; i < numExams; i++) {
    const name = (document.getElementById(`examName${i}`).value || `Examen ${i + 1}`).trim()
    const daysRemaining = Math.max(1, Number.parseInt(document.getElementById(`examDays${i}`).value) || 1)
    const difficulty = Math.min(3, Math.max(1, Number.parseInt(document.getElementById(`examDifficulty${i}`).value) || 2))

    exams.push({
      index: i,
      name,
      daysRemaining,
      difficulty,
      totalHours: 0, // se calcula dentro de generateExactStudyBlocks
      color: examColors[i % examColors.length],
    })
  }

  const currentDayIndex = Math.max(0, daysOfWeek.indexOf(currentDay))
  const studyDistribution = generateExactStudyBlocks(
    exams,
    classSchedules,
    startHour,
    endHour,
    transportRanges,
    mealRanges,
    restHours,
    currentDayIndex,
  )

  displayResults(exams, studyDistribution, currentDay, currentDayIndex)
}

// Mostrar resultados
function displayResults(exams, schedule, currentDay, currentDayIndex) {
  const resultsDiv = document.getElementById("results")
  const summaryDiv = document.getElementById("summary")
  const scheduleDiv = document.getElementById("schedule")

  resultsDiv.classList.remove("hidden")

  // Resumen de exámenes (calcular horas asignadas sumando schedule)
  let summaryHTML = '<h3 style="margin-bottom: 20px;">📋 Resumen de Exámenes</h3>'
  exams.forEach((exam) => {
    const examDayIndex = (currentDayIndex + exam.daysRemaining) % 6
    const examDay = daysOfWeek[examDayIndex]

    let totalAssigned = 0
    daysOfWeek.forEach((day) => {
      schedule[day].forEach((block) => {
        if (block.exam === exam.name) totalAssigned += block.end - block.start
      })
    })

    const totalHoursDeclared =
      exam.difficulty === 1 ? 2 : exam.difficulty === 2 ? 6 : exam.difficulty === 3 ? 10 : 6
    const avgDaily = (totalHoursDeclared / Math.max(1, exam.daysRemaining)).toFixed(1)

    summaryHTML += `
            <div class="exam-summary" style="border-left-color: ${exam.color}">
                <h3 style="color: ${exam.color}">${exam.name}</h3>
                <p><strong>📅 Fecha del examen:</strong> ${examDay} (en ${exam.daysRemaining} días)</p>
                <p><strong>📊 Dificultad:</strong> ${exam.difficulty}/3</p>
                <p><strong>⏱️ Horas totales necesarias:</strong> ${totalHoursDeclared.toFixed(1)} horas</p>
                <p><strong>✅ Horas asignadas:</strong> ${totalAssigned.toFixed(1)} horas</p>
                <p><strong>📈 Promedio diario requerido:</strong> ${avgDaily} horas/día</p>
            </div>
        `
  })
  summaryDiv.innerHTML = summaryHTML

  // Horario detallado (por día)
  let scheduleHTML = '<h3 style="margin-bottom: 20px;">🗓️ Horario Semanal de Estudio</h3>'
  daysOfWeek.forEach((day, index) => {
    const dayBlocks = schedule[day]
    const isCurrent = day === currentDay

    scheduleHTML += `<div class="day-schedule"><h3>${day} ${isCurrent ? "(Hoy)" : ""}</h3>`

    if (!dayBlocks || dayBlocks.length === 0) {
      scheduleHTML += '<p class="no-study">Sin bloques de estudio programados</p>'
    } else {
      dayBlocks.forEach((block) => {
        const exam = exams.find((e) => e.name === block.exam)
        scheduleHTML += `
                    <div class="study-block" style="border-left-color: ${exam ? exam.color : "#999"}">
                        <div class="study-block-info">
                            <div class="study-block-time">${formatTime(block.start)} - ${formatTime(block.end)}</div>
                            <div class="study-block-exam">${block.exam}</div>
                        </div>
                        <div class="study-block-duration" style="background: ${exam ? exam.color : "#999"}">
                            ${(block.end - block.start).toFixed(1)}h
                        </div>
                    </div>
                `
      })
    }

    scheduleHTML += "</div>"
  })
  scheduleDiv.innerHTML = scheduleHTML

  resultsDiv.scrollIntoView({ behavior: "smooth" })
}

// Formatear hora a HH:MM
function formatTime(hour) {
  const h = Math.floor(hour)
  const m = Math.round((hour - h) * 60)
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`
}

const generarHorario = () =>{
  document.getElementById("contenedor").classList.add("hidden");
  document.getElementById("results").classList.remove("hidden");
  document.getElementById("container2").classList.add("hidden");
}

const regresar = () =>{
  document.getElementById("contenedor").classList.remove("hidden");
  document.getElementById("results").classList.add("hidden");
  document.getElementById("container2").classList.add("hidden");
}

function showScreen(screenId) {
    const screens = ["container2", "contenedor", "results"];

    screens.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.classList.add("hidden");
        }
    });

    const target = document.getElementById(screenId);
    if (target) {
        target.classList.remove("hidden");
    }
}

// Botones de navegación
function regresar() {
    showScreen("contenedor");
}

// Cuando carga la página → mostrar guía primero
document.addEventListener("DOMContentLoaded", () => {
    showScreen("container2");

    // Botón que ya tienes en la guía
    const btnGuiRegresar = document.getElementById("btnGuiRegresar");
    if (btnGuiRegresar) {
        btnGuiRegresar.addEventListener("click", () => showScreen("contenedor"));
    }

    // Cuando se genera el horario → mostrar resultados
    const form = document.getElementById("studyForm");
    if (form) {
        form.addEventListener("submit", e => {
            e.preventDefault();
            onGenerate();   // tu función de generación
            showScreen("results");
        });
    }
});

// Generar campos de exámenes al cargar (si existe el botón)
const genBtn = document.getElementById("generateExamsBtn")
if (genBtn) genBtn.click()
