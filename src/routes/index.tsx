import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity, ArrowDownRight, ArrowUpRight, BookOpenCheck, ChartNoAxesCombined, ChevronDown,
  CircleAlert, ClipboardList, Download, FileUp, GraduationCap, Info, LayoutDashboard, LockKeyhole,
  Menu, Plus, Save, Search, ShieldCheck, Sparkles, Target, Trash2, Users, X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { supabase } from "@/integrations/supabase/client";
import {
  actionableFeatures, demoCohort, estimateStudent, explainStudent, featureSpecs, initialStudent,
  parseStudentCsv, predictionsToCsv, presets, recommendations, sampleDatasetToCsv,
  calculateAttendancePercentage, initialSubjects, profileToStudent, validateStudentProfile,
  type FeatureId, type Prediction, type Student, type StudentProfile, type StudentRecord, type SubjectAssessment,
} from "@/lib/edu-track";
import { deleteSavedPrediction, loadSavedPredictions, savePrediction, type SavedPrediction } from "@/lib/saved-predictions";
import { generateStudentGuidance } from "@/lib/student-guidance.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "EduTrack AI — Student Progress Studio" },
      { name: "description", content: "Explore student progress signals, estimate outcomes, and plan supportive next steps." },
      { property: "og:title", content: "EduTrack AI — Student Progress Studio" },
      { property: "og:description", content: "A teacher-friendly student progress workspace with estimates, cohort views, and supportive guidance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EduTrackApp,
});

