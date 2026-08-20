import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Stethoscope, User, Ruler, HeartPulse, ClipboardList, FileText, ChevronLeft, ChevronRight } from "lucide-react";
import ClinicalReportDisplay from "@/components/report/ClinicalReportDisplay";
import VoiceAssistant from "@/components/voice/VoiceAssistant";
import { cn } from "@/lib/utils";

const STEPS = [
  { id: 1, title: "Patient Info", icon: User },
  { id: 2, title: "Measurements", icon: Ruler },
  { id: 3, title: "Vitals", icon: HeartPulse },
  { id: 4, title: "Symptoms", icon: ClipboardList },
  { id: 5, title: "History", icon: FileText },
];

export default function Screening() {
  const [step, setStep] = useState(1);

  // Patient Info
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [sex, setSex] = useState("Male");

  // Measurements
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");

  // Vitals
  const [spo2, setSpo2] = useState("");
  const [temp, setTemp] = useState("");
  const [hr, setHr] = useState("");
  const [bpSys, setBpSys] = useState("");
  const [bpDia, setBpDia] = useState("");

  // Track which vital fields have been blurred (so warnings only show after leaving the field)
  const [vitalBlurred, setVitalBlurred] = useState<Record<string, boolean>>({});
  const blurVital = (field: string) => setVitalBlurred(prev => ({ ...prev, [field]: true }));

  // Symptoms
  const [symptoms, setSymptoms] = useState("");
  const [englishSymptoms, setEnglishSymptoms] = useState("");

  // History (kept for display/context but not sent to backend)
  const [allergies, setAllergies] = useState("None");
  const [currentMeds, setCurrentMeds] = useState("None");
  const [previousConditions, setPreviousConditions] = useState("None");
  const [vaccinationHistory, setVaccinationHistory] = useState("Up to date");

  // State
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState(0); // 0=idle, 1=processing, 2=searching, 3=generating
  const [spinnerFading, setSpinnerFading] = useState(false);
  const [error, setError] = useState("");
  const [analysis, setAnalysis] = useState("");
  const [researchEvidence, setResearchEvidence] = useState<any[]>([]);
  const [reportId, setReportId] = useState<string>("");
  const [reportReady, setReportReady] = useState(false);
  const [complexityScore, setComplexityScore] = useState<number | null>(null);

  const bmi =
    weight && height && parseFloat(height) > 0
      ? (parseFloat(weight) / (parseFloat(height) / 100) ** 2).toFixed(1)
      : null;

  const handleSubmit = async () => {
    setError("");
    setAnalysis("");
    setResearchEvidence([]);
    setReportReady(false);
    setComplexityScore(null);
    setLoading(true);
    setLoadingStage(1);
    const safeReportName = name
      .trim()
      .replace(/[^\p{L}\p{N}._-]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "patient";
    setReportId(`medxup-${safeReportName}-${new Date().toISOString().replace(/[:.]/g,"-").slice(0,19)}`);
    setTimeout(() => setLoadingStage(2), 2500); // after ~2.5s move to searching stage

    const fullSymptoms = [
      englishSymptoms || symptoms,
      allergies && allergies !== "None" ? `Allergies: ${allergies}` : "",
      currentMeds && currentMeds !== "None" ? `Current medications: ${currentMeds}` : "",
      previousConditions && previousConditions !== "None" ? `Previous conditions: ${previousConditions}` : "",
      vaccinationHistory && vaccinationHistory !== "Up to date" ? `Vaccination history: ${vaccinationHistory}` : "",
    ].filter(Boolean).join(". ");

    try {
      const response = await fetch('/analyze-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          age: parseFloat(age),
          sex,
          weight: weight ? parseFloat(weight) : null,
          height: height ? parseFloat(height) : null,
          spo2: spo2 ? parseFloat(spo2) : null,
          temp: temp ? parseFloat(temp) : null,
          hr: hr ? parseFloat(hr) : null,
          bp_sys: bpSys ? parseFloat(bpSys) : null,
          bp_dia: bpDia ? parseFloat(bpDia) : null,
          symptoms: fullSymptoms,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Analysis failed');
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let analysisText = "";


      let firstChunk = true;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n").filter(l => l.trim());

        for (const line of lines) {
          try {
            const msg = JSON.parse(line);
            if (msg.type === "meta") {
              const sources: any[] = msg.retrieved_sources || [];
              const research = sources.filter((s: any) => s.database === "research");
              setResearchEvidence(research);
              if (typeof msg.complexity_score === "number") {
                setComplexityScore(msg.complexity_score);
              }
            } else if (msg.type === "chunk") {
              // hide spinner on first real chunk
              if (firstChunk) {
                firstChunk = false;
                setLoadingStage(3);
                setSpinnerFading(true);
                setTimeout(() => { setLoading(false); setSpinnerFading(false); }, 500);
              }
              analysisText += msg.text;
              setAnalysis(analysisText);
            } else if (msg.type === "done") {
              setReportReady(true);
              break;
            }
          } catch {
            // ignore parse errors on incomplete chunks
          }
        }
      }

      if (analysisText.trim()) {
        setReportReady(true);
      }
    } catch (e: any) {
      setLoading(false);
      setSpinnerFading(false);
      setLoadingStage(0);
      setError(e.message || "Failed to connect to the analysis server. Make sure your backend is running.");
    } finally {
      //setLoadingStage(0);
    }
  };

  /* ---- Section renderers ---- */

  const renderPatientInfo = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Patient Name</Label>
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="age">Age (years)</Label>
          <Input
            id="age"
            type="number"
            min={0}
            max={18}
            value={age}
            onChange={(e) => {
              const val = parseInt(e.target.value);
              if (e.target.value === "" || (val >= 0 && val <= 18)) setAge(e.target.value);
            }}
            placeholder="0–18"
          />
        </div>
        <div className="space-y-2">
          <Label>Sex</Label>
          <RadioGroup value={sex} onValueChange={setSex} className="flex gap-4 pt-1">
            {["Male", "Female", "Other"].map((s) => (
              <div key={s} className="flex items-center gap-1.5">
                <RadioGroupItem value={s} id={`sex-${s}`} />
                <Label htmlFor={`sex-${s}`} className="font-normal cursor-pointer">{s}</Label>
              </div>
            ))}
          </RadioGroup>
        </div>
      </div>
    </div>
  );

  const renderMeasurements = () => (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="weight">Weight (kg)</Label>
          <Input id="weight" type="number" min={0} step={0.1} value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="e.g., 20" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="height">Height (cm)</Label>
          <Input id="height" type="number" min={0} step={0.1} value={height} onChange={(e) => setHeight(e.target.value)} placeholder="e.g., 110" />
        </div>
      </div>
      {bmi && (
        <div className="mt-4 flex items-center gap-2 rounded-md bg-primary/5 px-4 py-2.5 text-sm font-medium text-primary border border-primary/10">
          Calculated BMI: <span className="font-bold">{bmi}</span>
        </div>
      )}
    </>
  );

  // ── Vital field warnings ────────────────────────────────────────────
  const vitalWarning = (type: "temp" | "spo2" | "hr" | "bpSys" | "bpDia", raw: string): string | null => {
    const v = parseFloat(raw);
    if (!raw || isNaN(v)) return null;
    if (type === "temp") {
      if (v >= 42 && v <= 45)   return "⚠️ Extremely high — confirm this is °C, not °F (98°F = 36.7°C).";
      if (v > 45)               return "⚠️ Value above 45°C is not physiologically possible — did you mean °F?";
      if (v >= 38 && v < 42)    return null; // fever, valid
      if (v > 25 && v < 35)     return "⚠️ Unusually low — hypothermia range. Check units.";
      if (v <= 25)              return "⚠️ Value below 25°C is not compatible with life. Did you mean °F?";
    }
    if (type === "spo2") {
      if (v > 100)              return "⚠️ SpO2 cannot exceed 100%.";
      if (v < 50)               return "⚠️ Value below 50% — check if this is correct.";
    }
    if (type === "hr") {
      if (v > 300)              return "⚠️ Heart rate above 300 bpm is implausible — check entry.";
      if (v < 20)               return "⚠️ Heart rate below 20 bpm is implausible — check entry.";
    }
    if (type === "bpSys") {
      if (v > 250)              return "⚠️ Systolic BP above 250 mmHg is implausible — check entry.";
      if (v < 30)               return "⚠️ Systolic BP below 30 mmHg is implausible — check entry.";
    }
    if (type === "bpDia") {
      if (v > 180)              return "⚠️ Diastolic BP above 180 mmHg is implausible — check entry.";
      if (v < 10)               return "⚠️ Diastolic BP below 10 mmHg is implausible — check entry.";
    }
    return null;
  };

  const VitalWarn = ({ msg }: { msg: string | null }) =>
    msg ? (
      <p className="flex items-start gap-1.5 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5 mt-1 leading-snug">
        {msg}
      </p>
    ) : null;

  const renderVitals = () => (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="spo2">SpO2 (%)</Label>
          <Input id="spo2" type="number" min={0} max={100} value={spo2}
            onChange={(e) => { setSpo2(e.target.value); setShowExtremeWarning(false); }}
            onBlur={() => blurVital("spo2")}
            placeholder="e.g., 98" />
          <VitalWarn msg={vitalBlurred.spo2 ? vitalWarning("spo2", spo2) : null} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="temp">Temperature (°C)</Label>
          <Input id="temp" type="number" step={0.1} value={temp}
            onChange={(e) => { setTemp(e.target.value); setShowExtremeWarning(false); }}
            onBlur={() => blurVital("temp")}
            placeholder="e.g., 37.2" />
          <VitalWarn msg={vitalBlurred.temp ? vitalWarning("temp", temp) : null} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="hr">Heart Rate (bpm)</Label>
        <Input id="hr" type="number" value={hr}
          onChange={(e) => { setHr(e.target.value); setShowExtremeWarning(false); }}
          onBlur={() => blurVital("hr")}
          placeholder="e.g., 90" />
        <VitalWarn msg={vitalBlurred.hr ? vitalWarning("hr", hr) : null} />
      </div>
      <div className="space-y-4">
        <Label>Blood Pressure (mmHg)</Label>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="bpSys" className="text-xs text-muted-foreground">Systolic</Label>
            <Input id="bpSys" type="number" value={bpSys}
              onChange={(e) => { setBpSys(e.target.value); setShowExtremeWarning(false); }}
              onBlur={() => blurVital("bpSys")}
              placeholder="e.g., 100" />
            <VitalWarn msg={vitalBlurred.bpSys ? vitalWarning("bpSys", bpSys) : null} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="bpDia" className="text-xs text-muted-foreground">Diastolic</Label>
            <Input id="bpDia" type="number" value={bpDia}
              onChange={(e) => { setBpDia(e.target.value); setShowExtremeWarning(false); }}
              onBlur={() => blurVital("bpDia")}
              placeholder="e.g., 65" />
            <VitalWarn msg={vitalBlurred.bpDia ? vitalWarning("bpDia", bpDia) : null} />
          </div>
        </div>
      </div>
    </div>
  );

  const renderSymptoms = () => (
    <div className="space-y-4">
      <VoiceAssistant
        screeningContext={{
          age,
          sex,
          weight,
          height,
          spo2,
          temperature: temp,
          heartRate: hr,
          bloodPressure: bpSys && bpDia ? `${bpSys}/${bpDia}` : "",
        }}
        onSymptomsExtracted={(display, english) => {
          setSymptoms(display);
          setEnglishSymptoms(english);
        }}
      />
      <div className="space-y-2">
        <Label htmlFor="symptoms">Symptoms</Label>
        <Textarea
          id="symptoms"
          rows={4}
          value={symptoms}
          onChange={(e) => {
            setSymptoms(e.target.value);
            setEnglishSymptoms("");
          }}
          placeholder="Describe symptoms in any format, or use voice assistant above"
        />
        {englishSymptoms && (
          <p className="text-xs text-muted-foreground">
            ✓ Voice input captured. Clinical text will be sent in English.
          </p>
        )}
      </div>
    </div>
  );

  const renderHistory = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="allergies">Known Allergies</Label>
        <Input id="allergies" value={allergies} onChange={(e) => setAllergies(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="currentMeds">Current Medications</Label>
        <Input id="currentMeds" value={currentMeds} onChange={(e) => setCurrentMeds(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="previousConditions">Previous Medical Conditions</Label>
        <Input id="previousConditions" value={previousConditions} onChange={(e) => setPreviousConditions(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="vaccinationHistory">Vaccination History</Label>
        <Input
          id="vaccinationHistory"
          value={vaccinationHistory}
          onChange={(e) => setVaccinationHistory(e.target.value)}
          placeholder="e.g., Up to date, Missing MMR, Incomplete DPT series"
        />
      </div>
    </div>
  );

  const sectionRenderers = [renderPatientInfo, renderMeasurements, renderVitals, renderSymptoms, renderHistory];

  const getMissingFields = (s: number): string[] => {
    if (s === 2) {
      const missing: string[] = [];
      if (!weight) missing.push("Weight");
      if (!height) missing.push("Height");
      return missing;
    }
    if (s === 3) {
      const missing: string[] = [];
      if (!spo2) missing.push("SpO2");
      if (!temp) missing.push("Temperature");
      if (!hr) missing.push("Heart Rate");
      if (!bpSys) missing.push("BP Systolic");
      if (!bpDia) missing.push("BP Diastolic");
      return missing;
    }
    return [];
  };

  const [showValidation, setShowValidation] = useState(false);
  const [showExtremeWarning, setShowExtremeWarning] = useState(false);
  const missingFields = getMissingFields(step);
  const canProceed = missingFields.length === 0;

  // On Next, force-blur all vitals so warnings become visible, then check for extremes
  const getExtremeVitalWarnings = (): string[] => {
    const checks: Array<{ type: "temp" | "spo2" | "hr" | "bpSys" | "bpDia"; value: string }> = [
      { type: "spo2",  value: spo2  },
      { type: "temp",  value: temp  },
      { type: "hr",    value: hr    },
      { type: "bpSys", value: bpSys },
      { type: "bpDia", value: bpDia },
    ];
    return checks
      .map(c => vitalWarning(c.type, c.value))
      .filter((w): w is string => w !== null);
  };

  const handleNext = () => {
    if ((step === 2 || step === 3) && !canProceed) {
      setShowValidation(true);
      return;
    }
    // On vitals step, force-show all warnings; block on first click, allow on second (confirmed)
    if (step === 3) {
      setVitalBlurred({ spo2: true, temp: true, hr: true, bpSys: true, bpDia: true });
      const extremes = getExtremeVitalWarnings();
      if (extremes.length > 0 && !showExtremeWarning) {
        setShowExtremeWarning(true);
        return;
      }
    }
    setShowValidation(false);
    setShowExtremeWarning(false);
    setStep(step + 1);
  };

  const STAGES = [
    "Processing patient data",
    "Searching clinical database",
    "Generating report",
  ];

  const loadingBlock = loading && loadingStage > 0 ? (
    <div style={{
      fontFamily: "'DM Sans', sans-serif",
      padding: "64px 24px",
      display: "flex", flexDirection: "column" as const,
      alignItems: "center", justifyContent: "center", gap: 16,
      animation: spinnerFading ? "medxup-fadeout 0.5s ease forwards" : "medxup-fadein 0.4s ease",
      pointerEvents: "none" as const,
    }}>
      <svg width="72" height="72" viewBox="0 0 56 56">
        {/* Track */}
        <circle cx="28" cy="28" r="22" fill="none" stroke="rgba(8,145,178,0.12)" strokeWidth="2.5" />
        {/* Spinning arc — rotate the whole group so arc travels around the circle */}
        <g style={{ animation: "medxup-spin 1.4s linear infinite", transformOrigin: "28px 28px" }}>
          <circle cx="28" cy="28" r="22" fill="none" stroke="#0891b2" strokeWidth="2.5"
            strokeDasharray="38 100" strokeLinecap="round"
            strokeDashoffset="0"
            transform="rotate(-90 28 28)" />
        </g>
        {/* MX monogram — static */}
        <text x="28" y="33" textAnchor="middle" fontSize="12" fontWeight="500" fill="#0891b2" fontFamily="DM Sans, sans-serif">MX</text>
      </svg>
      <span style={{
        fontSize: 11, color: "#94a3b8", letterSpacing: "0.08em",
        textTransform: "uppercase" as const,
        transition: "opacity 0.3s ease",
      }}>
        {STAGES[(loadingStage - 1) % STAGES.length]}
      </span>
      <style>{`
        @keyframes medxup-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes medxup-fadein { from { opacity: 0; } to { opacity: 1; } }
        @keyframes medxup-fadeout { from { opacity: 1; } to { opacity: 0; } }
      `}</style>
    </div>
  ) : null;

  const reportBlock = (
    <>
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <strong>Error:</strong> {error}
        </div>
      )}
      {analysis && (
        <ClinicalReportDisplay
          analysis={analysis}
          patient={{
            name,
            age: parseFloat(age) || 0,
            sex,
            weight: parseFloat(weight) || 0,
            height: parseFloat(height) || 0,
            spo2: parseFloat(spo2) || 0,
            temp: parseFloat(temp) || 0,
            hr: parseFloat(hr) || 0,
            bpSys: parseFloat(bpSys) || 0,
            bpDia: parseFloat(bpDia) || 0,
            symptoms,
            allergies,
            currentMeds,
            previousConditions,
            vaccinationHistory,
          }}
          evidence={researchEvidence}
          complexityScore={complexityScore ?? undefined}
          reportId={reportId}
          reportReady={reportReady}
        />
      )}
    </>
  );

  const currentStepData = STEPS[step - 1];
  const Icon = currentStepData.icon;

  return (
    <AppLayout>
      <div className="p-4 md:p-10">
        <div className="mx-auto max-w-2xl space-y-6">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Stethoscope className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-foreground">Pediatric Patient Screening</h1>
              <p className="text-xs md:text-sm text-muted-foreground">Step {step} of {STEPS.length} — {currentStepData.title}</p>
            </div>
          </div>

          {/* Step progress bar */}
          <div className="flex items-center justify-center gap-2">
            {STEPS.map((s) => (
              <button
                key={s.id}
                onClick={() => setStep(s.id)}
                className={cn(
                  "h-2 rounded-full transition-all",
                  s.id === step ? "w-10 bg-primary" : s.id < step ? "w-3 bg-primary/60" : "w-3 bg-border"
                )}
              />
            ))}
          </div>

          {/* Current section */}
          <Card className="border-clinical-border shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-lg text-primary">
                <Icon className="h-4 w-4" />
                {currentStepData.title}
              </CardTitle>
            </CardHeader>
            <CardContent>{sectionRenderers[step - 1]()}</CardContent>
            {showValidation && missingFields.length > 0 && (
              <div className="px-6 pb-4">
                <p className="text-sm text-destructive font-medium">
                  Required: {missingFields.join(", ")}
                </p>
              </div>
            )}
            {showExtremeWarning && step === 3 && (
              <div className="px-6 pb-4 space-y-1">
                {getExtremeVitalWarnings().map((msg, i) => (
                  <p key={i} className="flex items-start gap-1.5 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5 leading-snug">
                    {msg}
                  </p>
                ))}
                <p className="text-xs text-muted-foreground pt-1">
                  Please correct the values above, or click <strong>Next</strong> again to proceed anyway.
                </p>
              </div>
            )}
          </Card>

          {/* Navigation */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setStep(step - 1)}
              disabled={step === 1}
              className="flex-1 h-12"
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Back
            </Button>

            {step < STEPS.length ? (
              <Button onClick={handleNext} className="flex-1 h-12">
                Next
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={loading}
                className="flex-1 h-12 font-semibold"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Analyzing…
                  </>
                ) : (
                  "Generate Clinical Report"
                )}
              </Button>
            )}
          </div>

        </div>
      </div>

      {/* Report — full width outside the max-w-2xl constraint */}
      <div className="px-4 md:px-10 pb-12">
        {loadingBlock}
        {analysis && (
          <div style={{ animation: "medxup-fadein 0.6s ease" }}>
            {reportBlock}
          </div>
        )}
        {!loading && !analysis && reportBlock}
        <style>{`@keyframes medxup-fadein { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      </div>
    </AppLayout>
  );
}
