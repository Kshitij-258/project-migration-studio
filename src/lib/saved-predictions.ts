import { supabase } from "@/integrations/supabase/client";
import type { Student } from "@/lib/edu-track";
export interface SavedPrediction extends Student {
  id: string; student_id: string; predicted_score: number; risk_probability: number; created_at: string;
}
export async function loadSavedPredictions(): Promise<SavedPrediction[]> {
  const { data, error } = await supabase.from("saved_predictions").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}
export async function savePrediction(studentId: string, student: Student, score: number, probability: number) {
  const { data, error } = await supabase.from("saved_predictions").insert({ student_id: studentId, ...student, predicted_score: score, risk_probability: probability }).select("id").single();
  if (error) throw error;
  return data;
}
export async function deleteSavedPrediction(id: string) {
  const { error } = await supabase.from("saved_predictions").delete().eq("id", id);
  if (error) throw error;
}
