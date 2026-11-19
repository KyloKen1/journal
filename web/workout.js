// The Workout tab: the routine, a log of each session's weights and reps, and what to lift next time.
import { el } from "./dom.js";
import { todayISO } from "./format.js";
import { formatCheckedDate } from "./suggest.js";
import {
  ROUTINE, WORKOUTS_PER_WEEK, advice, demoLink, newSession, nextWorkout, previousSets, progressSummary,
  sessionsThisWeek, sortedSessions, toNumber,
} from "./workout-model.js";

// Which session is open survives switching tabs, but not a page reload.
let openId = null;

const range = (ex) => `${ex.sets} × ${ex.min}–${ex.max}${ex.timed ? " s" : " reps"}`;
const kg = (n) => (n === null || n === undefined ? "" : `${n} kg`);
const longDate = (iso) => (iso ? `${formatCheckedDate(iso)} ${iso.slice(0, 4)}` : "No date");
// Opens in a new tab, so a workout being logged stays open.
const howTo = (exercise) => el("a", {
  class: "how-to", href: demoLink(exercise), target: "_blank", rel: "noopener noreferrer",
  "aria-label": `How to do ${exercise.name} (opens in a new tab)`,
}, "How to do it ↗");
const exerciseFor = (session, key) => ROUTINE[session.workout].exercises.find((ex) => ex.key === key);

// "20 kg × 12, 12, 10" — or "45 s, 40 s" for a timed exercise without weight.
export function describeSets(exercise, sets) {
  const unit = exercise.timed ? " s" : "";
  const weights = [...new Set(sets.map((set) => set.weight))];
  if (weights.length === 1) {
    const reps = sets.map((set) => `${set.reps}${unit}`).join(", ");
    return weights[0] === null ? reps : `${kg(weights[0])} × ${reps}`;
  }
  return sets.map((set) => (set.weight === null ? `${set.reps}${unit}` : `${kg(set.weight)} × ${set.reps}${unit}`)).join(", ");
}

function adviceText(exercise, tip) {
  if (tip.kind === "start") {
    return exercise.timed
      ? `First time: go for ${exercise.min} seconds a set with good form.`
      : `First time: pick a weight you can lift ${exercise.min} times with good form, with 2–3 more reps in the tank.`;
  }
  if (tip.kind === "heavier") {
    return exercise.timed && tip.weight === null
      ? `You reached ${exercise.max} s on every set. Add ${exercise.step}, or hold a weight.`
      : `You reached ${exercise.max}${exercise.timed ? " s" : ""} on every set. Go heavier: add ${exercise.step}.`;
  }
  return exercise.timed
    ? "Same as last time. Try to hold each set a few seconds longer."
    : "Same weight as last time. Try to beat last time by at least one rep.";
}