type View = "Overview" | "Predict a student" | "Batch prediction" | "Saved predictions" | "Model notes" | "About";
type AnalyzedRow = { student_id: string; student: Student; prediction: Prediction; profile?: StudentProfile };
const navItems: { label: View; icon: typeof LayoutDashboard }[] = [
  { label: "Overview", icon: LayoutDashboard }, { label: "Predict a student", icon: Target },
  { label: "Batch prediction", icon: FileUp }, { label: "Saved predictions", icon: ClipboardList },
  { label: "Model notes", icon: ChartNoAxesCombined }, { label: "About", icon: Info },
];
const riskClass: Record<string, string> = { "On track": "risk-track", "Keep an eye on": "risk-watch", "Needs support": "risk-support" };
const fieldTitle: Record<string, string> = Object.fromEntries(featureSpecs.map((field) => [field.id, field.label]));
function downloadFile(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function getAccountDisplayName(user: { user_metadata?: Record<string, unknown> } | null | undefined) {
  const name = user?.user_metadata?.["display_name"];
  return typeof name === "string" ? name.trim() : "";
}

function EduTrackApp() {
  const [view, setView] = useState<View>("Overview");
  const [menuOpen, setMenuOpen] = useState(false);
  const [studentId, setStudentId] = useState("NEW-STUDENT");
  const [student, setStudent] = useState<Student>({ ...initialStudent });
  const [attendanceAttended, setAttendanceAttended] = useState(80);
  const [attendanceHeld, setAttendanceHeld] = useState(100);
  const [subjects, setSubjects] = useState<SubjectAssessment[]>(() => initialSubjects(initialStudent));
  const [nextSubjectNumber, setNextSubjectNumber] = useState(4);
  const [profileErrors, setProfileErrors] = useState<string[]>([]);
  const [preset, setPreset] = useState("Custom entry");
  const [latest, setLatest] = useState<AnalyzedRow | null>(null);
  const [whatIf, setWhatIf] = useState<Partial<Student>>({});
  const [resultTab, setResultTab] = useState("Signals");
  const [batchRows, setBatchRows] = useState<AnalyzedRow[]>([]);
  const [batchIssues, setBatchIssues] = useState<string[]>([]);
  const [uploadName, setUploadName] = useState("");
  const [filter, setFilter] = useState("");
  const [sampleSearch, setSampleSearch] = useState("");
  const [factor, setFactor] = useState<FeatureId>("attendance");
  const [authReady, setAuthReady] = useState(false);
  const [account, setAccount] = useState<{ id: string; email: string | undefined; displayName: string } | null>(null);
  const [profileDisplayName, setProfileDisplayName] = useState("");
  const [saved, setSaved] = useState<SavedPrediction[]>([]);
  const [authMode, setAuthMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authDisplayName, setAuthDisplayName] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [aiGuidance, setAiGuidance] = useState("");
  const [aiGuidanceError, setAiGuidanceError] = useState("");
  const [aiGuidanceLoading, setAiGuidanceLoading] = useState(false);
  const requestStudentGuidance = useServerFn(generateStudentGuidance);

  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (active) {
        setAccount(data.user ? { id: data.user.id, email: data.user.email, displayName: getAccountDisplayName(data.user) } : null);
        setProfileDisplayName(getAccountDisplayName(data.user));
        setAuthReady(true);
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setAccount(session?.user ? { id: session.user.id, email: session.user.email, displayName: getAccountDisplayName(session.user) } : null);
      setProfileDisplayName(getAccountDisplayName(session?.user));
      setAuthReady(true);
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!account) { setSaved([]); return; }
    let active = true;
    void loadSavedPredictions().then((rows) => { if (active) setSaved(rows); }).catch((error: unknown) => {
      if (active) setAuthMessage(error instanceof Error ? error.message : "Could not load saved predictions.");
    });
    return () => { active = false; };
  }, [account]);

  const cohortStats = useMemo(() => {
    const mean = demoCohort.reduce((sum, row) => sum + row.final_score, 0) / demoCohort.length;
    const atRisk = demoCohort.filter((row) => row.academic_risk === 1).length;
    return { mean, atRisk, share: atRisk / demoCohort.length * 100 };
  }, []);
  const filteredSamples = useMemo(() => demoCohort.filter((row) => row.student_id.toLowerCase().includes(sampleSearch.trim().toLowerCase())).slice(0, 8), [sampleSearch]);
  const visibleSaved = saved.filter((row) => filter === "" || row.student_id.toLowerCase().includes(filter.toLowerCase()));
  const navigate = (destination: View) => { setView(destination); setMenuOpen(false); };
  const clearAssessmentResult = () => { setLatest(null); setAiGuidance(""); setAiGuidanceError(""); setProfileErrors([]); };
  const currentProfile = (): StudentProfile => ({
    attendanceAttended,
    attendanceHeld,
    study_hours: student.study_hours,
    assignment_completion: student.assignment_completion,
    previous_score: student.previous_score,
    internal_marks: student.internal_marks,
    absences: student.absences,
    subjects,
  });
  const runPrediction = () => {
    const profile = currentProfile();
    const errors = validateStudentProfile(profile);
    if (errors.length) { setProfileErrors(errors); return; }
    setProfileErrors([]); setAiGuidance(""); setAiGuidanceError("");
    const id = studentId.trim() || "UNKNOWN"; setStudentId(id);
    const normalizedStudent = profileToStudent(profile);
    setLatest({ student_id: id, student: normalizedStudent, prediction: estimateStudent(normalizedStudent), profile });
    setWhatIf({}); setResultTab("Signals");
  };
  const changeFeature = (field: FeatureId, values: number[]) => {
    const value = values[0]; if (value === undefined) return;
    setStudent((current) => ({ ...current, [field]: value })); setPreset("Custom entry"); clearAssessmentResult();
  };
  const changeAttendance = (field: "attendanceAttended" | "attendanceHeld", value: number) => {
    if (field === "attendanceAttended") setAttendanceAttended(value); else setAttendanceHeld(value);
    setPreset("Custom entry"); clearAssessmentResult();
  };
  const changeSubject = (id: string, changes: Partial<Omit<SubjectAssessment, "id">>) => {
    setSubjects((current) => current.map((subject) => subject.id === id ? { ...subject, ...changes } : subject));
    setPreset("Custom entry"); clearAssessmentResult();
  };
  const addSubject = () => {
    setSubjects((current) => [...current, { id: `subject-${nextSubjectNumber}`, name: `Subject ${nextSubjectNumber - 3}`, marks: 0, maxMarks: 100 }]);
    setNextSubjectNumber((current) => current + 1); setPreset("Custom entry"); clearAssessmentResult();
  };
  const removeSubject = (id: string) => {
    if (subjects.length <= 1) return;
    setSubjects((current) => current.filter((subject) => subject.id !== id)); setPreset("Custom entry"); clearAssessmentResult();
  };
  const choosePreset = (name: string) => {
    setPreset(name); const next = presets[name];
    if (next) {
      setStudent({ ...next }); setAttendanceAttended(next.attendance); setAttendanceHeld(100);
      setSubjects(initialSubjects(next)); clearAssessmentResult();
    }
  };
  const handleGenerateGuidance = async () => {
    if (!account) { setAiGuidanceError("Sign in before requesting AI guidance for student information."); return; }
    if (!latest?.profile) { setAiGuidanceError("Estimate the student profile again before requesting guidance."); return; }
    setAiGuidanceLoading(true); setAiGuidanceError("");
    try {
      const profile = latest.profile;
      const response = await requestStudentGuidance({
        data: {
          attendanceAttended: profile.attendanceAttended,
          attendanceHeld: profile.attendanceHeld,
          study_hours: profile.study_hours,
          assignment_completion: profile.assignment_completion,
          previous_score: profile.previous_score,
          internal_marks: profile.internal_marks,
          absences: profile.absences,
          subjects: profile.subjects.map(({ name, marks, maxMarks }) => ({ name, marks, maxMarks })),
        },
      });
      if (response.ok) setAiGuidance(response.text);
      else setAiGuidanceError(response.message);
    } catch {
      setAiGuidanceError("AI guidance could not be reached. Your profile is unchanged—please sign in again or try later.");
    } finally { setAiGuidanceLoading(false); }
  };
  const onUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    setUploadName(file.name); const result = parseStudentCsv(await file.text()); setBatchIssues(result.errors);
    setBatchRows(result.rows.map((row, index) => ({ student_id: result.studentIds[index] ?? `ROW-${String(index + 1).padStart(3, "0")}`, student: row, prediction: estimateStudent(row) })));
  };
  const handleAuth = async () => {
    setBusy(true); setAuthMessage("");
    try {
      if (authMode === "sign-up") {
        const { data, error } = await supabase.auth.signUp({ email: authEmail.trim(), password: authPassword, options: { emailRedirectTo: window.location.origin, data: { display_name: authDisplayName.trim() } } });
        if (error) throw error;
        setAuthMessage(data.session ? "Your account is ready." : "Account created. Check your email to confirm, then sign in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: authEmail.trim(), password: authPassword });
        if (error) throw error;
        setAuthMessage("Signed in. Your records are private to this account.");
      }
    } catch (error) { setAuthMessage(error instanceof Error ? error.message : "Could not complete that request."); }
    finally { setBusy(false); }
  };
  const handleUpdateProfile = async () => {
    const displayName = profileDisplayName.trim();
    if (!displayName || !account) return;
    setBusy(true); setAuthMessage("");
    try {
      const { data, error } = await supabase.auth.updateUser({ data: { display_name: displayName } });
      if (error) throw error;
      if (data.user) setAccount({ id: data.user.id, email: data.user.email, displayName: getAccountDisplayName(data.user) });
      setProfileDisplayName(displayName);
      setAuthMessage("Display name updated.");
    } catch (error) { setAuthMessage(error instanceof Error ? error.message : "Could not update the display name."); }
    finally { setBusy(false); }
  };
  const handleSignOut = async () => { await supabase.auth.signOut(); setSaved([]); setAuthMessage("Signed out."); };
  const handleSavePrediction = async () => {
    if (!latest) return;
    if (!account) { setAuthMessage("Sign in or create an account to save this prediction privately."); setView("Saved predictions"); return; }
    setBusy(true);
    try {
      await savePrediction(latest.student_id, latest.student, latest.prediction.predicted_score, latest.prediction.risk_probability);
      setSaved(await loadSavedPredictions()); setAuthMessage("Prediction saved privately to your account."); setView("Saved predictions");
    } catch (error) { setAuthMessage(error instanceof Error ? error.message : "Could not save the prediction."); }
    finally { setBusy(false); }
  };
  const handleDeletePrediction = async (id: string) => {
    try { await deleteSavedPrediction(id); setSaved(await loadSavedPredictions()); setAuthMessage("Saved prediction removed."); }
    catch (error) { setAuthMessage(error instanceof Error ? error.message : "Could not delete the prediction."); }
  };
  return <div className="app-shell">
    <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
      <div className="brand-lockup"><div className="brand-mark"><GraduationCap aria-hidden="true" /></div><div><strong>EduTrack</strong><span>STUDENT PROGRESS STUDIO</span></div><Button variant="ghost" size="icon" className="mobile-close" aria-label="Close menu" onClick={() => setMenuOpen(false)}><X /></Button></div>
      <div className="workspace-label">WORKSPACE</div><nav className="primary-nav" aria-label="Main navigation">
        {navItems.map(({ label, icon: Icon }) => <Button key={label} variant="ghost" className={`nav-item ${view === label ? "nav-active" : ""}`} onClick={() => navigate(label)}><Icon aria-hidden="true" /><span>{label}</span>{label === "Saved predictions" && <span className="nav-lock"><LockKeyhole /></span>}</Button>)}
      </nav>
      <div className="sidebar-spacer" /><div className="privacy-note"><ShieldCheck aria-hidden="true" /><p><strong>Student-first by design</strong><span>Use pseudonyms. Estimates are conversation starters, not decisions.</span></p></div>
      <div className="sidebar-foot"><span className="status-dot" /> SYNTHETIC DEMO DATA <span>v1.0</span></div>
    </aside>
    <main className="main-shell">
      <header className="topbar"><Button variant="ghost" size="icon" className="mobile-menu" aria-label="Open menu" onClick={() => setMenuOpen(true)}><Menu /></Button><div className="breadcrumb"><span>EduTrack</span><ChevronDown aria-hidden="true" /><strong>{view}</strong></div>
        <div className="topbar-right">{account ? <><span className="account-email">{account.displayName || account.email}</span><Button variant="outline" size="sm" onClick={handleSignOut}>Sign out</Button></> : <span className="demo-indicator"><span className="status-dot" />{authReady ? "SIGNED OUT" : "CONNECTING"}</span>}<div className="avatar-mark">{(account?.displayName || account?.email)?.slice(0, 2).toUpperCase() ?? "ET"}</div></div>
      </header>
      <div className="page-content">
        {view === "Overview" && <OverviewPage stats={cohortStats} factor={factor} setFactor={setFactor} samples={filteredSamples} search={sampleSearch} setSearch={setSampleSearch} onDownload={() => downloadFile("edutrack_synthetic_sample.csv", sampleDatasetToCsv(demoCohort))} onPredict={() => navigate("Predict a student")} />}
        {view === "Predict a student" && <PredictPage studentId={studentId} setStudentId={setStudentId} student={student} onFeatureChange={changeFeature} attendanceAttended={attendanceAttended} attendanceHeld={attendanceHeld} onAttendanceChange={changeAttendance} subjects={subjects} onSubjectChange={changeSubject} onAddSubject={addSubject} onRemoveSubject={removeSubject} profileErrors={profileErrors} preset={preset} onPreset={choosePreset} onPredict={runPrediction} result={latest} whatIf={whatIf} setWhatIf={setWhatIf} resultTab={resultTab} setResultTab={setResultTab} onSave={handleSavePrediction} busy={busy} canRequestGuidance={Boolean(account)} aiGuidance={aiGuidance} aiGuidanceError={aiGuidanceError} aiGuidanceLoading={aiGuidanceLoading} onGenerateGuidance={handleGenerateGuidance} />}
        {view === "Batch prediction" && <BatchPage rows={batchRows} issues={batchIssues} uploadName={uploadName} onUpload={onUpload} onDownload={() => downloadFile("edutrack_batch_predictions.csv", predictionsToCsv(batchRows))} />}
        {view === "Saved predictions" && <SavedPage rows={visibleSaved} filter={filter} setFilter={setFilter} account={account} profileDisplayName={profileDisplayName} setProfileDisplayName={setProfileDisplayName} onUpdateProfile={handleUpdateProfile} authMode={authMode} setAuthMode={setAuthMode} email={authEmail} setEmail={setAuthEmail} password={authPassword} setPassword={setAuthPassword} displayName={authDisplayName} setDisplayName={setAuthDisplayName} authMessage={authMessage} onAuth={handleAuth} onDelete={handleDeletePrediction} busy={busy} />}
        {view === "Model notes" && <ModelPage />}{view === "About" && <AboutPage />}
      </div>
    </main>
  </div>;
}

