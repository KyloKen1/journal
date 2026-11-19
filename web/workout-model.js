// Workout logic with no page or network code.
// The routine is fixed here; workouts.json holds only the sessions logged against it:
// { sessions: [{ id, date: "YYYY-MM-DD", workout: "A" | "B", notes, exercises: [{ key, sets: [{ weight, reps }] }] }] }
// weight is kg (null for bodyweight), reps is a count, or seconds for timed exercises. Blank is null.
import { newId } from "./format.js";

// Two full-body workouts, alternated three days a week (A B A, then B A B).
// Each exercise is worked in a rep range: when every set reaches the top of the range, go heavier.
export const ROUTINE = {
  A: {
    name: "Workout A",
    exercises: [
      { key: "goblet-squat", name: "Goblet squat", gear: "Kettlebell or dumbbell", sets: 3, min: 8, max: 12, step: "the next bell up" },
      { key: "db-bench", name: "Dumbbell bench press", gear: "Dumbbells (floor press if no bench)", sets: 3, min: 8, max: 12, step: "2 kg per hand" },
      { key: "bb-row", name: "Barbell bent-over row", gear: "Barbell", sets: 3, min: 8, max: 12, step: "2.5 kg" },
      { key: "kb-swing", name: "Kettlebell swing", gear: "Kettlebell", sets: 3, min: 12, max: 20, step: "the next bell up" },
      { key: "plank", name: "Plank", gear: "Bodyweight", sets: 3, min: 30, max: 60, timed: true, step: "10 seconds a set" },
    ],
  },
  B: {
    name: "Workout B",
    exercises: [
      { key: "bb-rdl", name: "Barbell Romanian deadlift", gear: "Barbell", sets: 3, min: 8, max: 12, step: "5 kg" },
      { key: "db-ohp", name: "Standing dumbbell shoulder press", gear: "Dumbbells", sets: 3, min: 8, max: 12, step: "1–2 kg per hand" },
      { key: "db-lunge", name: "Dumbbell reverse lunge (each leg)", gear: "Dumbbells", sets: 3, min: 8, max: 12, step: "2 kg per hand" },
      { key: "db-row", name: "One-arm dumbbell row (each arm)", gear: "Dumbbell", sets: 3, min: 8, max: 12, step: "2 kg" },
      { key: "farmer-carry", name: "Farmer's carry", gear: "Heavy dumbbells or kettlebells", sets: 3, min: 30, max: 45, timed: true, step: "2–4 kg per hand" },
    ],
  },
};

export const WORKOUTS_PER_WEEK = 3;

const isObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v) => (typeof v === "string" ? v : "");

// A typed number, or null when blank or nonsense. Weights may be fractional, reps are whole.
export function toNumber(value, { whole = false } = {}) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const n = Number(String(value).replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return null;
  return whole ? Math.round(n) : Math.round(n * 100) / 100;
}

// Accepts the contents of workouts.json. Throws for a file we don't understand, so it is
// never shown as an empty log and saved over. Hand-edited sessions are repaired.
export function normalizeWorkouts(data) {
  if (!isObject(data) || !Array.isArray(data.sessions)) throw new Error("workout data is not readable");
  return data.sessions.filter(isObject).map((s) => ({
    id: text(s.id) || newId(),
    date: /^\d{4}-\d{2}-\d{2}$/.test(s.date) ? s.date : "",
    workout: s.workout === "B" ? "B" : "A",
    notes: text(s.notes),
    exercises: (Array.isArray(s.exercises) ? s.exercises : []).filter(isObject).map((ex) => ({
      key: text(ex.key),
      sets: (Array.isArray(ex.sets) ? ex.sets : []).filter(isObject).map((set) => ({
        weight: toNumber(set.weight),
        reps: toNumber(set.reps, { whole: true }),
      })),
    })),
  }));
}

// Newest first by date; among sessions on the same day, the one added last comes first.
export function sortedSessions(sessions) {
  return sessions
    .map((session, index) => ({ session, index }))
    .sort((a, b) => b.session.date.localeCompare(a.session.date) || b.index - a.index)
    .map(({ session }) => session);
}

// Workouts alternate: after an A comes a B.
export function nextWorkout(sessions) {
  const last = sortedSessions(sessions)[0];
  return last?.workout === "A" ? "B" : "A";
}

const done = (set) => set.reps !== null;

// The sets logged for an exercise in the latest session before `session` (or before today's
// log when none is given) that has any of them filled in. Null if never done.
export function previousSets(sessions, key, session = null) {
  const order = sortedSessions(sessions);
  const start = session ? order.indexOf(session) + 1 : 0;
  for (const s of order.slice(start)) {
    const sets = s.exercises.find((ex) => ex.key === key)?.sets.filter(done);
    if (sets?.length) return { date: s.date, sets };
  }
  return null;
}

// What to do this time, given what was done last time.
//   "start"   never done: pick a weight you can lift for the bottom of the range with good form
//   "heavier" every set reached the top of the range: add weight (or time) this session
//   "same"    keep the weight and beat last time's reps
export function advice(exercise, previous) {
  if (!previous) return { kind: "start" };
  const weight = previous.sets.find((set) => set.weight !== null)?.weight ?? null;
  const hitTop = previous.sets.length >= exercise.sets && previous.sets.every((set) => set.reps >= exercise.max);
  return { kind: hitTop ? "heavier" : "same", weight };
}

// A new session of workout A or B, dated today, with last time's weights filled in
// and the reps left blank to fill in as each set is done.
export function newSession(sessions, workout, date) {
  return {
    id: newId(),
    date,
    workout,
    notes: "",
    exercises: ROUTINE[workout].exercises.map((exercise) => {
      const previous = previousSets(sessions, exercise.key);
      const weight = previous?.sets.find((set) => set.weight !== null)?.weight ?? null;
      return { key: exercise.key, sets: Array.from({ length: exercise.sets }, () => ({ weight, reps: null })) };
    }),
  };
}

// How many sessions fall in the Monday-to-Sunday week holding `today` (YYYY-MM-DD).
export function sessionsThisWeek(sessions, today) {
  const d = new Date(`${today}T12:00:00`);
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const iso = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return sessions.filter((s) => s.date >= iso(monday) && s.date <= iso(sunday)).length;
}

// For each exercise ever logged: the heaviest weight in the first session and in the latest one,
// and the most reps in a set at that latest weight. Shows how far each lift has come.
export function progressSummary(sessions) {
  const oldestFirst = sortedSessions(sessions).reverse();
  const all = [...ROUTINE.A.exercises, ...ROUTINE.B.exercises];
  return all.map((exercise) => {
    const logged = oldestFirst
      .map((s) => s.exercises.find((ex) => ex.key === exercise.key)?.sets.filter(done) ?? [])
      .filter((sets) => sets.length);
    if (!logged.length) return null;
    const top = (sets) => Math.max(...sets.map((set) => set.weight ?? 0));
    const first = logged[0];
    const latest = logged[logged.length - 1];
    const latestTop = top(latest);
    const bestReps = Math.max(...latest.filter((set) => (set.weight ?? 0) === latestTop).map((set) => set.reps));
    return { exercise, sessions: logged.length, firstWeight: top(first), latestWeight: latestTop, latestReps: bestReps };
  }).filter(Boolean);
}
