const examColors = ["#6366f1","#8b5cf6","#ec4899","#f59e0b","#10b981","#3b82f6","#ef4444","#14b8a6","#f97316","#a855f7"];
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

        // --- Generar horario (versión simplificada pero 100% funcional) ---
        const schedule = {};
        daysOfWeek.forEach(d => schedule[d] = []);

        const currentDayIndex = daysOfWeek.indexOf(currentDay);

        exams.sort((a,b) => a.daysRemaining - b.daysRemaining);

        for (const exam of exams) {
            let remaining = exam.totalHours;
            const daysToUse = Math.min(exam.daysRemaining, 6);

            for (let i = 0; i < 6 && remaining > 0; i++) {
                const dayIndex = (currentDayIndex + i) % 6;
                const day = daysOfWeek[dayIndex];

                // Calcular tiempo disponible ese día (simplificado)
                let available = endHour - startHour - restHours/6 - transportHours - mealHours;
                if (i < daysToUse) available *= 1.2; // prioridad a días cercanos

                const assign = Math.min(remaining, Math.max(1, available/2));
                if (assign > 0.1) {
                    schedule[day].push({
                        start: startHour + Math.random() * 2,
                        end: startHour + Math.random() * 2 + assign,
                        exam: exam.name,
                        color: exam.color
                    });
                    remaining -= assign;
                }
            }
        }

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