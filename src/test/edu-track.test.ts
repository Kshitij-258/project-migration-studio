import { describe, expect, it } from "vitest";
import { demoCohort, estimateStudent, parseStudentCsv, presets, riskLevel, sampleDatasetToCsv } from "@/lib/edu-track";

describe("EduTrack model rules", () => {
  it("keeps the source risk tier boundaries", () => {
    expect(riskLevel(0.249)).toBe("On track");
    expect(riskLevel(0.25)).toBe("Keep an eye on");
    expect(riskLevel(0.499)).toBe("Keep an eye on");
    expect(riskLevel(0.5)).toBe("Needs support");
  });
  it("scores the thriving example above the student needing support", () => {
    const thriving = presets["Thriving student"];
    const support = presets["Student who may need support"];
    if (!thriving || !support) throw new Error("Expected student examples are missing.");
    expect(estimateStudent(thriving).predicted_score).toBeGreaterThan(estimateStudent(support).predicted_score);
  });
  it("rejects batch input without required columns", () => {
    const result = parseStudentCsv("attendance,study_hours\n80,3");
    expect(result.errors[0]).toContain("Missing required columns");
    expect(result.rows).toHaveLength(0);
  });
  it("keeps original dataset columns in the sample export", () => {
    const [header] = sampleDatasetToCsv(demoCohort.slice(0, 1)).split("\n");
    expect(header).toBe("student_id,attendance,study_hours,assignment_completion,previous_score,internal_marks,absences,mathematics,programming,electronics,final_score,academic_risk");
  });
});