export function renderWorkout(root, state, changed) {
  const listEl = el("ol", { class: "session-items" });
  const countEl = el("span", { class: "muted workout-count" });
  const startEl = el("button", { type: "button", class: "primary workout-start", onclick: () => start(nextWorkout(state.sessions)) });
  const otherEl = el("button", { type: "button", class: "workout-other", onclick: () => start(nextWorkout(state.sessions) === "A" ? "B" : "A") });
  const progressEl = el("div", { class: "workout-progress" });

  root.append(
    el("div", { class: "workout" },
      el("div", { class: "workout-header" }, startEl, otherEl, countEl),
      renderPlan(state.sessions.length === 0),
      progressEl,
      el("h3", {}, "Log"),
      listEl,
    ),
  );

  function start(workout) {
    const session = newSession(state.sessions, workout, todayISO());
    state.sessions.push(session);
    openId = session.id;
    changed();
    renderAll();
    listEl.querySelector(".session.open")?.scrollIntoView?.({ block: "nearest" });
  }

  function renderHeader() {
    const next = nextWorkout(state.sessions);
    startEl.textContent = `Start ${ROUTINE[next].name}`;
    otherEl.textContent = `Do ${next === "A" ? "B" : "A"} instead`;
    const week = sessionsThisWeek(state.sessions, todayISO());
    const total = state.sessions.length;
    countEl.textContent = `This week: ${week} of ${WORKOUTS_PER_WEEK} · ${total} ${total === 1 ? "workout" : "workouts"} logged`;
  }

  function renderProgress() {
    const rows = progressSummary(state.sessions);
    progressEl.replaceChildren();
    if (!rows.length) return;
    progressEl.append(
      el("details", { class: "workout-section" },
        el("summary", {}, "Progress"),
        el("table", { class: "progress-table" },
          el("thead", {}, el("tr", {}, el("th", {}, "Exercise"), el("th", {}, "Started"), el("th", {}, "Now"), el("th", {}, "Sessions"))),
          el("tbody", {}, rows.map((row) => el("tr", {},
            el("td", {}, row.exercise.name),
            el("td", { class: "num" }, row.firstWeight ? kg(row.firstWeight) : "—"),
            el("td", { class: "num" }, `${row.latestWeight ? `${kg(row.latestWeight)} × ` : ""}${row.latestReps}${row.exercise.timed ? " s" : ""}`),
            el("td", { class: "num" }, String(row.sessions)),
          ))),
        ),
      ),
    );
  }

  function renderList() {
    const sessions = sortedSessions(state.sessions);
    listEl.replaceChildren(...sessions.map(renderRow));
    if (!sessions.length) listEl.append(el("li", { class: "muted empty" }, "No workouts logged yet. Start Workout A when you're ready."));
  }

  function renderAll() {
    renderHeader();
    renderProgress();
    renderList();
  }

  function renderRow(session) {
    const dateEl = el("span", { class: "session-date" });
    const nameEl = el("span", { class: "session-name" });
    const summaryEl = el("span", { class: "session-summary muted" });

    function refresh() {
      dateEl.textContent = longDate(session.date);
      nameEl.textContent = ROUTINE[session.workout].name;
      const sets = session.exercises.flatMap((ex) => ex.sets);
      summaryEl.textContent = `${sets.filter((set) => set.reps !== null).length} of ${sets.length} sets done`;
      renderHeader();
    }
    refresh();

    const open = session.id === openId;
    return el("li", { class: open ? "session open" : "session" },
      el("button", {
        type: "button", class: "session-row", "aria-expanded": String(open),
        onclick: () => { openId = open ? null : session.id; renderAll(); },
      }, dateEl, nameEl, summaryEl),
      open && renderEditor(session, refresh),
    );
  }

  function renderEditor(session, refresh) {
    const edit = () => { refresh(); changed(); };
    return el("div", { class: "session-editor" },
      el("label", { class: "field session-date-field" }, el("span", {}, "Date"),
        el("input", { type: "date", class: "session-date-input", value: session.date, oninput: (e) => { session.date = e.target.value; edit(); } })),
      session.exercises.map((entry) => {
        const exercise = exerciseFor(session, entry.key);
        return exercise ? renderExercise(session, entry, exercise, edit) : null;
      }),
      el("label", { class: "field" }, el("span", {}, "Notes (how it felt, anything to change)"),
        el("textarea", { rows: 3, class: "session-notes", value: session.notes, oninput: (e) => { session.notes = e.target.value; edit(); } })),
      el("div", { class: "actions" },
        el("button", { type: "button", class: "session-done", onclick: () => { openId = null; renderAll(); } }, "Done"),
        el("button", {
          type: "button", class: "danger session-delete",
          onclick: () => {
            if (!confirm("Delete this workout and its sets? This can't be undone.")) return;
            state.sessions.splice(state.sessions.indexOf(session), 1);
            openId = null;
            changed();
            renderAll();
          },
        }, "Delete"),
      ),
    );
  }

  function renderExercise(session, entry, exercise, edit) {
    const previous = previousSets(state.sessions, exercise.key, session);
    const tip = advice(exercise, previous);
    const setsEl = el("ol", { class: "set-rows" });

    function renderSets() {
      setsEl.replaceChildren(...entry.sets.map((set, i) => el("li", { class: "set-row" },
        el("span", { class: "set-label muted" }, `Set ${i + 1}`),
        el("label", { class: "set-input" },
          el("input", {
            type: "text", inputMode: "decimal", class: "set-weight", value: set.weight ?? "",
            "aria-label": `Set ${i + 1} weight in kg`, placeholder: exercise.timed ? "—" : "",
            oninput: (e) => { set.weight = toNumber(e.target.value); edit(); },
          }),
          el("span", { class: "muted" }, "kg"),
        ),
        el("span", { class: "muted" }, "×"),
        el("label", { class: "set-input" },
          el("input", {
            type: "text", inputMode: "numeric", class: "set-reps", value: set.reps ?? "",
            "aria-label": `Set ${i + 1} ${exercise.timed ? "seconds" : "reps"}`, placeholder: "",
            oninput: (e) => { set.reps = toNumber(e.target.value, { whole: true }); edit(); },
          }),
          el("span", { class: "muted" }, exercise.timed ? "s" : "reps"),
        ),
        el("button", {
          type: "button", class: "remove set-remove", "aria-label": `Remove set ${i + 1}`,
          onclick: () => { entry.sets.splice(i, 1); renderSets(); edit(); },
        }, "×"),
      )));
    }
    renderSets();

    return el("section", { class: "exercise" },
      el("div", { class: "exercise-head" },
        el("span", { class: "exercise-name" }, exercise.name),
        el("span", { class: "exercise-target muted" }, range(exercise)),
        howTo(exercise),
      ),
      el("p", { class: "exercise-last muted" },
        previous ? `Last time (${formatCheckedDate(previous.date)}): ${describeSets(exercise, previous.sets)}` : `${exercise.gear}. Not done before.`),
      el("p", { class: `exercise-advice advice-${tip.kind}` }, adviceText(exercise, tip)),
      setsEl,
      el("button", {
        type: "button", class: "set-add",
        onclick: () => {
          const last = entry.sets[entry.sets.length - 1];
          entry.sets.push({ weight: last?.weight ?? null, reps: null });
          renderSets();
          edit();
        },
      }, "+ Set"),
    );
  }

  renderAll();
}