function PageHeading({ kicker, title, description, action }: { kicker: string; title: string; description: string; action?: ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow"><span />{kicker}</div><h1>{title}</h1><p>{description}</p></div>{action}</div>;
}
function Metric({ label, value, foot, accent = "green", icon: Icon }: { label: string; value: string; foot: string; accent?: string; icon: typeof Activity }) {
  return <section className={`metric-block metric-${accent}`}><div className="metric-top"><span>{label}</span><Icon aria-hidden="true" /></div><strong>{value}</strong><small>{foot}</small></section>;
}
function ScoreHistogram({ values }: { values: number[] }) {
  const bins = Array.from({ length: 10 }, (_, index) => values.filter((value) => value >= index * 10 && value < (index + 1) * 10).length), max = Math.max(...bins, 1);
  return <div className="histogram" role="img" aria-label="Histogram of synthetic final score sample">{bins.map((count, index) => <div className="histogram-column" key={index}><div className={`histogram-bar ${index < 4 ? "histogram-low" : ""}`} style={{ height: `${Math.max(2, count / max * 100)}%` }} /><span>{index * 10}</span></div>)}</div>;
}
function OverviewPage({ stats, factor, setFactor, samples, search, setSearch, onDownload, onPredict }: { stats: { mean: number; atRisk: number; share: number }; factor: FeatureId; setFactor: (value: FeatureId) => void; samples: StudentRecord[]; search: string; setSearch: (value: string) => void; onDownload: () => void; onPredict: () => void }) {
  const values = demoCohort.map((row) => row.final_score), factorRows = demoCohort.slice(0, 44);
  return <>
    <PageHeading kicker="COHORT PULSE · TERM VIEW" title="A clearer view of progress." description="Find early signals, compare the cohort, and plan the next supportive conversation." action={<Button onClick={onPredict}><Plus /> New prediction</Button>} />
    <div className="notice-band"><Sparkles aria-hidden="true" /><span><strong>Preview uses synthetic sample data.</strong> No student records or trained model files were included in the original archive.</span><Badge variant="outline">DEMO</Badge></div>
    <div className="metrics-grid"><Metric label="Sample students" value="1,500" foot="Generated demonstration cohort" icon={Users} /><Metric label="Average final score" value={`${stats.mean.toFixed(1)} / 100`} foot="Sample values only" icon={Activity} accent="blue" /><Metric label="Below pass mark" value={`${stats.atRisk}`} foot="Pass mark: 40 / 100" icon={ArrowDownRight} accent="amber" /><Metric label="Share flagged for support" value={`${stats.share.toFixed(1)}%`} foot="Synthetic sample distribution" icon={CircleAlert} accent="rose" /></div>
    <div className="dashboard-grid">
      <section className="chart-panel score-panel"><div className="panel-heading"><div><span className="panel-kicker">SCORE DISTRIBUTION</span><h2>Final-score snapshot</h2></div><span className="legend-item"><i className="legend-dot" />Demo cohort</span></div><ScoreHistogram values={values} /><div className="chart-foot"><span>Score out of 100</span><span><i className="legend-dot legend-pass" />Pass mark · 40</span></div></section>
      <section className="chart-panel cohort-panel"><div className="panel-heading"><div><span className="panel-kicker">CLASSROOM PICTURE</span><h2>Support at a glance</h2></div><span className="quiet-icon"><BookOpenCheck /></span></div><div className="support-ring-wrap"><div className="support-ring" style={{ background: `conic-gradient(var(--color-chart-1) 0 ${100 - stats.share}%, var(--color-chart-4) ${100 - stats.share}% 100%)` }}><div><strong>{(100 - stats.share).toFixed(0)}%</strong><span>above pass</span></div></div><div className="ring-legend"><span><i className="legend-dot legend-pass" />Above pass mark <strong>{demoCohort.length - stats.atRisk}</strong></span><span><i className="legend-dot legend-risk" />Below pass mark <strong>{stats.atRisk}</strong></span></div></div><div className="support-foot"><span>Sample group only</span><span>Not real student data</span></div></section>
    </div>
    <section className="chart-panel factor-panel"><div className="panel-heading factor-heading"><div><span className="panel-kicker">EXPLORE A SIGNAL</span><h2>Habits beside outcomes</h2><p>Compare one input with the synthetic final-score sample.</p></div><label className="select-wrap"><span className="sr-only">Compare by factor</span><select value={factor} onChange={(event) => setFactor(event.target.value as FeatureId)}>{featureSpecs.map((field) => <option key={field.id} value={field.id}>{field.label}</option>)}</select><ChevronDown /></label></div><div className="scatter-plot" role="img" aria-label={`Scatter plot of ${fieldTitle[factor]} compared to final score`}><div className="plot-y-label">Final score</div><div className="plot-area"><span className="plot-guide guide-40" /><span className="plot-guide guide-70" /><span className="plot-label label-40">70</span><span className="plot-label label-70">40</span>{factorRows.map((row, index) => <span key={row.student_id} className={`plot-point ${row.academic_risk ? "plot-point-risk" : ""}`} style={{ left: `${Math.min(98, Math.max(2, row[factor]))}%`, bottom: `${Math.min(98, Math.max(2, row.final_score))}%`, animationDelay: `${index % 15 * 12}ms` }} />)}</div><div className="plot-x-label">{fieldTitle[factor]}</div></div><div className="chart-foot"><span>Generated demonstration records</span><span><i className="legend-dot legend-pass" />Above 40 <i className="legend-dot legend-risk" />Below 40</span></div></section>
    <section className="records-section"><div className="section-heading"><div><span className="panel-kicker">SAMPLE RECORDS</span><h2>Recent cohort examples</h2></div><div className="records-tools"><label className="search-box"><Search /><Input aria-label="Search sample student IDs" placeholder="Find a student ID" value={search} onChange={(event) => setSearch(event.target.value)} /></label><Button variant="outline" onClick={onDownload}><Download /> Export CSV</Button></div></div><StudentTable rows={samples.map((row) => ({ id: row.student_id, score: row.final_score, attendance: row.attendance, risk: row.academic_risk ? "Needs support" : "On track" }))} /><p className="table-note"><Info /> Synthetic classroom examples demonstrate the interface; they are not migrated records.</p></section>
  </>;
}
function StudentTable({ rows }: { rows: { id: string; score: number; attendance: number; risk: string }[] }) {
  return <div className="table-scroll"><table><thead><tr><th>Student ID</th><th>Final score</th><th>Attendance</th><th>Status</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td className="student-cell"><span className="student-glyph">{row.id.slice(-2)}</span><strong>{row.id}</strong></td><td>{row.score.toFixed(1)}<span className="table-denom"> / 100</span></td><td>{row.attendance.toFixed(0)}%</td><td><span className={`risk-tag ${riskClass[row.risk] ?? "risk-watch"}`}><i />{row.risk}</span></td></tr>)}{!rows.length && <tr><td colSpan={4} className="empty-table">No matching records.</td></tr>}</tbody></table></div>;
}
function RangeControl({ field, value, onChange, compact = false }: { field: (typeof featureSpecs)[number]; value: number; onChange: (values: number[]) => void; compact?: boolean }) {
  return <div className={`range-control ${compact ? "range-compact" : ""}`}><div className="range-label"><label htmlFor={`field-${field.id}`}>{field.label}</label><span><strong>{value}</strong><small>{field.unit}</small></span></div><Slider id={`field-${field.id}`} aria-label={field.label} min={field.min} max={field.max} step={field.step} value={[value]} onValueChange={onChange} /><div className="range-minmax"><span>{field.min}</span><span>{field.max}</span></div></div>;
}
type PredictPageProps = {
  studentId: string;
  setStudentId: (value: string) => void;
  student: Student;
  onFeatureChange: (field: FeatureId, values: number[]) => void;
  attendanceAttended: number;
  attendanceHeld: number;
  onAttendanceChange: (field: "attendanceAttended" | "attendanceHeld", value: number) => void;
  subjects: SubjectAssessment[];
  onSubjectChange: (id: string, changes: Partial<Omit<SubjectAssessment, "id">>) => void;
  onAddSubject: () => void;
  onRemoveSubject: (id: string) => void;
  profileErrors: string[];
  preset: string;
  onPreset: (value: string) => void;
  onPredict: () => void;
  result: AnalyzedRow | null;
  whatIf: Partial<Student>;
  setWhatIf: (value: Partial<Student>) => void;
  resultTab: string;
  setResultTab: (value: string) => void;
  onSave: () => void;
  busy: boolean;
  canRequestGuidance: boolean;
  aiGuidance: string;
  aiGuidanceError: string;
  aiGuidanceLoading: boolean;
  onGenerateGuidance: () => void;
};
function PredictPage({ studentId, setStudentId, student, onFeatureChange, attendanceAttended, attendanceHeld, onAttendanceChange, subjects, onSubjectChange, onAddSubject, onRemoveSubject, profileErrors, preset, onPreset, onPredict, result, whatIf, setWhatIf, resultTab, setResultTab, onSave, busy, canRequestGuidance, aiGuidance, aiGuidanceError, aiGuidanceLoading, onGenerateGuidance }: PredictPageProps) {
  const predicted = result?.prediction, adjusted = result ? { ...result.student, ...whatIf } : student, simulated = estimateStudent(adjusted);
  const attendancePercent = calculateAttendancePercentage(attendanceAttended, attendanceHeld);
  const issue = result && result.student.attendance + result.student.absences * 5 < 80 ? "Attendance and absence values may be worth double-checking." : "";
  return <><PageHeading kicker="INDIVIDUAL REVIEW" title="Predict a student's progress." description="Use a pseudonym and current signals to prepare a supportive teacher conversation." /><div className="notice-band notice-amber"><Info /><span><strong>Estimate only.</strong> The original trained model was not included; this preview uses the source project's transparent scoring formula and generated sample data.</span></div>
    <div className="predict-layout"><section className="form-panel"><div className="panel-heading"><div><span className="panel-kicker">STUDENT INPUTS</span><h2>Progress signals</h2><p>Use scores and observations available for this term.</p></div><span className="step-number">01</span></div><label className="field-label" htmlFor="student-id">Student ID <span>Use a pseudonym</span></label><Input id="student-id" value={studentId} onChange={(event) => setStudentId(event.target.value)} placeholder="e.g. STU-014" /><label className="field-label preset-label" htmlFor="preset">Start from an example</label><div className="select-wrap preset-select"><select id="preset" value={preset} onChange={(event) => onPreset(event.target.value)}>{Object.keys(presets).map((item) => <option key={item}>{item}</option>)}</select><ChevronDown /></div>
      <div className="input-group-title"><span>Attendance</span><i /></div><div className="attendance-input-grid"><div><label className="field-label" htmlFor="sessions-attended">Sessions attended</label><Input id="sessions-attended" type="number" min={0} max={10000} step={1} value={attendanceAttended} onChange={(event) => onAttendanceChange("attendanceAttended", Number(event.target.value))} /></div><div><label className="field-label" htmlFor="sessions-held">Sessions held</label><Input id="sessions-held" type="number" min={1} max={10000} step={1} value={attendanceHeld} onChange={(event) => onAttendanceChange("attendanceHeld", Number(event.target.value))} /></div><p>Calculated attendance <strong>{attendancePercent.toFixed(1)}%</strong></p></div>
      <div className="input-group-title"><span>Learning habits</span><i /></div><div className="range-list">{featureSpecs.slice(1, 6).map((field) => <RangeControl key={field.id} field={field} value={student[field.id]} onChange={(values) => onFeatureChange(field.id, values)} />)}</div>
      <div className="input-group-title subject-section-title"><span>Subject marks</span><Button variant="outline" size="sm" disabled={subjects.length >= 20} onClick={onAddSubject} aria-label="Add subject"><Plus /> Add subject</Button></div>
      <div className="subject-editor-list">{subjects.map((subject) => <section className="subject-editor-row" key={subject.id}><div className="subject-name-field"><label className="field-label" htmlFor={`subject-name-${subject.id}`}>Subject</label><Input id={`subject-name-${subject.id}`} maxLength={60} value={subject.name} onChange={(event) => onSubjectChange(subject.id, { name: event.target.value })} /></div><div><label className="field-label" htmlFor={`subject-mark-${subject.id}`}>Marks</label><Input id={`subject-mark-${subject.id}`} type="number" min={0} max={100000} step={0.5} value={subject.marks} onChange={(event) => onSubjectChange(subject.id, { marks: Number(event.target.value) })} /></div><div><label className="field-label" htmlFor={`subject-max-${subject.id}`}>Maximum</label><Input id={`subject-max-${subject.id}`} type="number" min={1} max={100000} step={0.5} value={subject.maxMarks} onChange={(event) => onSubjectChange(subject.id, { maxMarks: Number(event.target.value) })} /></div><Button variant="ghost" size="icon" className="remove-subject" aria-label={`Remove ${subject.name || "subject"}`} title="Remove subject" disabled={subjects.length <= 1} onClick={() => onRemoveSubject(subject.id)}><Trash2 /></Button></section>)}</div>
      {profileErrors.map((error) => <div className="inline-alert profile-alert" role="alert" key={error}><Info />{error}</div>)}
      <div className="form-actions"><Button size="lg" onClick={onPredict}><Target /> Estimate performance</Button><span>Use pseudonyms, not real student names.</span></div></section>
      <div className="result-column">{!result || !predicted ? <section className="empty-result"><div className="empty-result-mark"><Activity /></div><span className="panel-kicker">READY WHEN YOU ARE</span><h2>One student at a time.</h2><p>Enter the current signals and run an estimate. Results include a range, risk tier, visible signals, and suggested next steps.</p><div className="empty-result-rule"><span /><i /><span /></div><div className="empty-result-note"><ShieldCheck /><span>Use this as a starting point for support, never as a decision about a student's future.</span></div></section> : <><section className="result-summary"><div className="result-title"><div><span className="panel-kicker">RESULT FOR</span><h2>{result.student_id}</h2></div><span className={`risk-tag ${riskClass[predicted.risk_level]}`}><i />{predicted.risk_level}</span></div>{issue && <p className="result-warning"><Info />{issue}</p>}<div className="score-hero"><div><span>ESTIMATED FINAL SCORE</span><strong>{predicted.predicted_score.toFixed(1)}<small>/100</small></strong><p>Likely range <b>{predicted.score_low.toFixed(0)}–{predicted.score_high.toFixed(0)}</b></p></div><ScoreDial probability={predicted.risk_probability} /></div><div className="score-facts"><div><span>COHORT STANDING</span><strong>Top {Math.max(1, 100 - predicted.percentile).toFixed(0)}%</strong></div><div><span>RISK PROBABILITY</span><strong>{(predicted.risk_probability * 100).toFixed(1)}%</strong></div><div><span>SCORE RANGE</span><strong>{predicted.score_low.toFixed(0)} – {predicted.score_high.toFixed(0)}</strong></div></div></section><section className="result-tabs-panel"><div className="result-tabs" role="tablist" aria-label="Prediction details">{["Signals", "Suggestions", "AI guidance", "What if?"].map((tab) => <Button key={tab} role="tab" aria-selected={resultTab === tab} variant="ghost" className={resultTab === tab ? "tab-active" : ""} onClick={() => setResultTab(tab)}>{tab}</Button>)}</div>{resultTab === "Signals" && <SignalPanel student={result.student} />}{resultTab === "Suggestions" && <SuggestionPanel student={result.student} prediction={predicted} />}{resultTab === "AI guidance" && <AIGuidancePanel canRequest={canRequestGuidance} text={aiGuidance} error={aiGuidanceError} loading={aiGuidanceLoading} onGenerate={onGenerateGuidance} />}{resultTab === "What if?" && <WhatIfPanel adjusted={adjusted} prediction={predicted} simulated={simulated} onChange={(field, values) => { const value = values[0]; if (value !== undefined) setWhatIf({ ...whatIf, [field]: value }); }} />}<div className="save-row"><span><LockKeyhole /> Saved records are private to your account.</span><Button variant="outline" disabled={busy} onClick={onSave}><Save />{busy ? "Saving…" : "Save prediction"}</Button></div></section></>}</div></div>
  </>;
}

function AIGuidancePanel({ canRequest, text, error, loading, onGenerate }: { canRequest: boolean; text: string; error: string; loading: boolean; onGenerate: () => void }) {
  return <div className="detail-panel ai-guidance-panel"><div className="detail-title"><div><span className="panel-kicker">PERSONALIZED SUPPORT</span><h3>AI recommendation</h3></div><Sparkles /></div><div className="ai-privacy-note"><ShieldCheck /><p>Only attendance, learning signals, subject names, and marks are sent for guidance. Student ID and name are excluded, and this response is not saved.</p></div>{text && <section className="ai-guidance-output" aria-live="polite"><h4>Recommendation and key factors</h4><p>{text}</p></section>}{error && <div className="inline-alert" role="alert"><Info />{error}</div>}{!canRequest && <p className="fine-print">Sign in from Saved predictions to request private AI guidance.</p>}<Button className="ai-guidance-button" disabled={loading || !canRequest} onClick={onGenerate}><Sparkles />{loading ? "Preparing guidance…" : text ? "Generate again" : "Generate AI guidance"}</Button><p className="fine-print">AI suggestions are starting points for teacher judgment, not diagnoses or decisions.</p></div>;
}
function ScoreDial({ probability }: { probability: number }) {
  const circumference = 2 * Math.PI * 41;
  return <div className="score-dial" role="img" aria-label={`Academic risk ${Math.round(probability * 100)} percent`}><svg viewBox="0 0 100 100" aria-hidden="true"><circle className="dial-track" cx="50" cy="50" r="41" /><circle className="dial-value" cx="50" cy="50" r="41" strokeDasharray={`${circumference * probability} ${circumference}`} /></svg><div><strong>{Math.round(probability * 100)}%</strong><span>RISK</span></div></div>;
}
function SignalPanel({ student }: { student: Student }) {
  const entries = explainStudent(student).slice(0, 6), max = Math.max(...entries.map((item) => Math.abs(item.impact)), 1);
  return <div className="detail-panel"><div className="detail-title"><div><span className="panel-kicker">ESTIMATED SIGNALS</span><h3>What moves the estimate?</h3></div><Info aria-label="Formula contributions are not causal effects." /></div><div className="impact-list">{entries.map((item) => <div className="impact-row" key={item.id}><span>{item.label}</span><div className="impact-track"><i className={item.impact >= 0 ? "impact-positive" : "impact-negative"} style={{ width: `${Math.max(3, Math.abs(item.impact) / max * 100)}%` }} /></div><strong className={item.impact >= 0 ? "impact-number-positive" : "impact-number-negative"}>{item.impact >= 0 ? "+" : "−"}{Math.abs(item.impact).toFixed(1)}</strong></div>)}</div><p className="fine-print">Relative to synthetic sample averages. The preview formula is not the missing trained model and does not establish cause and effect.</p></div>;
}
function SuggestionPanel({ student, prediction }: { student: Student; prediction: Prediction }) {
  const tips = recommendations(student, prediction);
  return <div className="detail-panel"><div className="detail-title"><div><span className="panel-kicker">SUPPORTIVE NEXT STEPS</span><h3>Ideas for a check-in</h3></div><Sparkles /></div><div className="suggestion-list">{tips.map((tip, index) => <div className="suggestion-item" key={tip}><span>{String(index + 1).padStart(2, "0")}</span><p>{tip}</p></div>)}</div><p className="fine-print">Suggestions come from visible inputs. Teacher context always comes first.</p></div>;
}
function WhatIfPanel({ adjusted, prediction, simulated, onChange }: { adjusted: Student; prediction: Prediction; simulated: Prediction; onChange: (field: FeatureId, values: number[]) => void }) {
  return <div className="detail-panel whatif-panel"><div className="detail-title"><div><span className="panel-kicker">SCENARIO EXPLORER</span><h3>Try a small change</h3></div><Activity /></div>{actionableFeatures.map((id) => { const field = featureSpecs.find((item) => item.id === id); return field ? <RangeControl key={id} field={field} value={adjusted[id]} onChange={(values) => onChange(id, values)} compact /> : null; })}<div className="scenario-results"><div><span>SIMULATED SCORE</span><strong>{simulated.predicted_score.toFixed(1)}<small> {simulated.predicted_score >= prediction.predicted_score ? "+" : ""}{(simulated.predicted_score - prediction.predicted_score).toFixed(1)}</small></strong></div><div><span>SIMULATED RISK</span><strong>{(simulated.risk_probability * 100).toFixed(1)}%<small> {((simulated.risk_probability - prediction.risk_probability) * 100).toFixed(1)} pts</small></strong></div></div><p className="fine-print">Illustrative only; a change does not guarantee an outcome.</p></div>;
}
function BatchPage({ rows, issues, uploadName, onUpload, onDownload }: { rows: AnalyzedRow[]; issues: string[]; uploadName: string; onUpload: (event: ChangeEvent<HTMLInputElement>) => void; onDownload: () => void }) {
  const counts = rows.reduce((sum, row) => ({ ...sum, [row.prediction.risk_level]: (sum[row.prediction.risk_level] ?? 0) + 1 }), {} as Record<string, number>), average = rows.length ? rows.reduce((sum, row) => sum + row.prediction.predicted_score, 0) / rows.length : 0;
  const headers = ["student_id", ...featureSpecs.map((field) => field.id)].join(","), templateRows = demoCohort.slice(0, 3).map((row) => [row.student_id, ...featureSpecs.map((field) => row[field.id])].join(","));
  return <><PageHeading kicker="CLASS REVIEW" title="Batch prediction." description="Upload a class CSV, check its columns, and export a scored working copy." action={<Button variant="outline" onClick={() => downloadFile("edutrack_template.csv", [headers, ...templateRows].join("\n"))}><Download /> Download template</Button>} /><div className="notice-band notice-amber"><Info /><span><strong>Use a pseudonymous CSV.</strong> Files are read in this browser and are not stored. Up to 5,000 rows are processed.</span><Badge variant="outline">PRIVATE</Badge></div><div className="batch-layout"><section className="upload-panel"><div className="upload-mark"><FileUp /></div><span className="panel-kicker">CLASS CSV</span><h2>Bring in a student list.</h2><p>Required headers: <code>{featureSpecs.map((field) => field.id).join(", ")}</code>. Student ID is optional.</p><label className="upload-button"><input aria-label="Upload student CSV" type="file" accept=".csv,text/csv" onChange={onUpload} /><FileUp /> Choose CSV</label>{uploadName && <p className="file-name"><ClipboardList />{uploadName}</p>}<p className="fine-print">Upload is temporary and stays in this browser session.</p></section><section className="batch-summary"><div className="panel-heading"><div><span className="panel-kicker">BATCH SUMMARY</span><h2>{rows.length ? `${rows.length} students scored` : "Waiting for a file"}</h2></div><span className="quiet-icon"><Users /></span></div><div className="batch-stats"><div><span>Average estimate</span><strong>{rows.length ? average.toFixed(1) : "—"}<small>{rows.length ? "/100" : ""}</small></strong></div><div><span>Needs support</span><strong>{rows.length ? counts["Needs support"] ?? 0 : "—"}</strong></div><div><span>Keep an eye on</span><strong>{rows.length ? counts["Keep an eye on"] ?? 0 : "—"}</strong></div></div>{rows.length > 0 && <Button onClick={onDownload}><Download /> Download results CSV</Button>}</section></div>{issues.map((issue) => <div className="inline-alert" key={issue}><Info />{issue}</div>)}{rows.length ? <section className="records-section batch-results"><div className="section-heading"><div><span className="panel-kicker">SORTED BY RISK</span><h2>Batch results</h2></div><span className="fine-print">Highest risk first</span></div><StudentTable rows={[...rows].sort((a, b) => b.prediction.risk_probability - a.prediction.risk_probability).slice(0, 25).map((row) => ({ id: row.student_id, score: row.prediction.predicted_score, attendance: row.student.attendance, risk: row.prediction.risk_level }))} /></section> : <div className="csv-columns"><h3>Template columns</h3><div>{featureSpecs.map((field) => <span key={field.id}>{field.id}</span>)}</div></div>}</>;
}
function SavedPage({ rows, filter, setFilter, account, profileDisplayName, setProfileDisplayName, onUpdateProfile, authMode, setAuthMode, email, setEmail, password, setPassword, displayName, setDisplayName, authMessage, onAuth, onDelete, busy }: { rows: SavedPrediction[]; filter: string; setFilter: (value: string) => void; account: { id: string; email: string | undefined; displayName: string } | null; profileDisplayName: string; setProfileDisplayName: (value: string) => void; onUpdateProfile: () => void; authMode: "sign-in" | "sign-up"; setAuthMode: (mode: "sign-in" | "sign-up") => void; email: string; setEmail: (value: string) => void; password: string; setPassword: (value: string) => void; displayName: string; setDisplayName: (value: string) => void; authMessage: string; onAuth: () => void; onDelete: (id: string) => void; busy: boolean }) {
  return <><PageHeading kicker="PRIVATE TEACHER WORKSPACE" title="Saved predictions." description="Records belong to the signed-in teacher and are not shared with other accounts." /><div className="notice-band notice-amber"><LockKeyhole /><span><strong>Private records need an account.</strong> No records from the original local database were supplied.</span><Badge variant="outline">CLOUD STORAGE</Badge></div>{!account ? <div className="auth-layout"><section className="auth-panel"><span className="panel-kicker">TEACHER ACCOUNT</span><h2>{authMode === "sign-in" ? "Welcome back." : "Create your account."}</h2><p>Saved student predictions are private to the account that created them.</p>{authMode === "sign-up" && <><label className="field-label" htmlFor="teacher-display-name">Display name</label><Input id="teacher-display-name" autoComplete="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></>}<label className="field-label" htmlFor="teacher-email">Email</label><Input id="teacher-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /><label className="field-label password-label" htmlFor="teacher-password">Password</label><Input id="teacher-password" type="password" autoComplete={authMode === "sign-in" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} /><Button disabled={busy || !email || password.length < 6 || (authMode === "sign-up" && !displayName.trim())} onClick={onAuth}>{busy ? "Please wait…" : authMode === "sign-in" ? "Sign in" : "Create account"}</Button>{authMessage && <p className="auth-message">{authMessage}</p>}<button className="auth-switch" type="button" onClick={() => { setAuthMode(authMode === "sign-in" ? "sign-up" : "sign-in"); }}>{authMode === "sign-in" ? "Need an account? Create one" : "Already registered? Sign in"}</button><p className="auth-foot"><LockKeyhole /> Student records are protected and account-scoped.</p></section><section className="auth-aside"><div className="empty-result-mark"><ShieldCheck /></div><h3>Private by default.</h3><p>Each teacher sees only the predictions they have saved. Use pseudonyms, and keep real student names out of this prototype.</p></section></div> : <><section className="profile-panel"><div><span className="panel-kicker">TEACHER PROFILE</span><h2>Account details</h2><p>{account.email}</p></div><div className="profile-edit"><label className="field-label" htmlFor="profile-display-name">Display name</label><Input id="profile-display-name" autoComplete="name" value={profileDisplayName} onChange={(event) => setProfileDisplayName(event.target.value)} /><Button disabled={busy || !profileDisplayName.trim() || profileDisplayName.trim() === account.displayName} onClick={onUpdateProfile}>Save name</Button></div></section><div className="saved-tools"><label className="search-box"><Search /><Input placeholder="Filter by student ID" aria-label="Filter saved predictions" value={filter} onChange={(event) => setFilter(event.target.value)} /></label><span><LockKeyhole /> Account-only access</span></div>{authMessage && <div className="inline-alert"><Info />{authMessage}</div>}{rows.length ? <StudentTable rows={rows.map((row) => ({ id: row.student_id, score: row.predicted_score, attendance: row.attendance, risk: row.risk_probability >= 0.5 ? "Needs support" : row.risk_probability >= 0.25 ? "Keep an eye on" : "On track" }))} /> : <section className="empty-saved"><div className="empty-result-mark"><LockKeyhole /></div><h2>Your records, not the classroom's.</h2><p>No saved predictions yet. Run a student estimate and choose Save prediction to keep it here.</p><small>Only your signed-in account can read or remove these records.</small></section>}{rows.length > 0 && <div className="saved-delete-list">{rows.map((row) => <div key={row.id}><span>{row.student_id} · {new Date(row.created_at).toLocaleDateString()}</span><Button variant="ghost" size="icon" aria-label={`Delete ${row.student_id}`} title={`Delete ${row.student_id}`} onClick={() => onDelete(row.id)}><Trash2 /></Button></div>)}</div>}</>}</>;
}
function ModelPage() {
  const absent = ["Trained Random Forest model files", "The original generated cohort CSV", "The test-set evaluation report"];
  return <><PageHeading kicker="TRANSPARENCY" title="What this estimate can—and cannot—say." description="The original archive included source code and tests, but no trained model, metrics report, or dataset." /><div className="model-warning"><div className="model-icon"><CircleAlert /></div><div><span className="panel-kicker">MODEL ARTIFACTS NOT INCLUDED</span><h2>Preview estimates are not the original AI model.</h2><p>Score and risk estimates use a transparent, source-derived formula with generated sample records. They are for interface demonstration and must not be used for high-stakes decisions.</p></div></div><div className="model-grid"><section className="chart-panel"><span className="panel-kicker">AVAILABLE IN THE ARCHIVE</span><h2>Source capabilities retained</h2><div className="model-list"><span><i className="model-check"><ShieldCheck /></i> Nine input signals and ranges</span><span><i className="model-check"><ShieldCheck /></i> Risk tiers: 25% and 50% thresholds</span><span><i className="model-check"><ShieldCheck /></i> Supportive, rule-based suggestions</span><span><i className="model-check"><ShieldCheck /></i> CSV validation and batch export</span><span><i className="model-check"><ShieldCheck /></i> Formula-based what-if exploration</span></div></section><section className="chart-panel"><span className="panel-kicker">NOT AVAILABLE YET</span><h2>Needs the missing source files</h2><div className="missing-list">{absent.map((item) => <span key={item}><CircleAlert />{item}</span>)}</div><p className="fine-print">Original Random Forest quality metrics cannot be reproduced or verified without those files.</p></section></div><div className="responsible-note"><ShieldCheck /><p><strong>Responsible use</strong> Predictions are estimates, not guarantees. Use teacher review and student context, obtain consent, anonymise data, and validate accuracy, calibration, and fairness before real deployment.</p></div></>;
}
function AboutPage() {
  return <><PageHeading kicker="ABOUT EDUTRACK" title="Support starts with context." description="A teacher-friendly workspace for exploring learning signals and planning early, practical support." /><div className="about-cover"><div className="about-emblem"><GraduationCap /></div><div><span className="panel-kicker">STUDENT PROGRESS STUDIO</span><h2>Better questions, earlier conversations.</h2><p>EduTrack combines attendance, study habits, assignment completion, prior scores, internal marks, and subject results into a readable estimate—not a verdict.</p></div><div className="about-stamp">BUILT FOR<br />TEACHER REVIEW</div></div><div className="about-grid"><section><span className="panel-kicker">WHAT'S INCLUDED</span><h2>Practical classroom tools</h2><p>Individual estimates, a batch CSV workflow, cohort examples, signal explanations, what-if exploration, and supportive recommendations.</p></section><section><span className="panel-kicker">USE WITH CARE</span><h2>People before predictions</h2><p>This preview uses generated demonstration values. Before real use, secure consent, use pseudonyms, validate representative data, and review fairness across student groups.</p></section></div><div className="responsible-note"><Info /><p><strong>Source archive note</strong> The original included a local SQLite implementation but no student database, trained model artifacts, or evaluation data to migrate.</p></div></>;
}
