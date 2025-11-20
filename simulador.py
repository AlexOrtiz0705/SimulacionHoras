"""
Simulador de horario de estudio con interfaz gráfica Tkinter
- Permite ingresar datos: número de exámenes, días hasta cada examen, dificultad por examen,
  horas diarias de transporte/comida/descanso, horario disponible para estudiar,
  horarios de clases por día (LU-SA) y día actual.
- Calcula bloques libres por día, horas recomendadas por examen (diarias) distribuidas
  proporcionalmente según dificultad y días hasta el examen.
- Muestra día de la semana de cada examen y un horario sugerido de estudio por día.

Instrucciones de uso:
- Ingrese listas separadas por comas donde se indique (por ejemplo: 3,5,10)
- Horarios de clases por día: use rangos separados por comas, ejemplo: 8-10,14-16
  Si no hay clases en un día deje vacío.

El código está comentado para explicar cada sección.
"""

import tkinter as tk
from tkinter import ttk, messagebox
from datetime import datetime, timedelta
import math

WEEKDAYS = ['LU','MA','MI','JU','VI','SA']  # solo Lunes-Sábado según requerimiento

# -------------------- Utilidades de tiempo --------------------

def parse_time_h(s):
    """Convierte una hora en formato H o H:M a número decimal de horas (0..24)."""
    s = s.strip()
    if not s:
        return None
    if ':' in s:
        h,m = s.split(':')
        return float(h) + float(m)/60.0
    else:
        return float(s)


def clamp(a, lo, hi):
    return max(lo, min(hi, a))

# -------------------- Cálculo de intervalos libres --------------------

def subtract_intervals(base, subtracts):
    """Resta una lista de intervalos (subtracts) de un intervalo base.
    base: (start, end); subtracts: list of (s,e)
    Devuelve lista de intervalos libres ordenados sin solapamientos.
    """
    free = []
    s0,e0 = base
    # normalize and clip subtracts to base
    subs = []
    for s,e in subtracts:
        s = clamp(s, s0, e0)
        e = clamp(e, s0, e0)
        if e > s:
            subs.append((s,e))
    subs.sort()
    cur = s0
    for s,e in subs:
        if s > cur:
            free.append((cur, s))
        cur = max(cur, e)
    if cur < e0:
        free.append((cur, e0))
    return free

# -------------------- Lógica de asignación de horas recomendadas --------------------

def compute_scores(difficulties, days_until):
    """Score para cada examen: (difficulty / days_until). Si days_until==0, tratar como 0.5 día para evitar div/0.
    """
    scores = []
    for d,du in zip(difficulties, days_until):
        du_eff = du if du>0 else 0.5
        scores.append(d / du_eff)
    return scores

# -------------------- Construcción del horario sugerido --------------------

def distribute_into_blocks(free_blocks, requested_hours):
    """Distribuye requested_hours (float) dentro de una lista de free_blocks [(s,e),...].
    Devuelve lista de (start,end) asignadas (puede estar vacía). No genera bloques de 0 horas.
    Intentamos llenar en orden los bloques disponibles con la cantidad solicitada.
    """
    assigned = []
    needs = requested_hours
    for s,e in free_blocks:
        if needs <= 0:
            break
        avail = e - s
        take = min(avail, needs)
        if take >= 1/60.0:  # mayor que 1 minuto
            assigned.append((s, s + take))
            needs -= take
    return assigned

# -------------------- Conversión y formateo --------------------

def fmt_interval(iv):
    s,e = iv
    return f"{int(s):02d}:{int((s-int(s))*60):02d} - {int(e):02d}:{int((e-int(e))*60):02d}"

# Pero formato anterior falla por redondeo, mejor función:

def fmt_hour(h):
    hh = int(h)%24
    mm = int(round((h - int(h))*60))
    if mm==60:
        hh = (hh+1)%24
        mm = 0
    return f"{hh:02d}:{mm:02d}"


def fmt_interval_precise(iv):
    s,e = iv
    return f"{fmt_hour(s)} - {fmt_hour(e)}"

# -------------------- Interfaz gráfica --------------------