function renderPlan(open) {
  const table = (key) => el("div", { class: "plan-workout" },
    el("h4", {}, ROUTINE[key].name),
    el("table", { class: "plan-table" },
      el("tbody", {}, ROUTINE[key].exercises.map((ex) => el("tr", {},
        el("td", {}, ex.name, el("div", { class: "muted plan-gear" }, ex.gear, " · ", howTo(ex))),
        el("td", { class: "num" }, range(ex)),
      ))),
    ),
  );
  return el("details", { class: "workout-section plan", open },
    el("summary", {}, "The plan"),
    el("ul", { class: "plan-rules" },
      el("li", {}, "Three workouts a week on days that aren't back to back, such as Mon, Wed and Fri. Alternate A and B: A B A one week, B A B the next."),
      el("li", {}, "Warm up for 5 minutes first: brisk walk or skipping, then 10 bodyweight squats, 10 hip hinges and arm circles. Do a light set of your first exercise."),
      el("li", {}, "Rest 1½–2 minutes between sets. A session takes about 45 minutes."),
      el("li", {}, "New to an exercise? Tap How to do it to watch it done properly before adding weight."),
      el("li", {}, "Every set should end with 1–3 reps left in the tank. Good form comes before more weight."),
      el("li", {}, "How to progress: stay at a weight until you reach the top of the range on every set, then go heavier and work back up. The log tells you when."),
      el("li", {}, "For the desk days: get up every hour, and do a 1-minute hip-flexor stretch on each side and 10 band pull-aparts or wall slides."),
    ),
    el("div", { class: "plan-workouts" }, table("A"), table("B")),
  );
}
