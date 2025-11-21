const examColors = ["#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#ef4444",
  "#14b8a6",
  "#f97316",
  "#a855f7"];
const daysOfWeek = ["LU","MA","MI","JU","VI","SA"];

// ============= GENERAR CAMPOS DE EXÁMENES =============
document.getElementById("generateExamsBtn")?.addEventListener("click", () => {
    const numExams = Math.max(1, Math.min(10, parseInt(document.getElementById("numExams").value) || 1));
    const container = document.getElementById("examsContainer");
    container.innerHTML = "";

    for (let i = 0; i < numExams; i++) {
        const div = document.createElement("div");
        div.className = "exam-item";
        div.style.borderLeft = `5px solid ${examColors[i % examColors.length]}`;
        div.innerHTML = `
            <h3 style="color:${examColors[i % examColors.length]}">Examen ${i+1}</h3>
            <div class="form-row">
                <div class="form-group">
                    <label>Nombre:</label>
                    <input type="text" id="examName${i}" placeholder="Ej: Física II" required>
                </div>
                <div class="form-group">
                    <label>Días restantes:</label>
                    <input type="number" id="examDays${i}" min="1" max="365" value="10" required>
                </div>
                <div class="form-group">
                    <label>Dificultad:</label>
                    <select id="examDifficulty${i}" required>
                        <option value="1">1 - Fácil</option>
                        <option value="2" selected>2 - Media</option>
                        <option value="3">3 - Difícil</option>
                    </select>
                </div>
            </div>
        `;
        container.appendChild(div);
    }
});