class StudySchedulerApp:
    def __init__(self, root):
        self.root = root
        root.title('Simulador de Horario de Estudio')
        # Main frame
        frm = ttk.Frame(root, padding=10)
        frm.grid(row=0, column=0, sticky='nsew')
        root.columnconfigure(0, weight=1)
        root.rowconfigure(0, weight=1)

        # Input area (left)
        left = ttk.Frame(frm)
        left.grid(row=0, column=0, sticky='nw')

        r = 0
        ttk.Label(left, text='Número de exámenes:').grid(row=r, column=0, sticky='w')
        self.n_entry = ttk.Entry(left, width=10); self.n_entry.grid(row=r, column=1, sticky='w')
        r+=1

        ttk.Label(left, text='Días hasta cada examen (coma sep):').grid(row=r, column=0, sticky='w')
        self.days_entry = ttk.Entry(left, width=40); self.days_entry.grid(row=r, column=1, sticky='w')
        r+=1

        ttk.Label(left, text='Dificultad por examen (1-3, coma sep):').grid(row=r, column=0, sticky='w')
        self.diff_entry = ttk.Entry(left, width=40); self.diff_entry.grid(row=r, column=1, sticky='w')
        r+=1

        ttk.Label(left, text='Horas diarias transporte/comida/descanso (h):').grid(row=r, column=0, sticky='w')
        self.breaks_entry = ttk.Entry(left, width=10); self.breaks_entry.grid(row=r, column=1, sticky='w')
        r+=1

        ttk.Label(left, text='Horario diario disponible (inicio-fin, ej 8-22):').grid(row=r, column=0, sticky='w')
        self.day_window_entry = ttk.Entry(left, width=15); self.day_window_entry.grid(row=r, column=1, sticky='w')
        r+=1

        # Class schedules per weekday
        ttk.Label(left, text='Horarios de clases por día (LU..SA). Rango(s) ej: 8-10,14-16').grid(row=r, column=0, columnspan=2, sticky='w')
        r+=1
        self.class_entries = {}
        for i,wd in enumerate(WEEKDAYS):
            ttk.Label(left, text=f'{wd}:').grid(row=r, column=0, sticky='e')
            ent = ttk.Entry(left, width=30)
            ent.grid(row=r, column=1, sticky='w')
            self.class_entries[wd] = ent
            r+=1

        # Current day
        ttk.Label(left, text='Día actual (LU..SA):').grid(row=r, column=0, sticky='w')
        self.current_day_var = tk.StringVar(value='LU')
        ttk.Combobox(left, values=WEEKDAYS, textvariable=self.current_day_var, width=5).grid(row=r, column=1, sticky='w')
        r+=1

        # Button
        ttk.Button(left, text='Generar horario', command=self.generate).grid(row=r, column=0, columnspan=2, pady=(10,0))

        # Output area (right)
        right = ttk.Frame(frm)
        right.grid(row=0, column=1, padx=10, sticky='nsew')
        frm.columnconfigure(1, weight=1)
        right.rowconfigure(0, weight=1)
        right.columnconfigure(0, weight=1)

        self.output = tk.Text(right, width=80, height=35)
        self.output.grid(row=0, column=0, sticky='nsew')

    def parse_inputs(self):
        # parse basic fields and validate
        try:
            n = int(self.n_entry.get().strip())
        except Exception:
            raise ValueError('Número de exámenes inválido')
        days_txt = self.days_entry.get().strip()
        diffs_txt = self.diff_entry.get().strip()
        days_list = [int(x.strip()) for x in days_txt.split(',') if x.strip()]
        diffs_list = [int(x.strip()) for x in diffs_txt.split(',') if x.strip()]
        if not (len(days_list)==n and len(diffs_list)==n):
            raise ValueError('Las listas de días y dificultades deben tener longitud igual al número de exámenes')
        breaks = float(self.breaks_entry.get().strip() or 0)
        # day window
        dw = self.day_window_entry.get().strip()
        if '-' not in dw:
            raise ValueError('Horario diario inválido, use formato inicio-fin como 8-22 o 08:00-22:00')
        s_dw, e_dw = dw.split('-')
        s_dw = parse_time_h(s_dw); e_dw = parse_time_h(e_dw)
        if e_dw <= s_dw:
            raise ValueError('Horario diario: la hora fin debe ser mayor que la hora inicio')
        # class schedules
        class_schedules = {}
        for wd in WEEKDAYS:
            txt = self.class_entries[wd].get().strip()
            ranges = []
            if txt:
                parts = [p.strip() for p in txt.split(',') if p.strip()]
                for p in parts:
                    if '-' not in p:
                        raise ValueError(f'Rango inválido en {wd}: "{p}"')
                    a,b = p.split('-')
                    a = parse_time_h(a); b = parse_time_h(b)
                    if b<=a:
                        raise ValueError(f'Rango inválido en {wd}: "{p}"')
                    ranges.append((a,b))
            class_schedules[wd] = ranges
        current_day = self.current_day_var.get()
        if current_day not in WEEKDAYS:
            raise ValueError('Día actual inválido')
        return n, days_list, diffs_list, breaks, (s_dw,e_dw), class_schedules, current_day

    def generate(self):
        self.output.delete('1.0', tk.END)
        try:
            n, days_list, diffs_list, breaks, day_window, class_schedules, current_day = self.parse_inputs()
        except Exception as e:
            messagebox.showerror('Error', str(e))
            return

        # 1) Calcular bloques libres por día (LU..SA) según clases, ventana diaria y pausa (transporte/comida/descanso)
        # Pondremos la pausa como un bloque continuo centrado a las 12:00 si cabe, o justo después del inicio.
        s_dw, e_dw = day_window
        # duration of pause
        pause_len = min(breaks, max(0.0, e_dw - s_dw))

        free_blocks_by_day = {}
        for wd in WEEKDAYS:
            # subtract class ranges and pause block from day window
            class_ranges = class_schedules[wd]
            # determine pause placement: prefer centered near midday between s_dw and e_dw
            mid = (s_dw + e_dw) / 2
            pstart = mid - pause_len/2
            pend = pstart + pause_len
            if pstart < s_dw:
                pstart = s_dw
                pend = pstart + pause_len
            if pend > e_dw:
                pend = e_dw
                pstart = pend - pause_len
            subtracts = list(class_ranges)
            if pause_len>0:
                subtracts.append((pstart, pend))
            free = subtract_intervals((s_dw,e_dw), subtracts)
            free_blocks_by_day[wd] = free

        # 2) Calcular horas recomendadas diarias por examen
        scores = compute_scores(diffs_list, days_list)
        total_score = sum(scores) if sum(scores)>0 else 1.0
        # Usamos como "capacidad diaria" la media de horas libres entre LU..SA
        free_hours_list = [sum(e-s for s,e in free_blocks_by_day[wd]) for wd in WEEKDAYS]
        avg_daily_free = sum(free_hours_list)/len(free_hours_list)
        # Horas recomendadas por examen (diarias) = proporción * avg_daily_free
        rec_daily = [ (sc/total_score)*avg_daily_free for sc in scores ]

        # 3) Qué día de la semana será cada examen
        cur_idx = WEEKDAYS.index(current_day)
        exam_weekdays = []
        for du in days_list:
            # day index: current + du (du days ahead). If du==0 then same day.
            idx = (cur_idx + du) % len(WEEKDAYS)
            exam_weekdays.append(WEEKDAYS[idx])

        # 4) Generar horario sugerido de estudio por día, indicando bloques y examen asignado
        # Vamos a crear un plan para los siguientes max(days_list) días, asignando en cada día los rec_daily
        plan_by_day = {}  # key: (day_index overall from current day 0..maxdays) -> list of (wd, date_offset, [(start,end,exam_i)])
        max_days = max(days_list) if days_list else 0
        # Precompute sequence of weekday labels for each offset
        weekday_for_offset = [WEEKDAYS[(cur_idx + i) % len(WEEKDAYS)] for i in range(max_days+1)]

        # For assignment order, priorizamos exámenes más próximos (menor days_until)
        exams_order = sorted(range(len(days_list)), key=lambda i: days_list[i])

        # For each day offset, build free blocks for that weekday, then try to fill with each exam's rec_daily
        for offset in range(max_days+1):
            wd = weekday_for_offset[offset]
            free_blocks = free_blocks_by_day[wd].copy()  # use same free blocks each week-day
            day_assignments = []
            # For each exam in priority order, if the exam has not passed (offset <= days_until), assign rec_daily
            for ex in exams_order:
                du = days_list[ex]
                # Only assign study on days that are <= days_until for that exam (i.e., before exam day)
                if offset > du:
                    continue
                hours_needed = rec_daily[ex]
                # Distribute within free_blocks
                assigned = distribute_into_blocks(free_blocks, hours_needed)
                # Remove used time from free_blocks
                if assigned:
                    new_free = []
                    ai = 0
                    for fb in free_blocks:
                        s_fb,e_fb = fb
                        cur = s_fb
                        # subtract assigned segments that overlap this fb
                        for a_s,a_e in assigned:
                            # if assigned outside this fb skip
                            if a_e <= s_fb or a_s >= e_fb:
                                continue
                            # part before assignment
                            if a_s > cur and a_s > s_fb:
                                new_free.append((cur, min(a_s,e_fb)))
                            cur = max(cur, min(e_fb, a_e))
                        # after processing assigned within fb
                        if cur < e_fb:
                            new_free.append((cur, e_fb))
                    free_blocks = new_free
                    # store assignments with exam index
                    for a in assigned:
                        day_assignments.append((a[0], a[1], ex))
            # sort assignments by start time
            day_assignments.sort()
            plan_by_day[offset] = (wd, day_assignments)

        # ---------- Mostrar resultados en el área de texto ----------
        out = []
        out.append('Horas recomendadas por examen (diarias):\n')
        for i,(r,d,du,wdex) in enumerate(zip(rec_daily, diffs_list, days_list, exam_weekdays)):
            out.append(f'  Examen {i+1}: dificultad={d}, días={du}, día de semana del examen={wdex}, -> {r:.2f} h/día')
        out.append('\nBloques libres por día (LU..SA):')
        for wd in WEEKDAYS:
            free = free_blocks_by_day[wd]
            hrs = sum(e-s for s,e in free)
            out.append(f'  {wd}: {hrs:.2f} h libres')
            for s,e in free:
                out.append(f'    {fmt_interval_precise((s,e))}')
        out.append('\nHorario de estudio sugerido por día (desde día actual):')
        for offset in range(max_days+1):
            wd, assigns = plan_by_day[offset]
            day_label = f'Día +{offset} ({wd})'
            out.append('\n' + day_label + ':')
            if not assigns:
                out.append('   No hay bloques asignados')
                continue
            for s,e,ex in assigns:
                dur = e - s
                if dur < 1/3600.0:  # skip practically 0
                    continue
                out.append(f'   {fmt_interval_precise((s,e))}  -> Examen {ex+1}  ({dur:.2f} h)')

        self.output.insert('1.0', '\n'.join(out))


if __name__ == '__main__':
    root = tk.Tk()
    app = StudySchedulerApp(root)
    root.mainloop()
