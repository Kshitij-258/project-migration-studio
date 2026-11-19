export const featureSpecs = [
  { id: "attendance", label: "Attendance", min: 0, max: 100, step: 1, unit: "%", initial: 80 },
  { id: "study_hours", label: "Study hours / day", min: 0, max: 10, step: 0.5, unit: "h", initial: 3 },
  { id: "assignment_completion", label: "Assignments completed", min: 0, max: 100, step: 1, unit: "%", initial: 75 },
  { id: "previous_score", label: "Previous exam score", min: 0, max: 100, step: 1, unit: "%", initial: 60 },
  { id: "internal_marks", label: "Internal marks", min: 0, max: 50, step: 1, unit: "/50", initial: 30 },
  { id: "absences", label: "Absences", min: 0, max: 60, step: 1, unit: "days", initial: 4 },
  { id: "mathematics", label: "Mathematics", min: 0, max: 100, step: 1, unit: "/100", initial: 60 },
  { id: "programming", label: "Programming", min: 0, max: 100, step: 1, unit: "/100", initial: 65 },
  { id: "electronics", label: "Electronics", min: 0, max: 100, step: 1, unit: "/100", initial: 55 },
] as const;
export type FeatureId = (typeof featureSpecs)[number]["id"];
export type Student = Record<FeatureId, number>;
export type RiskLevel = "On track" | "Keep an eye on" | "Needs support";
export const actionableFeatures: FeatureId[] = ["attendance", "study_hours", "assignment_completion"];
export const initialStudent: Student = {
  attendance: 80,
  study_hours: 3,
  assignment_completion: 75,
  previous_score: 60,
  internal_marks: 30,
  absences: 4,
  mathematics: 60,
  programming: 65,
  electronics: 55,
};
export const presets: Record<string, Student> = {
  "Custom entry": initialStudent,
  "Thriving student": { attendance: 94, study_hours: 4.5, assignment_completion: 96, previous_score: 82, internal_marks: 44, absences: 2, mathematics: 85, programming: 90, electronics: 80 },
  "Average student": { attendance: 78, study_hours: 3.5, assignment_completion: 72, previous_score: 60, internal_marks: 29, absences: 5, mathematics: 55, programming: 62, electronics: 58 },
  "Student who may need support": { attendance: 52, study_hours: 1, assignment_completion: 38, previous_score: 36, internal_marks: 14, absences: 13, mathematics: 32, programming: 45, electronics: 38 },
};
export interface StudentRecord extends Student { student_id: string; final_score: number; academic_risk: number; }
export interface Prediction { predicted_score: number; score_low: number; score_high: number; risk_probability: number; risk_level: RiskLevel; percentile: number; }
export function riskLevel(probability: number): RiskLevel {
  if (probability >= 0.5) return "Needs support";
  if (probability >= 0.25) return "Keep an eye on";
  return "On track";
}
function randomSource(seed: number) {
  let state = seed >>> 0;
  return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
}
function makeCohort(count: number): StudentRecord[] {
  const random = randomSource(42);
  const normal = () => Math.sqrt(-2 * Math.log(Math.max(random(), 1e-10))) * Math.cos(2 * Math.PI * random());
  const clip = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
  return Array.from({ length: count }, (_, i) => {
    const ability = normal(), diligence = normal();
    const attendance = clip(78 + 6 * ability + 9 * diligence + normal() * 7, 35, 100);
    const study_hours = clip(3.6 + 0.5 * ability + diligence + normal(), 0, 10);
    const assignment_completion = clip(72 + 7 * ability + 8 * diligence + normal() * 8, 20, 100);
    const previous_score = clip(62 + 14 * ability + 2 * diligence + normal() * 7, 25, 98);
    const internal_marks = clip(30 + 6 * ability + 3 * diligence + normal() * 3.5, 8, 50);
    const absences = Math.max(0, Math.round((100 - attendance) / 5 + normal() * 1.5));
    const subject = (bias: number) => clip(58 + 13 * ability + 2 * diligence + bias + normal() * 9, 0, 100);
    const mathematics = subject(-4), programming = subject(3), electronics = subject(-1);
    const final_score = clip(0.14 * attendance + 2.2 * study_hours + 0.1 * assignment_completion + 0.16 * previous_score + 0.6 * internal_marks + 0.14 * (mathematics + programming + electronics) / 3 - 0.25 * absences + normal() * 4.5 - 5, 0, 100);
    const round = (n: number) => Math.round(n * 10) / 10;
    return { student_id: `STU${String(i + 1).padStart(4, "0")}`, attendance: round(attendance), study_hours: round(study_hours), assignment_completion: round(assignment_completion), previous_score: round(previous_score), internal_marks: round(internal_marks), absences, mathematics: round(mathematics), programming: round(programming), electronics: round(electronics), final_score: round(final_score), academic_risk: Number(final_score < 40) };
  });
}
export const demoCohort = makeCohort(1500);
export function estimateStudent(student: Student): Prediction {
  const predicted_score = Math.max(0, Math.min(100, 0.14 * student.attendance + 2.2 * student.study_hours + 0.1 * student.assignment_completion + 0.16 * student.previous_score + 0.6 * student.internal_marks + 0.14 * (student.mathematics + student.programming + student.electronics) / 3 - 0.25 * student.absences - 5));
  const risk_probability = 1 / (1 + Math.exp((predicted_score - 43) / 7));
  const sorted = demoCohort.map((row) => row.final_score).sort((a, b) => a - b);
  const percentile = sorted.filter((value) => value < predicted_score).length / sorted.length * 100;
  return { predicted_score, score_low: Math.max(0, predicted_score - 6), score_high: Math.min(100, predicted_score + 6), risk_probability, risk_level: riskLevel(risk_probability), percentile };
}
const scoreWeights: Record<FeatureId, number> = { attendance: 0.14, study_hours: 2.2, assignment_completion: 0.1, previous_score: 0.16, internal_marks: 0.6, absences: -0.25, mathematics: 0.14 / 3, programming: 0.14 / 3, electronics: 0.14 / 3 };
export function explainStudent(student: Student) {
  return featureSpecs.map((field) => {
    const avg = demoCohort.reduce((sum, row) => sum + row[field.id], 0) / demoCohort.length;
    return { ...field, impact: scoreWeights[field.id] * (student[field.id] - avg) };
  }).sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));
}
export function recommendations(student: Student, prediction: Prediction) {
  const tips: { rank: number; text: string }[] = [];
  if (prediction.risk_probability >= 0.5) tips.push({ rank: 100, text: "Offer a supportive teacher or mentor check-in to make a plan together." });
  if (student.attendance < 65) tips.push({ rank: 95, text: `Attendance is ${student.attendance}%. Check what is making attendance difficult and plan a supported next step.` });
  else if (student.attendance < 75) tips.push({ rank: 70, text: "Attendance is near the usual 75% threshold; help protect it for the rest of term." });
  if (student.study_hours < 2) tips.push({ rank: 90, text: "Try a steady 2–3 hour study routine split into focused blocks and short breaks." });
  else if (student.study_hours < 3) tips.push({ rank: 55, text: "Adding a little daily revision time may help build confidence." });
  if (student.assignment_completion < 60) tips.push({ rank: 85, text: "Start with pending assignments, even if imperfect, to build marks and understanding." });
  if (student.internal_marks < 20) tips.push({ rank: 80, text: "Ask which topics lost internal marks and plan a focused review." });
  if (student.previous_score < 45) tips.push({ rank: 60, text: "Revisit core concepts before moving on to advanced problems." });
  if (student.absences >= 10) tips.push({ rank: 65, text: "If there is a reason for missed classes, offer a private conversation so support can be arranged." });
  const subjects: FeatureId[] = ["mathematics", "programming", "electronics"];
  const weakest = [...subjects].sort((a, b) => student[a] - student[b])[0];
  const strongest = [...subjects].sort((a, b) => student[b] - student[a])[0];
  if (weakest && strongest && student[weakest] < 50) {
    tips.push({ rank: 88, text: `${weakest[0]?.toUpperCase()}${weakest.slice(1)} may need attention. Practise questions and ask for help with difficult topics.` });
  } else if (weakest && strongest && student[weakest] < 65 && student[strongest] - student[weakest] > 15) {
    tips.push({ rank: 45, text: `${weakest[0]?.toUpperCase()}${weakest.slice(1)} trails ${strongest[0]?.toUpperCase()}${strongest.slice(1)}; consider shifting some revision time there.` });
  }
  const result = tips.sort((a, b) => b.rank - a.rank).slice(0, 5).map((tip) => tip.text);
  if (!result.length) {
    return ["Habits and marks look steady. Keep the routine and consider stretching further in a strong subject."];
  }
  if (prediction.predicted_score >= 70 && prediction.risk_probability < 0.25) {
    result.push("Overall, progress looks steady—keep the momentum going.");
  }
  return result;
}
export function parseStudentCsv(text: string) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return { rows: [] as Student[], studentIds: [] as string[], errors: ["Add a header and at least one student row."] };
  const split = (line: string) => {
    const cells: string[] = [];
    let cell = "";
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      if (char === '"' && line[index + 1] === '"' && quoted) { cell += '"'; index += 1; }
      else if (char === '"') quoted = !quoted;
      else if (char === "," && !quoted) { cells.push(cell.trim()); cell = ""; }
      else cell += char;
    }
    cells.push(cell.trim());
    return cells;
  };
  const headers = split(lines[0] ?? "").map((item) => item.toLowerCase());
  const missing = featureSpecs.map((field) => field.id).filter((id) => !headers.includes(id));
  if (missing.length) return { rows: [] as Student[], studentIds: [] as string[], errors: [`Missing required columns: ${missing.join(", ")}.`] };
  const rows: Student[] = [], studentIds: string[] = [], errors: string[] = [];
  const studentIdIndex = headers.indexOf("student_id");
  for (const [index, line] of lines.slice(1, 5001).entries()) {
    const cells = split(line), row = {} as Student;
    let valid = true;
    for (const field of featureSpecs) {
      const value = Number(cells[headers.indexOf(field.id)]);
      row[field.id] = value;
      if (!Number.isFinite(value) || value < field.min || value > field.max) valid = false;
    }
    if (valid) {
      rows.push(row);
      studentIds.push(studentIdIndex >= 0 && cells[studentIdIndex] ? cells[studentIdIndex] : `ROW-${index + 1}`);
    }
    else if (errors.length < 5) errors.push(`Row ${index + 2} has missing, invalid, or out-of-range values and was skipped.`);
  }
  if (lines.length > 5001) errors.push("Only the first 5,000 student rows are processed.");
  return { rows, studentIds, errors };
}
export function predictionsToCsv(rows: { student_id: string; student: Student; prediction: Prediction }[]) {
  const headers = ["student_id", ...featureSpecs.map((field) => field.id), "predicted_score", "score_low", "score_high", "risk_probability", "risk_level"];
  const body = rows.map(({ student_id, student, prediction }) => [student_id, ...featureSpecs.map((field) => student[field.id]), prediction.predicted_score.toFixed(1), prediction.score_low.toFixed(1), prediction.score_high.toFixed(1), prediction.risk_probability.toFixed(3), prediction.risk_level].join(","));
  return [headers.join(","), ...body].join("\n");
}

export function sampleDatasetToCsv(rows: StudentRecord[]) {
  const headers = ["student_id", ...featureSpecs.map((field) => field.id), "final_score", "academic_risk"];
  const body = rows.map((row) => [
    row.student_id,
    ...featureSpecs.map((field) => row[field.id]),
    row.final_score,
    row.academic_risk,
  ].join(","));
  return [headers.join(","), ...body].join("\n");
}
