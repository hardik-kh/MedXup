import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import jsPDF from "jspdf";
import { cn } from "@/lib/utils";
import { getDemoUser } from "@/lib/demoSession";
import {
  ChevronDown, ChevronUp, FileDown, Loader2,
  Activity, AlertTriangle, Stethoscope, Zap,
  Heart, Thermometer, Wind, Gauge
} from "lucide-react";

const FontImport = () => (
  <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&display=swap');`}</style>
);

interface PatientInput {
  name: string; age: number; sex: string;
  weight: number; height: number;
  spo2: number; temp: number; hr: number;
  bpSys: number; bpDia: number;
  symptoms: string; allergies: string;
  currentMeds: string; previousConditions: string;
  vaccinationHistory?: string;
}

interface AcademicPaper {
  // backend fields from _format_sources()
  database?: string;
  title: string;
  journal?: string;
  year?: number | string;
  authors?: string[] | string;
  doi?: string;
  doi_url?: string;
  study_type?: string;
  preview?: string;
  rerank_score?: number;
  // legacy / fallback fields
  snippet?: string;
  relevance?: string;
}

interface ClinicalReportDisplayProps {
  analysis: string;
  patient: PatientInput;
  evidence?: AcademicPaper[];
  complexityScore?: number;
  reportId?: string;
  reportReady?: boolean;
}

function getVitalStatus(type: string, value: number, age: number): "normal" | "borderline" | "critical" {
  if (type === "spo2") { if (value >= 95) return "normal"; if (value >= 90) return "borderline"; return "critical"; }
  if (type === "temp") { if (value <= 37.5) return "normal"; if (value <= 39) return "borderline"; return "critical"; }
  if (type === "hr") {
    const [lo, hi] = age < 1 ? [100,160] : age < 5 ? [80,140] : age < 12 ? [70,120] : [60,100];
    if (value >= lo && value <= hi) return "normal"; if (value >= lo-10 && value <= hi+20) return "borderline"; return "critical";
  }
  if (type === "bp") {
    const [lo, hi] = age < 1 ? [65,100] : age < 5 ? [70,110] : age < 12 ? [75,120] : [85,130];
    if (value >= lo && value <= hi) return "normal"; if (value >= lo-10 && value <= hi+15) return "borderline"; return "critical";
  }
  return "normal";
}

function getAgeNormalRange(type: string, age: number): string {
  if (type === "spo2") return "95–100%";
  if (type === "temp") return "36.1–37.5°C";
  if (type === "hr") { if (age < 1) return "100–160 bpm"; if (age < 5) return "80–140 bpm"; if (age < 12) return "70–120 bpm"; return "60–100 bpm"; }
  if (type === "bp") { if (age < 1) return "65–100 mmHg"; if (age < 5) return "70–110 mmHg"; if (age < 12) return "75–120 mmHg"; return "85–130 mmHg"; }
  return "";
}

function assessRisk(patient: PatientInput, complexityScore?: number): "Low" | "Moderate" | "High" {
  let score = 0;
  if (patient.spo2 > 0 && patient.spo2 < 90) score += 4; else if (patient.spo2 < 95) score += 2;
  if (patient.temp > 40) score += 3; else if (patient.temp > 39) score += 2; else if (patient.temp > 38.5) score += 1;
  if (patient.age < 0.25 && patient.temp > 38) score += 3;
  const lower = patient.symptoms.toLowerCase();
  if (lower.includes("seizure") || lower.includes("cyanosis")) score += 3;
  if (lower.includes("lethargy") || lower.includes("stridor")) score += 2;
  if (lower.includes("petechial") || lower.includes("purpura")) score += 3;
  // Map backend complexity score to a risk floor
  if (complexityScore !== undefined) {
    if (complexityScore >= 8) score = Math.max(score, 4);       // floor → High
    else if (complexityScore >= 7) score = Math.max(score, 4);  // 7 → High
    else if (complexityScore >= 5) score = Math.max(score, 2);  // 5-6 → at least Moderate
  }
  if (score >= 4) return "High"; if (score >= 2) return "Moderate"; return "Low";
}

// Patterns that signal end of real content — summary blurbs, reference lines, etc.
const NOISE_PATTERNS = [
  /^#{1,3}\s*(summary|references?|sources?|bibliography|note|disclaimer)/i,
  /^\*\*\s*(summary|references?|sources?|note|disclaimer)/i,
  /^(note:|disclaimer:|references?:|sources?:)/i,
  /always consult/i,
  /this (report|recommendation|information) (is|does) not (replace|substitute)/i,
];

function isNoiseLine(line: string): boolean {
  return NOISE_PATTERNS.some(p => p.test(line.trim()));
}

const REPORT_SECTION_KEYWORDS = [
  "possible conditions", "differential diagnosis", "diagnosis",
  "medication guidance", "medications", "treatment",
  "next steps", "clinical actions", "management plan",
  "red flags", "warning signs",
];

