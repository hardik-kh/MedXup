import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { getReportData } from "@/lib/demoSession";
import { exportToCSV, GeneratedReport } from "@/lib/reportGenerator";
import { cn } from "@/lib/utils";
import {
  FileDown,
  FileText,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  User,
  Activity,
  Pill,
  BookOpen,
  ClipboardList
} from "lucide-react";

export default function Report() {
  const navigate = useNavigate();
  const [report, setReport] = useState<GeneratedReport | null>(null);

  useEffect(() => {
    const data = getReportData();
    if (data) {
      setReport(data);
    }
  }, []);

  const handleExportCSV = () => {
    if (!report) return;
    const csv = exportToCSV(report);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `medxup-report-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = () => {
    // Demo: Create a simple text file as placeholder
    const content = `
MedXup Clinical Report (Demo)
Generated: ${new Date().toLocaleString()}

This is a demonstration PDF export.
In production, this would be a fully formatted PDF document with:
- Patient demographics and vitals
- Risk assessment
- Condition analysis
- Medication guidance
- Evidence citations
- Next steps checklist

For demo purposes, please refer to the on-screen report.
    `.trim();
    
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `medxup-report-demo-${new Date().toISOString().split("T")[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleNewScreening = () => {
    navigate("/screening");
  };

  if (!report) {
    return (
      <AppLayout>
        <div className="flex h-96 items-center justify-center">
          <div className="text-center">
            <p className="text-muted-foreground">No report data available.</p>
            <Button onClick={handleNewScreening} className="mt-4">
              Start Screening
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  const getRiskBadgeStyles = (level: string) => {
    switch (level) {
      case "Low":
        return "bg-risk-low/10 text-risk-low border-risk-low/20";
      case "Moderate":
        return "bg-risk-moderate/10 text-risk-moderate border-risk-moderate/20";
      case "High":
        return "bg-risk-high/10 text-risk-high border-risk-high/20";
      default:
        return "";
    }
  };

  const symptomLabels: Record<string, string> = {
    "fever-throat-ear": "Fever with sore throat/ear pain",
    "wheezing": "Wheezing/respiratory symptoms",
    "runny-nose": "Allergic rhinitis symptoms",
    "seizure-blackout": "Seizure/blackout",
    "swallowing-difficulty": "Swallowing difficulty (EOE)",
    "rash-fatigue": "Rash with fatigue/joint pain",
    "medication-risk": "Medication safety risk"
  };

  return (
    <AppLayout>
      <div className="p-8">
        <div className="mx-auto max-w-4xl">
          {/* Header */}
          <div className="mb-8 flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Clinical Report</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Generated {new Date(report.timestamp).toLocaleString()}
              </p>
            </div>
            <Badge
              variant="outline"
              className={cn("text-sm px-3 py-1 font-medium", getRiskBadgeStyles(report.riskLevel))}
            >
              {report.riskLevel} Risk
            </Badge>
          </div>

          {/* Patient Snapshot */}
          <Card className="mb-6 border-clinical-border">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <User className="h-5 w-5 text-primary" />
                Patient Snapshot
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-4 rounded-lg bg-primary/5 p-3 border border-primary/10">
                <p className="text-xs text-muted-foreground">Patient Name</p>
                <p className="text-xl font-semibold text-foreground">{report.patient.name}</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground">Age / Sex</p>
                  <p className="text-lg font-medium">{report.patient.age} years / {report.patient.sex}</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground">Weight / Height</p>
                  <p className="text-lg font-medium">{report.patient.weight} kg / {report.patient.height} cm</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground">BMI</p>
                  <p className="text-lg font-medium">{report.bmi}</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground">SpO2 / Temp</p>
                  <p className="text-lg font-medium">{report.patient.spo2}% / {report.patient.temp}°C</p>
                </div>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground">Heart Rate</p>
                  <p className="text-lg font-medium">{report.patient.hr} bpm</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground">Blood Pressure</p>
                  <p className="text-lg font-medium">{report.patient.bpSystolic}/{report.patient.bpDiastolic} mmHg</p>
                </div>
              </div>
              <div className="mt-4">
                <p className="text-xs text-muted-foreground mb-2">Presenting Symptoms</p>
                <div className="flex flex-wrap gap-2">
                  {report.patient.symptoms.map(s => (
                    <Badge key={s} variant="secondary" className="text-xs">
                      {symptomLabels[s] || s}
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Possible Conditions */}
          {report.conditions.length > 0 && (
            <Card className="mb-6 border-clinical-border">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Activity className="h-5 w-5 text-primary" />
                  Possible Conditions / Rule-outs
                </CardTitle>
              </CardHeader>
              <CardContent>
                {report.conditions.map((condition, i) => (
                  <div key={condition.id} className={cn(i > 0 && "mt-4 pt-4 border-t border-border")}>
                    <h4 className="font-medium text-foreground">{condition.name}</h4>
                    <ul className="mt-2 space-y-1">
                      {condition.possibleConditions.map((c, j) => (
                        <li key={j} className="flex items-start gap-2 text-sm text-muted-foreground">
                          <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                          {c}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Medication Guidance */}
          {report.conditions.length > 0 && (
            <Card className="mb-6 border-clinical-border">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Pill className="h-5 w-5 text-primary" />
                  Medication Guidance (Generic)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {report.conditions.map((condition, i) => (
                  <div key={condition.id} className={cn(i > 0 && "pt-6 border-t border-border")}>
                    <h4 className="font-medium text-foreground mb-3">{condition.name}</h4>
                    <div className="space-y-3">
                      <div className="rounded-lg bg-secondary/50 p-3">
                        <p className="text-xs font-medium text-muted-foreground mb-1">First-line</p>
                        <p className="text-sm">{condition.medicationGuidance.firstLine}</p>
                      </div>
                      <div className="rounded-lg bg-muted/50 p-3">
                        <p className="text-xs font-medium text-muted-foreground mb-1">Alternatives</p>
                        <p className="text-sm">{condition.medicationGuidance.alternatives}</p>
                      </div>
                      {condition.medicationGuidance.safetyFlags.length > 0 && (
                        <div className="rounded-lg border border-risk-moderate/30 bg-risk-moderate/5 p-3">
                          <p className="text-xs font-medium text-risk-moderate mb-2 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            Safety Flags
                          </p>
                          <ul className="space-y-1">
                            {condition.medicationGuidance.safetyFlags.map((flag, j) => (
                              <li key={j} className="text-sm text-muted-foreground">• {flag}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground italic">
                        {condition.medicationGuidance.dosingNote}
                      </p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Evidence from Knowledge Base */}
          {report.evidence.length > 0 && (
            <Card className="mb-6 border-clinical-border">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <BookOpen className="h-5 w-5 text-primary" />
                  Evidence from Knowledge Base
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {report.evidence.map((entry, i) => (
                  <div
                    key={entry.id}
                    className={cn(
                      "rounded-lg border border-border p-4",
                      i > 0 && ""
                    )}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <h4 className="font-medium text-foreground">
                          {entry.title || "Evidence Source"}
                        </h4>
                        {entry.year && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {entry.year}
                          </p>
                        )}
                        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                          {entry.snippet}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 flex gap-2">
                      {entry.doi ? (
                        <a
                          href={`https://doi.org/${entry.doi}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Button variant="outline" size="sm" className="gap-1">
                            <ExternalLink className="h-3 w-3" />
                            Open DOI
                          </Button>
                        </a>
                      ) : (
                        <Button variant="outline" size="sm" disabled className="gap-1">
                          <ExternalLink className="h-3 w-3" />
                          DOI Unavailable
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" className="gap-1">
                        <FileText className="h-3 w-3" />
                        View Source
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Next Steps */}
          {report.conditions.length > 0 && (
            <Card className="mb-6 border-clinical-border">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <ClipboardList className="h-5 w-5 text-primary" />
                  Next Steps
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {report.conditions.map((condition) => (
                    <div key={condition.id}>
                      <h4 className="font-medium text-foreground text-sm mb-2">{condition.name}</h4>
                      <ul className="space-y-2">
                        {condition.nextSteps.map((step, j) => (
                          <li key={j} className="flex items-start gap-2">
                            <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                            <span className="text-sm text-muted-foreground">{step}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Export Actions */}
          <Separator className="my-8" />
          
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex gap-3">
              <Button variant="outline" onClick={handleExportPDF} className="gap-2">
                <FileDown className="h-4 w-4" />
                Export PDF
              </Button>
              <Button variant="outline" onClick={handleExportCSV} className="gap-2">
                <FileDown className="h-4 w-4" />
                Export CSV
              </Button>
            </div>
            <Button onClick={handleNewScreening} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Start New Screening
            </Button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