// ============= FUNCIÓN PRINCIPAL =============
function generateSchedule() {
    try {
        // --- Lectura básica ---
        const currentDay = document.getElementById("currentDay").value;
        const startTime = document.getElementById("startTime").value;
        const endTime = document.getElementById("endTime").value;

        const startHour = parseFloat(startTime.split(":")[0]) + parseFloat(startTime.split(":")[1])/60 || 7;
        const endHour = parseFloat(endTime.split(":")[0]) + parseFloat(endTime.split(":")[1])/60 || 22;

        // --- Parsear rangos tipo "2-3" ---
        const parseRange = (id, def) => {
            const val = document.getElementById(id)?.value.trim() || "";
            if (!val) return def;
            const m = val.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/);
            if (m) return (parseFloat(m[1]) + parseFloat(m[2])) / 2;
            const n = parseFloat(val);
            return isNaN(n) ? def : n;
        };

        const transportHours = parseRange("transportHoursRange", 2);
        const mealHours = parseRange("mealHoursRange", 1.5);
        const restHours = parseRange("restHoursRange", 7);

        // --- Clases ---
        const classSchedules = {};
        daysOfWeek.forEach(d => {
            const str = document.getElementById(`class${d}`)?.value || "";
            classSchedules[d] = str.split(",").map(s => {
                const [a,b] = s.trim().split("-");
                return a && b ? {start: parseFloat(a), end: parseFloat(b)} : null;
            }).filter(x => x && x.start < x.end);
        });

        // --- Transporte y comidas (rangos fijos) ---
        const parseSlots = (str) => (str||"").split(",").map(s => {
            const [a,b] = s.trim().split("-");
            return a && b ? {start: parseFloat(a), end: parseFloat(b)} : null;
        }).filter(x => x);

        const transportRanges = parseSlots(document.getElementById("transportSlots")?.value);
        const mealRanges = parseSlots(document.getElementById("mealSlots")?.value);

        // --- Exámenes ---
        const numExams = parseInt(document.getElementById("numExams").value) || 0;
        const exams = [];
        for (let i = 0; i < numExams; i++) {
            const name = document.getElementById(`examName${i}`)?.value.trim() || `Examen ${i+1}`;
            const days = parseInt(document.getElementById(`examDays${i}`)?.value) || 7;
            const diff = parseInt(document.getElementById(`examDifficulty${i}`)?.value) || 2;
            const hours = diff === 1 ? 2 : diff === 3 ? 10 : 6;

            exams.push({
                name,
                daysRemaining: days,
                difficulty: diff,
                totalHours: hours,
                color: examColors[i % examColors.length]
            });
        }

     
                // --- Generar horario (versión EQUITATIVA y REALISTA) ---
        const schedule = {};
        daysOfWeek.forEach(d => schedule[d] = []);

        const currentDayIndex = daysOfWeek.indexOf(currentDay);

        // Ordenar exámenes por urgencia (más cercanos primero)
        exams.sort((a, b) => a.daysRemaining - b.daysRemaining);

        // Para cada examen
        for (const exam of exams) {
            let remainingHours = exam.totalHours;
            const daysAvailable = Math.min(exam.daysRemaining, 6); // máximo 6 días
            const hoursPerDayTarget = remainingHours / daysAvailable;

            // Intentar asignar en cada día desde hoy hasta el día del examen
            for (let offset = 0; offset < 6 && remainingHours > 0.1; offset++) {
                const dayIndex = (currentDayIndex + offset) % 6;
                const dayCode = daysOfWeek[dayIndex];

                // Solo asignar si este día está dentro del rango del examen
                if (offset >= daysAvailable) break;

                // Horas a asignar este día (más si es urgente, menos si es lejano)
                const priorityFactor = offset < 2 ? 1.3 : offset < 4 ? 1.1 : 0.9;
                let hoursToday = hoursPerDayTarget * priorityFactor;

                // No asignar más de lo que queda ni más de 4h por día (realista)
                hoursToday = Math.min(hoursToday, remainingHours, 4.0);

                if (hoursToday < 0.5) continue; // no poner bloques ridículos

                // Elegir horario realista (mañana o tarde, evitando clases/transporte)
                const possibleStarts = [];
                const dayOccupied = [
                    ...classSchedules[dayCode],
                    ...transportRanges,
                    ...mealRanges
                ];

                // Generar huecos libres
                let cursor = startHour;
                for (const occ of dayOccupied.sort((a,b) => a.start - b.start)) {
                    if (cursor < occ.start - 0.5) {
                        possibleStarts.push(cursor + 0.5);
                    }
                    cursor = Math.max(cursor, occ.end);
                }
                if (cursor < endHour - 1) possibleStarts.push(cursor + 0.5);

                // Si no hay hueco, usar horario por defecto
                if (possibleStarts.length === 0) {
                    possibleStarts.push(startHour + 1); // mañana
                    possibleStarts.push(endHour - hoursToday - 1); // tarde
                }

                const start = possibleStarts[Math.floor(Math.random() * possibleStarts.length)];
                const end = Math.min(start + hoursToday, endHour - 0.5);

                if (end - start > 0.5) {
                    schedule[dayCode].push({
                        start,
                        end,
                        exam: exam.name,
                        color: exam.color
                    });
                    remainingHours -= (end - start);
                }
            }

            // Si sobró algo (por redondeo), ponerlo el último día útil
            if (remainingHours > 0.5) {
                const dayIndex = (currentDayIndex + daysAvailable - 1) % 6;
                const dayCode = daysOfWeek[dayIndex];
                schedule[dayCode].push({
                    start: endHour - remainingHours - 0.5,
                    end: endHour - 0.5,
                    exam: exam.name + " (extra)",
                    color: exam.color
                });
            }
        }

        // Consolidar bloques contiguos del mismo examen
        daysOfWeek.forEach(day => {
            if (!schedule[day].length) return;
            schedule[day].sort((a,b) => a.start - b.start);
            const merged = [];
            let current = null;
            for (const block of schedule[day]) {
                if (!current) {
                    current = { ...block };
                } else if (current.exam === block.exam && block.start <= current.end + 0.1) {
                    current.end = Math.max(current.end, block.end);
                } else {
                    merged.push(current);
                    current = { ...block };
                }
            }
            if (current) merged.push(current);
            schedule[day] = merged;
        });

        // --- Mostrar resultados ---
        const results = document.getElementById("results");
        const summary = document.getElementById("summary");
        const sched = document.getElementById("schedule");

        let sumHTML = "<h3>Resumen de Exámenes</h3>";
        exams.forEach(e => {
            sumHTML += `<div style="border-left:5px solid ${e.color}; padding:10px; margin:10px 0; background:#f9f9f9;">
                <strong style="color:${e.color}">${e.name}</strong><br>
                Dificultad: ${e.difficulty}/3 | Horas totales: ${e.totalHours}h | En ${e.daysRemaining} días
            </div>`;
        });
        summary.innerHTML = sumHTML;

        let schedHTML = "<h3>Horario de Estudio (próximos 6 días)</h3>";
        daysOfWeek.forEach((d, idx) => {
            const blocks = schedule[d];
            const isToday = idx === currentDayIndex;
            schedHTML += `<div style="margin:20px 0;"><h4>${d} ${isToday?"(HOY)":""}</h4>`;
            if (blocks.length === 0) {
                schedHTML += "<p style='color:#999'>— Día libre de estudio —</p>";
            } else {
                blocks.forEach(b => {
                    schedHTML += `<div style="background:${b.color}22; border-left:4px solid ${b.color}; padding:8px; margin:6px 0;">
                        ${Math.floor(b.start)}:${(b.start%1*60).toFixed(0).padStart(2,"0")} - 
                        ${Math.floor(b.end)}:${(b.end%1*60).toFixed(0).padStart(2,"0")} → 
                        <strong>${b.exam}</strong> (${(b.end-b.start).toFixed(1)}h)
                    </div>`;
                });
            }
            schedHTML += "</div>";
        });
        sched.innerHTML = schedHTML;

        // Cambiar pantalla
        document.getElementById("contenedor").classList.add("hidden");
        document.getElementById("container2").classList.add("hidden");
        results.classList.remove("hidden");
        results.scrollIntoView({ behavior: "smooth" });

    } catch (err) {
        alert("Error: " + err.message);
        console.error(err);
    }
}

// ============= EVENTOS =============
document.getElementById("studyForm").addEventListener("submit", e => {
    e.preventDefault();
    generateSchedule();
});

function regresar() {
    document.getElementById("contenedor").classList.remove("hidden");
    document.getElementById("results").classList.add("hidden");
    document.getElementById("container2").classList.add("hidden");
}

// Generar campos al cargar
document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("generateExamsBtn")?.click();
});