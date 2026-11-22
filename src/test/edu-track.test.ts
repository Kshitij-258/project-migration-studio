import { describe, expect, it } from "vitest";
import { calculateAttendancePercentage, demoCohort, estimateStudent, parseStudentCsv, presets, profileToStudent, riskLevel, sampleDatasetToCsv, validateStudentProfile, type StudentProfile } from "@/lib/edu-track";

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
  it("calculates attendance from attended and held sessions", () => {
    expect(calculateAttendancePercentage(18, 24)).toBe(75);
  });
  it("normalizes subject marks by each teacher-entered maximum", () => {
    const profile: StudentProfile = { attendanceAttended: 18, attendanceHeld: 24, study_hours: 3, assignment_completion: 75, previous_score: 60, internal_marks: 30, absences: 4, subjects: [{ id: "1", name: "Algebra", marks: 30, maxMarks: 40 }, { id: "2", name: "Biology", marks: 80, maxMarks: 100 }] };
    expect(profileToStudent(profile).mathematics).toBe(77.5);
    expect(profileToStudent(profile).attendance).toBe(75);
  });
  it("rejects attendance beyond held sessions and marks beyond the subject maximum", () => {
    const profile: StudentProfile = { attendanceAttended: 5, attendanceHeld: 4, study_hours: 3, assignment_completion: 75, previous_score: 60, internal_marks: 30, absences: 4, subjects: [{ id: "1", name: "Algebra", marks: 41, maxMarks: 40 }] };
    const errors = validateStudentProfile(profile);
    expect(errors).toContain("Sessions attended cannot exceed sessions held.");
    expect(errors).toContain("Subject marks must be from 0 through that subject's maximum.");
  });
});