function isReportSectionHeading(line: string): boolean {
  const trimmed = line.trim();
  const markdownHeading = trimmed.match(/^(#{1,6})\s+/);

  // `###` and deeper headings are subsections (Quick view, Clinical detail,
  // or model-generated labels such as "Urgent red flags"), not boundaries
  // between the four major report sections.
  if (markdownHeading && markdownHeading[1].length > 2) return false;

  const normalized = trimmed
    .replace(/^#{1,6}\s*/, "")
    .replace(/^\d+[.)]\s*/, "")
    .replace(/\*\*/g, "")
    .replace(/:$/, "")
    .trim()
    .toLowerCase();

  const hasSectionKeyword = REPORT_SECTION_KEYWORDS.some(keyword =>
    normalized.includes(keyword)
  );
  if (!hasSectionKeyword) return false;

  // Accept both the older Markdown headings and GPT-5-mini formats such as
  // `1. **POSSIBLE CONDITIONS**`, `**MEDICATION GUIDANCE**`, or `RED FLAGS`.
  return /^#{1,6}\s+/.test(trimmed)
    || /^\d+[.)]\s+/.test(trimmed)
    || /^\*\*.+\*\*(?:\s*[:(].*)?$/.test(trimmed)
    || /^[A-Z][A-Z\s/&-]{3,}(?:\s*\([^)]*\))?:?$/.test(trimmed);
}

function normalizedHeading(line: string): string {
  return line.trim()
    .replace(/^#{1,6}\s*/, "")
    .replace(/\*\*/g, "")
    .replace(/:$/, "")
    .trim()
    .toLowerCase();
}

function extractSection(analysis: string, keywords: string[]): string {
  const lines = analysis.split("\n");
  let inSection = false;
  const collected: string[] = [];
  const detailFallback: string[] = [];
  let inClinicalDetail = false;

  for (const line of lines) {
    const isHeading = isReportSectionHeading(line);
    const matchesKeyword = keywords.some(k => line.toLowerCase().includes(k.toLowerCase()));

    if (isHeading && matchesKeyword) { inSection = true; continue; }

    // Stop at the next major report section. Subheadings remain available to
    // the full analysis, but only Quick view content belongs in the quads.
    if (isHeading && inSection) break;

    if (inSection) {
      const heading = normalizedHeading(line);
      if (heading.startsWith("quick view")) continue;
      if (heading.startsWith("clinical detail") || heading.startsWith("additional detail")) {
        inClinicalDetail = true;
        continue;
      }
      if (isNoiseLine(line)) break;
      if (inClinicalDetail) detailFallback.push(line);
      else collected.push(line);
    }
  }

  while (collected.length && !collected[collected.length - 1].trim()) collected.pop();
  while (detailFallback.length && !detailFallback[detailFallback.length - 1].trim()) detailFallback.pop();

  const quickView = collected.join("\n").trim();
  return quickView || detailFallback.join("\n").trim();
}

function sanitize(text: string): string {
  return text.replace(/[≥≧]/g,">=").replace(/[≤≦]/g,"<=").replace(/→/g,"->").replace(/±/g,"+/-")
    .replace(/×/g,"x").replace(/–/g,"-").replace(/—/g,"--")
    .replace(/[\u2018\u2019]/g,"'").replace(/[\u201c\u201d]/g,'"')
    .replace(/•/g,"-").replace(/°/g," deg").replace(/µ/g,"mcg");
}


const statusColors = {
  normal:     { bg:"rgba(16,185,129,0.08)",  border:"rgba(16,185,129,0.3)",  text:"#059669", dot:"#10b981" },
  borderline: { bg:"rgba(245,158,11,0.08)",  border:"rgba(245,158,11,0.3)",  text:"#d97706", dot:"#f59e0b" },
  critical:   { bg:"rgba(239,68,68,0.08)",   border:"rgba(239,68,68,0.3)",   text:"#dc2626", dot:"#ef4444" },
};

const riskColors = {
  Low:      { bg:"rgba(16,185,129,0.12)",  border:"rgba(16,185,129,0.4)",  text:"#059669", label:"LOW RISK" },
  Moderate: { bg:"rgba(245,158,11,0.12)",  border:"rgba(245,158,11,0.4)",  text:"#d97706", label:"MODERATE RISK" },
  High:     { bg:"rgba(239,68,68,0.12)",   border:"rgba(239,68,68,0.4)",   text:"#dc2626", label:"HIGH RISK" },
};

const quadConfig = {
  diagnosis:  { title:"Differential Diagnosis", color:"#7c3aed", tint:"rgba(124,58,237,0.06)",  border:"rgba(124,58,237,0.2)",  icon:Activity },
  medications:{ title:"Medications",             color:"#059669", tint:"rgba(5,150,105,0.06)",   border:"rgba(5,150,105,0.2)",   icon:Zap },
  nextsteps:  { title:"Next Steps",              color:"#0891b2", tint:"rgba(8,145,178,0.06)",   border:"rgba(8,145,178,0.2)",   icon:Stethoscope },
  redflags:   { title:"Red Flags",               color:"#dc2626", tint:"rgba(220,38,38,0.06)",   border:"rgba(220,38,38,0.2)",   icon:AlertTriangle },
};

function VitalCard({ label, value, type, age, icon: Icon }: { label:string; value:string; type:string; age:number; icon:React.ElementType }) {
  const [hovered, setHovered] = useState(false);
  const numVal = parseFloat(value);
  const status = getVitalStatus(type, numVal, age);
  const col = statusColors[status];
  const range = getAgeNormalRange(type, age);
  return (
    <div onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ flex:1, background:`linear-gradient(135deg, ${col.bg} 0%, rgba(255,255,255,0.6) 100%)`, border:`1.5px solid ${col.border}`, borderRadius:14, padding:"16px 20px", position:"relative", transition:"all 0.25s ease", cursor:"default", backdropFilter:"blur(12px)", WebkitBackdropFilter:"blur(12px)", boxShadow:`0 4px 20px ${col.dot}22, inset 0 1px 0 rgba(255,255,255,0.9)` }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          <div style={{ width:7, height:7, borderRadius:"50%", background:col.dot, boxShadow:`0 0 6px ${col.dot}` }} />
          <span style={{ fontSize:10.5, fontWeight:700, letterSpacing:"0.07em", color:col.text, textTransform:"uppercase" as const }}>{label}</span>
        </div>
        <Icon style={{ width:15, height:15, color:col.text, opacity:0.5 }} />
      </div>
      <span style={{ fontSize:28, fontWeight:800, color:"#0f172a", letterSpacing:"-0.03em", lineHeight:1 }}>{value}</span>
      {hovered && range && (
        <div style={{ position:"absolute", bottom:"calc(100% + 8px)", left:"50%", transform:"translateX(-50%)", background:"rgba(15,20,30,0.93)", color:"#fff", fontSize:11, padding:"6px 12px", borderRadius:8, whiteSpace:"nowrap" as const, pointerEvents:"none" as const, zIndex:10, boxShadow:"0 4px 12px rgba(0,0,0,0.2)" }}>
          Age-normal: {range}
        </div>
      )}
    </div>
  );
}

function extractDrugLines(text: string): { name: string; detail: string }[] {
  const drugs: { name: string; detail: string }[] = [];
  const lines = text.split("\n");
  let current: { name: string; detail: string } | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Detect drug name — bold text or capitalized word before colon, short line
    const boldName = trimmed.match(/^\*\*([A-Z][a-zA-Z\s()]+?)\*\*\s*[:(]/);
    const simpleName = trimmed.match(/^([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)?)\s*:/);
    if ((boldName || simpleName) && trimmed.length < 80) {
      if (current) drugs.push(current);
      current = { name: (boldName?.[1] || simpleName?.[1] || "").trim(), detail: "" };
      continue;
    }
    if (current && trimmed.startsWith("-")) {
      current.detail += (current.detail ? " · " : "") + trimmed.replace(/^-\s*/, "").replace(/^(Dose|Dosage|Route|Frequency|Indication):\s*/i, "");
    }
  }
  if (current) drugs.push(current);
  return drugs.filter(d => d.name && d.detail);
}

function GlassQuad({ configKey, content }: { configKey: keyof typeof quadConfig; content: string }) {
  const cfg = quadConfig[configKey];
  const Icon = cfg.icon;
  const drugs = configKey === "medications" ? extractDrugLines(content) : [];

  return (
    <div style={{ background:`rgba(255,255,255,0.45)`, backdropFilter:"blur(20px)", WebkitBackdropFilter:"blur(20px)", border:"1px solid rgba(255,255,255,0.65)", borderRadius:20, overflow:"hidden", boxShadow:"0 10px 30px rgba(0,0,0,0.07), inset 0 1px 0 rgba(255,255,255,0.8)", position:"relative" as const, transition:"transform 0.2s ease, box-shadow 0.2s ease" }}>
      {/* Colored top stripe */}
      <div style={{ height:3, background:`linear-gradient(90deg, ${cfg.color}, ${cfg.color}80)`, borderRadius:"18px 18px 0 0" }} />
      {/* Tint overlay */}
      <div style={{ position:"absolute" as const, inset:0, background:`linear-gradient(135deg, ${cfg.color}12 0%, transparent 50%)`, pointerEvents:"none" as const }} />
      {/* Glass shine */}
      <div style={{ position:"absolute" as const, inset:0, background:"linear-gradient(120deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.1) 50%, transparent 100%)", pointerEvents:"none" as const }} />
      {/* Header bar */}
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"14px 20px 10px", position:"relative" as const, borderBottom:`1px solid ${cfg.color}20`, background:`linear-gradient(90deg, ${cfg.color}10, transparent)` }}>
        <div style={{ width:32, height:32, borderRadius:10, background:`rgba(255,255,255,0.6)`, border:`1.5px solid ${cfg.color}40`, display:"flex", alignItems:"center", justifyContent:"center", backdropFilter:"blur(8px)", boxShadow:`0 2px 8px ${cfg.color}25` }}>
          <Icon style={{ width:16, height:16, color:cfg.color }} />
        </div>
        <span style={{ fontSize:12, fontWeight:800, letterSpacing:"0.07em", color:cfg.color, textTransform:"uppercase" as const }}>{cfg.title}</span>
      </div>
      <div style={{ padding:"14px 20px 18px" }}>
      <div style={{ position:"relative" as const, fontSize:12.5, lineHeight:1.65, color:"#1e293b" }}>
        {configKey === "medications" && drugs.length > 0 ? (
          <div style={{ display:"flex", flexDirection:"column" as const, gap:8 }}>
            {drugs.map((d, i) => (
              <div key={i} style={{ background:"rgba(255,255,255,0.6)", border:`1px solid ${cfg.color}30`, borderRadius:10, padding:"10px 14px", borderLeft:`3px solid ${cfg.color}` }}>
                <div style={{ fontWeight:700, color:"#0f172a", fontSize:13, marginBottom:3 }}>{d.name}</div>
                <div style={{ color:"#64748b", fontSize:12, lineHeight:1.5 }}>{d.detail}</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ maxHeight:280, overflowY:"auto" as const }}>
            <ReactMarkdown components={{
              p: ({ children }) => <p style={{ margin:"0 0 6px" }}>{children}</p>,
              ul: ({ children }) => <ul style={{ margin:"0 0 6px", paddingLeft:16 }}>{children}</ul>,
              li: ({ children }) => <li style={{ marginBottom:3 }}>{children}</li>,
              strong: ({ children }) => <strong style={{ color:cfg.color, fontWeight:600 }}>{children}</strong>,
            }}>{content || "*No data extracted*"}</ReactMarkdown>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

export default function ClinicalReportDisplay({ analysis, patient, evidence = [], complexityScore, reportId, reportReady = false }: ClinicalReportDisplayProps) {
  const [showFull, setShowFull] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const autoSavedReportIdRef = useRef<string | null>(null);

  // Auto-save + feedback state
  const [savedReportId, setSavedReportId] = useState<string | null>(null);
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackHover, setFeedbackHover] = useState(0);
  const [feedbackComment, setFeedbackComment] = useState("");
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackExpanded, setFeedbackExpanded] = useState(false);

  const riskLevel = assessRisk(patient, complexityScore);
  const riskCfg = riskColors[riskLevel];
  const bmi = patient.weight && patient.height ? (patient.weight / (patient.height / 100) ** 2).toFixed(1) : null;

  const diagnosisContent   = extractSection(analysis, ["condition","diagnosis","differential","possible"]);
  const medicationsContent = extractSection(analysis, ["medication","treatment","pharmacol","drug","antibiotic","paracetamol","ibuprofen","amoxicillin"]);
  const nextstepsContent   = extractSection(analysis, ["next step","follow","action","investigation","monitoring","reassess","management plan"]);
  const redflagsContent    = extractSection(analysis, ["red flag","warning","urgent","escalate"]);

  const spo2Status = getVitalStatus("spo2", patient.spo2, patient.age);
  const tempStatus = getVitalStatus("temp", patient.temp, patient.age);
  const hrStatus   = getVitalStatus("hr",   patient.hr,   patient.age);
  const bpStatus   = getVitalStatus("bp",   patient.bpSys, patient.age);

  // ── Shared PDF-build helper ────────────────────────────────────────────────
  // Returns a base64 string of the PDF (no download triggered).
  // handleExportPDF and auto-save both call this so the logic lives in one place.
  const buildPdfBase64 = useCallback(async (): Promise<string> => {
    const demoUser = getDemoUser();
    const pdf = new jsPDF("p", "mm", "a4");
    const pw = pdf.internal.pageSize.getWidth();
    const ph = pdf.internal.pageSize.getHeight();
    const ml = 16, mr = 16, cw = pw - ml - mr;
    let y = 0;
    let currentPage = 1;
    const now = new Date();
    const dateStr = now.toLocaleDateString("en-GB", { day:"2-digit", month:"long", year:"numeric" });
    const timeStr = now.toLocaleTimeString("en-GB", { hour:"2-digit", minute:"2-digit" });

    const cleanText = (text: string): string =>
      text
        .replace(/[≥≧]/g,">=").replace(/[≤≦]/g,"<=").replace(/→/g,"->")
        .replace(/±/g,"+/-").replace(/×/g,"x").replace(/–/g,"-")
        .replace(/['']/g,"'").replace(/[""]/g,'"')
        .replace(/•/g,"").replace(/µ/g,"mcg")
        .replace(/#{1,3}\s*/g,"")
        .replace(/\*\*(.+?)\*\*/g,"__BOLD__$1__ENDBOLD__")
        .replace(/\*(.+?)\*/g,"$1")
        .replace(/`(.+?)`/g,"$1")
        .replace(/^\s*-+\s*$/gm,"")
        .replace(/^\s*[-•]\s+/gm,"")
        .replace(/\(per BNF[^)]*\)/gi,"").replace(/\(per NICE[^)]*\)/gi,"")
        .replace(/\(BNF[^)]*\)/gi,"").replace(/\(BNFc[^)]*\)/gi,"")
        .replace(/\(Nelson[^)]*\)/gi,"").replace(/\(NICE[^)]*\)/gi,"")
        .replace(/\(see [^)]*\)/gi,"").replace(/\(per [^)]*guidelines[^)]*\)/gi,"")
        .replace(/\n{3,}/g,"\n\n")
        .trim();

    const addHeader = (pageNum: number) => {
      pdf.setFillColor(8,145,178); pdf.rect(0,0,pw,2.5,"F");
      pdf.setFont("helvetica","bold"); pdf.setFontSize(14); pdf.setTextColor(8,145,178);
      pdf.text("MedXup", ml, 12);
      pdf.setFont("helvetica","normal"); pdf.setFontSize(6.5); pdf.setTextColor(140,140,140);
      pdf.text("Pediatric Clinical Screening Report", ml, 17);
      pdf.text(`${dateStr}  ${timeStr}`, pw-mr, 12, { align:"right" });
      if (pageNum > 1) {
        pdf.setFont("helvetica","normal"); pdf.setFontSize(6); pdf.setTextColor(160,160,160);
        pdf.text(`Page ${pageNum}`, pw-mr, 17, { align:"right" });
      }
      const rc: Record<string,[number,number,number]> = { High:[220,38,38], Moderate:[200,100,20], Low:[22,163,74] };
      const [r,g,b] = rc[riskLevel];
      pdf.setFillColor(r,g,b); pdf.roundedRect(pw-mr-26,19,26,6,1,1,"F");
      pdf.setFont("helvetica","bold"); pdf.setFontSize(6); pdf.setTextColor(255,255,255);
      pdf.text(riskCfg.label, pw-mr-13, 22.8, { align:"center" });
      pdf.setDrawColor(220,220,220); pdf.setLineWidth(0.2); pdf.line(ml,27,pw-mr,27);
    };

    const addFooter = () => {
      pdf.setDrawColor(220,220,220); pdf.setLineWidth(0.2); pdf.line(ml,ph-9,pw-mr,ph-9);
      pdf.setFont("helvetica","normal"); pdf.setFontSize(6); pdf.setTextColor(160,160,160);
      pdf.text("Powered by MedXup  —  Clinical decision support, not a substitute for clinical judgment", ml, ph-5);
      pdf.text(`Patient: ${patient.name}  •  ${dateStr}`, pw-mr, ph-5, { align:"right" });
    };

    const measureTextHeight = (text: string, maxW: number): number => {
      const cleaned = cleanText(text);
      const lines = cleaned.split("\n").filter((l:string) => l.trim());
      const lineH = 5.2;
      let total = 0;
      for (const line of lines) {
        const isIndented = !!line.match(/^\s/);
        const trimmed = line.trim().replace(/__BOLD__|__ENDBOLD__/g,"");
        const effectiveW = isIndented ? maxW-8 : maxW-4;
        // Measuring the whole line as bold is a safe upper bound for the
        // mixed bold/normal line that is rendered below.
        pdf.setFont("helvetica","bold"); pdf.setFontSize(8.5);
        const wrapped = pdf.splitTextToSize(trimmed, effectiveW);
        const isHeader = !isIndented && trimmed.match(/^[A-Za-z].*:$/) && trimmed.length < 70;
        total += wrapped.length * lineH + (isHeader ? 3 : 1.5);
      }
      return total + 12;
    };

    const renderTextBlock = (text: string, x: number, startY: number, maxW: number, maxH?: number): number => {
      const cleaned = cleanText(text);
      const lines = cleaned.split("\n").filter((l:string) => l.trim());
      const lineH = 5.2;
      let cy = startY;
      for (const line of lines) {
        const isIndented = !!line.match(/^\s/);
        const trimmed = line.trim();
        const isHeader = !isIndented && trimmed.match(/^[A-Za-z].*:$/) && trimmed.length < 70 && !trimmed.includes("__BOLD__");
        const indent = isIndented ? 8 : 0;
        if (maxH && cy > startY + maxH) break;
        if (trimmed.includes("__BOLD__")) {
          const parts = trimmed.split(/(__BOLD__|__ENDBOLD__)/);
          let isBold = false;
          const effectiveIndent = isIndented ? indent : 4;
          const lineStart = x + effectiveIndent;
          const lineEnd = x + maxW;
          let xc = lineStart;
          let clipped = false;

          for (const part of parts) {
            if (part === "__BOLD__") { isBold = true; continue; }
            if (part === "__ENDBOLD__") { isBold = false; continue; }
            if (!part) continue;

            isBold ? pdf.setFont("helvetica","bold") : pdf.setFont("helvetica","normal");
            pdf.setFontSize(8.5); pdf.setTextColor(isBold ? 15 : 55, isBold ? 15 : 55, isBold ? 15 : 55);

            // Preserve the space between adjacent bold and normal spans.
            if (/^\s/.test(part) && xc > lineStart) xc += pdf.getTextWidth(" ");

            const tokens = part.trimStart().match(/\S+\s*/g) || [];
            for (const token of tokens) {
              const word = token.trimEnd();
              const wordWidth = pdf.getTextWidth(word);

              if (xc > lineStart && xc + wordWidth > lineEnd) {
                cy += lineH;
                xc = lineStart;
                if (maxH && cy > startY + maxH) { clipped = true; break; }
              }

              pdf.text(word, xc, cy);
              xc += wordWidth;
              if (/\s$/.test(token)) xc += pdf.getTextWidth(" ");
            }
            if (clipped) break;
          }
          if (clipped) break;
          cy += lineH + 1.5;
        } else if (isHeader) {
          pdf.setFont("helvetica","bold"); pdf.setFontSize(9); pdf.setTextColor(25,25,25);
          const wrapped = pdf.splitTextToSize(trimmed, maxW);
          for (const wl of wrapped) { pdf.text(wl, x, cy); cy += lineH; }
          cy += 3;
        } else {
          pdf.setFont("helvetica","normal"); pdf.setFontSize(8.5); pdf.setTextColor(60,60,60);
          const effectiveIndent = isIndented ? indent : 4;
          const wrapped = pdf.splitTextToSize(trimmed, maxW - effectiveIndent);
          for (const wl of wrapped) { pdf.text(wl, x+effectiveIndent, cy); cy += lineH; }
          cy += 1.5;
        }
      }
      return cy;
    };

    const renderQuadBox = (title: string, text: string, col: [number,number,number]) => {
      const [qr,qg,qb] = col;
      const padding = 6;
      const titleH = 12;
      const contentW = cw - padding*2;
      const contentH = measureTextHeight(text, contentW);
      const boxH = titleH + contentH + padding;
      if (y + boxH > ph - 14) {
        addFooter(); pdf.addPage(); addHeader(++currentPage); y = 32;
      }
      const rf = Math.round(qr + (255-qr)*0.95);
      const gf = Math.round(qg + (255-qg)*0.95);
      const bf = Math.round(qb + (255-qb)*0.95);
      pdf.setFillColor(rf,gf,bf); pdf.setDrawColor(qr,qg,qb); pdf.setLineWidth(0.4);
      pdf.roundedRect(ml, y, cw, boxH, 2, 2, "FD");
      pdf.setFont("helvetica","bold"); pdf.setFontSize(9.5); pdf.setTextColor(qr,qg,qb);
      pdf.text(title, ml+padding, y+8.5);
      pdf.setDrawColor(qr,qg,qb); pdf.setLineWidth(0.3);
      pdf.line(ml+padding, y+10.5, ml+cw-padding, y+10.5);
      renderTextBlock(text, ml+padding, y+titleH+2, contentW, boxH - titleH - padding - 4);
      y += boxH + 5;
    };

    addHeader(1); y = 32;

    pdf.setFont("helvetica","bold"); pdf.setFontSize(13); pdf.setTextColor(15,15,15);
    pdf.text(patient.name, ml, y+5);
    pdf.setFont("helvetica","normal"); pdf.setFontSize(8.5); pdf.setTextColor(80,80,80);
    pdf.text(`${patient.age} yrs  •  ${patient.sex}  •  ${patient.weight} kg  •  ${patient.height} cm${bmi ? `  •  BMI ${bmi}` : ""}`, ml, y+11);
    if (patient.symptoms) {
      pdf.setFont("helvetica","normal"); pdf.setFontSize(8); pdf.setTextColor(8,120,160);
      pdf.text(`Symptoms: ${patient.symptoms}`, ml, y+17);
    }
    pdf.setDrawColor(230,230,230); pdf.setLineWidth(0.2); pdf.line(ml,y+21,pw-mr,y+21); y += 24;

    const vw = cw/4;
    const vitals = [
      { label:"SpO2",           value:`${patient.spo2}%`,                  status:spo2Status },
      { label:"Temperature",    value:`${patient.temp}°C`,                 status:tempStatus },
      { label:"Heart Rate",     value:`${patient.hr} bpm`,                 status:hrStatus },
      { label:"Blood Pressure", value:`${patient.bpSys}/${patient.bpDia}`, status:bpStatus },
    ];
    const vRGB: Record<string,[number,number,number]> = { normal:[22,163,74], borderline:[200,120,0], critical:[220,38,38] };
    vitals.forEach((v,i) => {
      const x = ml + i*vw;
      const [vr,vg,vb] = vRGB[v.status];
      pdf.setFillColor(255,255,255); pdf.setDrawColor(vr,vg,vb); pdf.setLineWidth(0.5);
      pdf.roundedRect(x, y, vw-2, 18, 1.5, 1.5, "FD");
      pdf.setFont("helvetica","normal"); pdf.setFontSize(7); pdf.setTextColor(100,100,100);
      pdf.text(v.label, x+5, y+6);
      pdf.setFont("helvetica","bold"); pdf.setFontSize(13); pdf.setTextColor(20,20,20);
      pdf.text(v.value, x+(vw-2)/2, y+15, { align:"center" });
    });
    y += 22;

    const quadDefs = [
      { title:"Differential Diagnosis", content:diagnosisContent,  col:[100,50,200]  as [number,number,number] },
      { title:"Medications",            content:medicationsContent, col:[5,130,90]    as [number,number,number] },
      { title:"Next Steps",             content:nextstepsContent,   col:[8,120,160]   as [number,number,number] },
      { title:"Red Flags",              content:redflagsContent,    col:[200,30,30]   as [number,number,number] },
    ];
    for (const q of quadDefs) renderQuadBox(q.title, q.content, q.col);

    const sigH = 42;
    if (y + sigH > ph - 14) { addFooter(); pdf.addPage(); addHeader(++currentPage); y = ph - sigH - 14; }
    else { y = ph - sigH - 14; }

    pdf.setDrawColor(220,220,220); pdf.setLineWidth(0.2); pdf.line(ml,y,pw-mr,y); y += 6;
    pdf.setFont("helvetica","bold"); pdf.setFontSize(8); pdf.setTextColor(50,50,50);
    pdf.text("Physician Declaration", ml, y);
    y += 5;
    pdf.setFont("helvetica","normal"); pdf.setFontSize(7.5); pdf.setTextColor(120,120,120);
    const declLines = pdf.splitTextToSize("I confirm the clinical information documented is accurate. This report is a clinical decision-support tool and does not replace independent professional medical judgment.", cw*0.45);
    pdf.text(declLines, ml, y);

    const col1X = ml + cw*0.5;
    const col2X = ml + cw*0.72;
    const sigY = y - 5;
    pdf.setFont("helvetica","normal"); pdf.setFontSize(7); pdf.setTextColor(140,140,140);
    pdf.text("PHYSICIAN NAME", col1X, sigY);
    if (demoUser?.fullName) { pdf.setFont("helvetica","bold"); pdf.setFontSize(9.5); pdf.setTextColor(15,15,15); pdf.text(demoUser.fullName, col1X, sigY+8); }
    pdf.setDrawColor(150,150,150); pdf.setLineWidth(0.3); pdf.line(col1X, sigY+10, col1X+45, sigY+10);
    pdf.setFont("helvetica","normal"); pdf.setFontSize(7); pdf.setTextColor(140,140,140);
    pdf.text("SIGNATURE", col2X, sigY); pdf.line(col2X, sigY+10, col2X+40, sigY+10);
    pdf.setFont("helvetica","normal"); pdf.setFontSize(7); pdf.setTextColor(140,140,140);
    pdf.text("DATE", col1X, sigY+16);
    pdf.setFont("helvetica","normal"); pdf.setFontSize(8); pdf.setTextColor(30,30,30);
    pdf.text(dateStr, col1X, sigY+22);
    if (demoUser?.institution) {
      pdf.setFont("helvetica","normal"); pdf.setFontSize(7); pdf.setTextColor(140,140,140);
      pdf.text("CLINIC / HOSPITAL", col2X, sigY+16);
      pdf.setFont("helvetica","bold"); pdf.setFontSize(8); pdf.setTextColor(30,30,30);
      pdf.text(demoUser.institution, col2X, sigY+22);
    }

    addFooter();
    return pdf.output("datauristring").split(",")[1]; // base64 only
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis, patient, riskLevel, riskCfg, bmi,
      diagnosisContent, medicationsContent, nextstepsContent, redflagsContent,
      spo2Status, tempStatus, hrStatus, bpStatus]);

  // ── Reset feedback state whenever a new reportId arrives ────────────────
  useEffect(() => {
    if (!reportId) return;

    autoSavedReportIdRef.current = null;
    setSavedReportId(reportId);
    setFeedbackRating(0);
    setFeedbackHover(0);
    setFeedbackComment("");
    setFeedbackSubmitted(false);
    setFeedbackExpanded(false);
  }, [reportId]);

  // ── Auto-save only when the streamed report is fully ready ──────────────
  useEffect(() => {
    if (!reportId || !reportReady || !analysis.trim()) return;
    if (autoSavedReportIdRef.current === reportId) return;

    (async () => {
      try {
        const base64 = await buildPdfBase64();
        const res = await fetch("/save-report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ report_id: reportId, patient_name: patient.name, pdf_base64: base64 }),
        });
        if (!res.ok) {
          const details = await res.text();
          throw new Error(details || `save-report failed (${res.status})`);
        }
        autoSavedReportIdRef.current = reportId;
        console.log("📄 Report auto-saved:", reportId);
      } catch (e) {
        console.warn("Auto-save failed (non-critical):", e);
      }
    })();
  }, [reportId, reportReady, analysis, patient.name, buildPdfBase64]);

  // ── Feedback submit ──────────────────────────────────────────────────────
  const submitFeedback = async () => {
    if (!feedbackRating || !savedReportId) return;
    setFeedbackSubmitting(true);
    try {
      const res = await fetch("/submit-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          report_id: savedReportId,
          patient_name: patient.name,
          rating: feedbackRating,
          comment: feedbackComment,
        }),
      });
      if (!res.ok) {
        const details = await res.text();
        throw new Error(details || `submit-feedback failed (${res.status})`);
      }
      setFeedbackSubmitted(true);
    } catch (e) {
      console.warn("Feedback submit failed:", e);
    } finally {
      setFeedbackSubmitting(false);
    }
  };

  const handleExportPDF = async () => {
    setPdfLoading(true);
    try {
      const base64 = await buildPdfBase64();
      // Convert base64 back to blob and trigger download
      const byteChars = atob(base64);
      const byteNums = new Array(byteChars.length).fill(0).map((_,i) => byteChars.charCodeAt(i));
      const blob = new Blob([new Uint8Array(byteNums)], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `medxup-${patient.name.replace(/\s+/g,"-")}-${new Date().toISOString().split("T")[0]}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch(e) { console.error("PDF export failed:", e); }
    finally { setPdfLoading(false); }
  };


  return (
    <>
      <FontImport />
      <div style={{ fontFamily:"'DM Sans', sans-serif", background:"linear-gradient(180deg, #e8edf5 0%, #e8ecf2 100%)", borderRadius:20, padding:"24px 28px", minHeight:"100vh", position:"relative" as const }}>

        {/* Background blobs — give glass something to refract */}
        <div style={{ position:"absolute" as const, inset:0, overflow:"hidden", borderRadius:20, pointerEvents:"none" as const, zIndex:0 }}>
          <div style={{ position:"absolute", width:700, height:700, borderRadius:"50%", background:"radial-gradient(circle, rgba(124,58,237,0.06) 0%, transparent 70%)", top:-100, left:-100 }} />
          <div style={{ position:"absolute", width:600, height:600, borderRadius:"50%", background:"radial-gradient(circle, rgba(5,150,105,0.06) 0%, transparent 70%)", top:-50, right:0 }} />
          <div style={{ position:"absolute", width:650, height:650, borderRadius:"50%", background:"radial-gradient(circle, rgba(8,145,178,0.05) 0%, transparent 70%)", bottom:100, left:"30%" }} />
          <div style={{ position:"absolute", width:550, height:550, borderRadius:"50%", background:"radial-gradient(circle, rgba(220,38,38,0.04) 0%, transparent 70%)", bottom:0, right:50 }} />
        </div>

        {/* Content wrapper above blobs */}
        <div style={{ position:"relative" as const, zIndex:1 }}>

        {/* Header */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
          <div>
            <div style={{ display:"flex", alignItems:"baseline", gap:10 }}>
              <h1 style={{ margin:0, fontSize:22, fontWeight:800, color:"#0f172a", letterSpacing:"-0.03em" }}>{patient.name}</h1>
              <span style={{ fontSize:13, color:"#334155", fontWeight:500 }}>{patient.age} yrs · {patient.sex} · {patient.weight}kg · {patient.height}cm {bmi && `· BMI ${bmi}`}</span>
            </div>
            <p style={{ margin:"2px 0 0", fontSize:11, color:"#64748b" }}>{new Date().toLocaleString("en-GB", { dateStyle:"long", timeStyle:"short" })}</p>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ padding:"6px 14px", borderRadius:20, background:riskCfg.bg, border:`1.5px solid ${riskCfg.border}`, fontSize:11, fontWeight:700, color:riskCfg.text, letterSpacing:"0.06em", backdropFilter:"blur(8px)" }}>{riskCfg.label}</div>
            <button onClick={handleExportPDF} disabled={pdfLoading} style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 16px", borderRadius:10, border:"none", cursor:"pointer", background:"#0891b2", color:"#fff", fontSize:12, fontWeight:600, opacity:pdfLoading?0.7:1 }}>
              {pdfLoading ? <Loader2 style={{ width:14, height:14, animation:"spin 1s linear infinite" }} /> : <FileDown style={{ width:14, height:14 }} />}
              Export PDF
            </button>
          </div>
        </div>

        <div style={{ marginTop:10,marginBottom:10, display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" as const }}>
          <span style={{ fontSize:14, color:"#535f6f", fontWeight:500 }}>Symptoms:</span>
          {patient.symptoms.split(",").map(s=>s.trim()).filter(Boolean).map((s,i) => (
            <span key={i} style={{ fontSize:14, padding:"2px 8px", borderRadius:20, background:"rgba(8,145,178,0.18)", color:"#0891b2", border:"1px solid rgba(8,145,178,0.3)", fontWeight:500 }}>{s}</span>
          ))}
        </div>

        {/* Vitals Strip */}
        <div style={{ display:"flex", gap:8, marginBottom:16 }}>
          <VitalCard label="SpO2"         value={`${patient.spo2}%`}                    type="spo2" age={patient.age} icon={Wind} />
          <VitalCard label="Temperature"  value={`${patient.temp}°C`}                   type="temp" age={patient.age} icon={Thermometer} />
          <VitalCard label="Heart Rate"   value={`${patient.hr} bpm`}                   type="hr"   age={patient.age} icon={Heart} />
          <VitalCard label="Blood Pressure" value={`${patient.bpSys}/${patient.bpDia}`} type="bp"   age={patient.age} icon={Gauge} />
        </div>

        {/* 4 Quads */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gridTemplateRows:"auto auto", gap:10, marginBottom:16 }}>
          <GlassQuad configKey="diagnosis"   content={diagnosisContent} />
          <GlassQuad configKey="medications" content={medicationsContent} />
          <GlassQuad configKey="nextsteps"   content={nextstepsContent} />
          <GlassQuad configKey="redflags"    content={redflagsContent} />
        </div>

        {/* Full Analysis Collapsible */}
        <div style={{ background:"rgba(255,255,255,0.55)", backdropFilter:"blur(20px)", WebkitBackdropFilter:"blur(20px)", border:"1px solid rgba(255,255,255,0.7)", borderRadius:16, boxShadow:"0 4px 20px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.9)", overflow:"hidden" }}>
          <button onClick={() => setShowFull(!showFull)} style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 20px", background:"none", border:"none", cursor:"pointer", fontSize:13, fontWeight:600, color:"#334155" }}>
            <span style={{ display:"flex", alignItems:"center", gap:8 }}>
              <Activity style={{ width:15, height:15, color:"#64748b" }} />
              View Full Analysis — Medications Detail & Research Evidence
              {evidence.length > 0 && (
                <span style={{ fontSize:10, fontWeight:700, color:"#0891b2", background:"rgba(8,145,178,0.1)", border:"1px solid rgba(8,145,178,0.25)", borderRadius:10, padding:"2px 8px", letterSpacing:"0.04em" }}>
                  {evidence.length} paper{evidence.length > 1 ? "s" : ""}
                </span>
              )}
            </span>
            {showFull ? <ChevronUp style={{ width:16, height:16, color:"#94a3b8" }} /> : <ChevronDown style={{ width:16, height:16, color:"#94a3b8" }} />}
          </button>
          {showFull && (
            <div style={{ padding:"0 20px 20px", borderTop:"1px solid rgba(226,232,240,0.8)" }}>
              <div style={{ marginTop:16, fontSize:13, lineHeight:1.7, color:"#334155" }}>
                <ReactMarkdown components={{
                  h1: ({ children }) => <h2 style={{ fontSize:14, fontWeight:700, color:"#0f172a", margin:"16px 0 6px", borderBottom:"1px solid #e2e8f0", paddingBottom:4 }}>{children}</h2>,
                  h2: ({ children }) => <h3 style={{ fontSize:13, fontWeight:700, color:"#0891b2", margin:"14px 0 4px" }}>{children}</h3>,
                  h3: ({ children }) => <h4 style={{ fontSize:12.5, fontWeight:600, color:"#334155", margin:"10px 0 3px" }}>{children}</h4>,
                  p:  ({ children }) => <p style={{ margin:"0 0 8px" }}>{children}</p>,
                  ul: ({ children }) => <ul style={{ margin:"0 0 8px", paddingLeft:18 }}>{children}</ul>,
                  li: ({ children }) => <li style={{ marginBottom:4 }}>{children}</li>,
                  strong: ({ children }) => <strong style={{ color:"#0f172a", fontWeight:600 }}>{children}</strong>,
                  hr: () => <hr style={{ border:"none", borderTop:"1px solid #e2e8f0", margin:"12px 0" }} />,
                  table: ({ children }) => <div style={{ overflowX:"auto", margin:"12px 0" }}><table style={{ width:"100%", borderCollapse:"collapse", fontSize:12.5 }}>{children}</table></div>,
                  thead: ({ children }) => <thead style={{ background:"rgba(8,145,178,0.06)" }}>{children}</thead>,
                  th: ({ children }) => <th style={{ padding:"8px 12px", textAlign:"left", fontSize:11, fontWeight:700, color:"#0891b2", letterSpacing:"0.05em", borderBottom:"1.5px solid rgba(8,145,178,0.2)", whiteSpace:"nowrap" as const }}>{children}</th>,
                  td: ({ children }) => <td style={{ padding:"7px 12px", fontSize:12.5, color:"#334155", borderBottom:"1px solid #f1f5f9", verticalAlign:"top" as const }}>{children}</td>,
                  tr: ({ children }) => <tr style={{ transition:"background 0.15s" }}>{children}</tr>,
                }} remarkPlugins={[remarkGfm]}>{analysis}</ReactMarkdown>
              </div>
              {evidence.length > 0 && (
                <div style={{ marginTop:24 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
                    <div style={{ height:1, flex:1, background:"rgba(8,145,178,0.15)" }} />
                    <h3 style={{ fontSize:11, fontWeight:700, color:"#0891b2", letterSpacing:"0.1em", textTransform:"uppercase" as const, margin:0, whiteSpace:"nowrap" }}>
                      Research Evidence
                    </h3>
                    <div style={{ height:1, flex:1, background:"rgba(8,145,178,0.15)" }} />
                  </div>
                  <div style={{ display:"flex", flexDirection:"column" as const, gap:10 }}>
                    {evidence.map((e, i) => {
                      const doiUrl = e.doi_url || (e.doi ? `https://doi.org/${e.doi}` : null);
                      const authorsStr = Array.isArray(e.authors)
                        ? e.authors.slice(0, 3).join(", ") + (e.authors.length > 3 ? " et al." : "")
                        : e.authors || "";
                      const studyTypeLabel: Record<string, { label: string; color: string }> = {
                        systematic_review: { label: "Systematic Review", color: "#7c3aed" },
                        guideline:         { label: "Guideline",         color: "#0891b2" },
                        rct:               { label: "RCT",               color: "#059669" },
                        cohort:            { label: "Cohort Study",      color: "#d97706" },
                        case_report:       { label: "Case Report",       color: "#64748b" },
                        commentary:        { label: "Commentary",        color: "#94a3b8" },
                        other:             { label: "Study",             color: "#64748b" },
                      };
                      const st = studyTypeLabel[e.study_type || "other"] || studyTypeLabel["other"];
                      const snippet = e.preview || e.snippet || "";

                      return (
                        <div key={i} style={{
                          background:"rgba(255,255,255,0.75)",
                          border:"1px solid rgba(8,145,178,0.15)",
                          borderLeft:`3px solid ${st.color}`,
                          borderRadius:10,
                          padding:"14px 16px",
                          backdropFilter:"blur(8px)",
                          transition:"box-shadow 0.2s ease",
                        }}>
                          <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12 }}>
                            <div style={{ flex:1, minWidth:0 }}>
                              {/* Title — clickable if DOI available */}
                              {doiUrl ? (
                                <a
                                  href={doiUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    fontSize:13, fontWeight:700, color:"#0f172a", lineHeight:1.4,
                                    textDecoration:"none", display:"block", marginBottom:4,
                                  }}
                                  onMouseEnter={e2 => (e2.currentTarget.style.color = "#0891b2")}
                                  onMouseLeave={e2 => (e2.currentTarget.style.color = "#0f172a")}
                                >
                                  {e.title}
                                </a>
                              ) : (
                                <p style={{ fontSize:13, fontWeight:700, color:"#0f172a", lineHeight:1.4, margin:"0 0 4px" }}>
                                  {e.title}
                                </p>
                              )}

                              {/* Authors · Journal · Year */}
                              <p style={{ fontSize:11, color:"#94a3b8", margin:"0 0 6px", lineHeight:1.4 }}>
                                {[authorsStr, e.journal, e.year].filter(Boolean).join(" · ")}
                              </p>

                              {/* Abstract preview */}
                              {snippet && (
                                <p style={{ fontSize:12, color:"#475569", lineHeight:1.55, margin:"0 0 8px" }}>
                                  {snippet}
                                </p>
                              )}

                              {/* DOI link pill */}
                              {doiUrl && (
                                <a
                                  href={doiUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    display:"inline-flex", alignItems:"center", gap:4,
                                    fontSize:10.5, fontWeight:600, color:"#0891b2",
                                    background:"rgba(8,145,178,0.08)", border:"1px solid rgba(8,145,178,0.25)",
                                    borderRadius:6, padding:"3px 8px", textDecoration:"none",
                                    letterSpacing:"0.02em",
                                  }}
                                  onMouseEnter={e2 => { e2.currentTarget.style.background="rgba(8,145,178,0.15)"; }}
                                  onMouseLeave={e2 => { e2.currentTarget.style.background="rgba(8,145,178,0.08)"; }}
                                >
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                                  </svg>
                                  Open paper
                                </a>
                              )}
                            </div>

                            {/* Study type badge */}
                            <div style={{ flexShrink:0 }}>
                              <span style={{
                                fontSize:10, fontWeight:700, letterSpacing:"0.06em",
                                color:st.color, background:`${st.color}18`,
                                border:`1px solid ${st.color}40`,
                                borderRadius:6, padding:"3px 8px",
                                textTransform:"uppercase" as const, whiteSpace:"nowrap" as const,
                              }}>
                                {st.label}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Symptoms */}

      </div>
        </div>{/* end content wrapper */}
      <style>{`
        @keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
        .glass-quad:hover { transform: translateY(-3px); box-shadow: 0 16px 40px rgba(0,0,0,0.10), inset 0 1px 0 rgba(255,255,255,0.9) !important; }
        ::-webkit-scrollbar { width:5px; height:5px; }
        ::-webkit-scrollbar-thumb { background:rgba(0,0,0,0.12); border-radius:10px; }
        ::-webkit-scrollbar-track { background:transparent; }
      `}</style>

      {/* ── Feedback widget — fixed bottom-right ───────────────────────── */}
      <div style={{
        position: "fixed", bottom: 28, right: 28, zIndex: 9999,
        fontFamily: "'DM Sans', sans-serif",
      }}>
        {!feedbackExpanded ? (
          /* Collapsed pill */
          <button
            onClick={() => setFeedbackExpanded(true)}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "10px 18px", borderRadius: 40,
              background: feedbackSubmitted ? "rgba(5,150,105,0.92)" : "rgba(8,145,178,0.92)",
              backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
              border: "1px solid rgba(255,255,255,0.3)",
              boxShadow: "0 6px 24px rgba(0,0,0,0.18)",
              color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer",
              transition: "all 0.2s ease",
            }}
          >
            <span style={{ fontSize: 16 }}>{feedbackSubmitted ? "✓" : "★"}</span>
            {feedbackSubmitted ? `You rated ${feedbackRating}★ — update?` : "Rate this report"}
          </button>
        ) : (
          /* Expanded card */
          <div style={{
            background: "rgba(255,255,255,0.97)",
            backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
            border: "1px solid rgba(226,232,240,0.9)",
            borderRadius: 18,
            boxShadow: "0 16px 48px rgba(0,0,0,0.16), inset 0 1px 0 rgba(255,255,255,1)",
            padding: "20px 22px",
            width: 300,
          }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>
                Rate this report
              </span>
              <button
                onClick={() => setFeedbackExpanded(false)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: 16, lineHeight: 1, padding: 2 }}
              >
                ✕
              </button>
            </div>

            {/* Stars */}
            <div style={{ display: "flex", gap: 6, marginBottom: 14, justifyContent: "center" }}>
              {[1,2,3,4,5].map(star => (
                <button
                  key={star}
                  onClick={() => setFeedbackRating(star)}
                  onMouseEnter={() => setFeedbackHover(star)}
                  onMouseLeave={() => setFeedbackHover(0)}
                  style={{
                    background: "none", border: "none", cursor: "pointer", padding: 2,
                    fontSize: 30,
                    color: star <= (feedbackHover || feedbackRating) ? "#f59e0b" : "#e2e8f0",
                    transition: "color 0.15s ease, transform 0.15s ease",
                    transform: star <= (feedbackHover || feedbackRating) ? "scale(1.15)" : "scale(1)",
                    filter: star <= (feedbackHover || feedbackRating) ? "drop-shadow(0 2px 4px rgba(245,158,11,0.4))" : "none",
                  }}
                >
                  ★
                </button>
              ))}
            </div>

            {/* Rating label */}
            {(feedbackHover || feedbackRating) > 0 && (
              <p style={{ textAlign: "center", fontSize: 11, color: "#64748b", marginBottom: 10, marginTop: -6 }}>
                {["","Poor","Fair","Good","Very good","Excellent"][feedbackHover || feedbackRating]}
              </p>
            )}

            {/* Comment */}
            <textarea
              value={feedbackComment}
              onChange={e => setFeedbackComment(e.target.value)}
              placeholder="Optional comment for the team…"
              rows={3}
              style={{
                width: "100%", boxSizing: "border-box" as const,
                border: "1px solid #e2e8f0", borderRadius: 10,
                padding: "9px 12px", fontSize: 12, color: "#334155",
                resize: "none" as const, outline: "none",
                fontFamily: "'DM Sans', sans-serif",
                background: "rgba(248,250,252,0.8)",
                marginBottom: 12,
              }}
            />

            {/* Submit */}
            <button
              onClick={submitFeedback}
              disabled={!feedbackRating || feedbackSubmitting}
              style={{
                width: "100%", padding: "10px 0", borderRadius: 10, border: "none",
                background: feedbackRating ? "#0891b2" : "#e2e8f0",
                color: feedbackRating ? "#fff" : "#94a3b8",
                fontSize: 13, fontWeight: 600, cursor: feedbackRating ? "pointer" : "not-allowed",
                transition: "all 0.2s ease",
                opacity: feedbackSubmitting ? 0.7 : 1,
              }}
            >
              {feedbackSubmitting ? "Saving…" : feedbackSubmitted ? "Update feedback" : "Submit feedback"}
            </button>

            {feedbackSubmitted && (
              <p style={{ textAlign: "center", fontSize: 11, color: "#059669", marginTop: 8, marginBottom: 0 }}>
                ✓ Feedback saved — thank you!
              </p>
            )}
          </div>
        )}
      </div>
    </>
  );
}
