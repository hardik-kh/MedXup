export interface PatientData {
  name: string;
  age: number;
  sex: string;
  weight: number;
  height: number;
  spo2: number;
  temp: number;
  hr: number;
  bpSystolic: number;
  bpDiastolic: number;
  symptoms: string[];
  followUpData?: Record<string, any>;
}

export interface GeneratedReport {
  patient: PatientData;
  bmi: number;
  riskLevel: "Low" | "Moderate" | "High";
  timestamp: string;
}

export function calculateBMI(weight: number, heightCm: number): number {
  const heightM = heightCm / 100;
  return Math.round((weight / (heightM * heightM)) * 10) / 10;
}

export function assessRiskLevel(patient: PatientData): "Low" | "Moderate" | "High" {
  let riskScore = 0;

  if (patient.spo2 < 92) riskScore += 3;
  else if (patient.spo2 < 95) riskScore += 1;

  if (patient.temp > 39.5) riskScore += 2;
  else if (patient.temp > 38.5) riskScore += 1;

  if (patient.age < 1 && patient.hr > 160) riskScore += 1;
  else if (patient.age >= 1 && patient.age < 5 && patient.hr > 140) riskScore += 1;
  else if (patient.age >= 5 && patient.hr > 120) riskScore += 1;

  if (patient.symptoms.includes("seizure-blackout")) riskScore += 2;
  if (patient.symptoms.includes("medication-risk")) riskScore += 1;

  if (patient.followUpData) {
    if (patient.followUpData.erVisitHistory) riskScore += 1;
    if (patient.followUpData.severePain) riskScore += 1;
    if (patient.followUpData.foodImpaction) riskScore += 2;
  }

  if (riskScore >= 4) return "High";
  if (riskScore >= 2) return "Moderate";
  return "Low";
}

export function generateReport(patient: PatientData): GeneratedReport {
  const bmi = calculateBMI(patient.weight, patient.height);
  const riskLevel = assessRiskLevel(patient);

  return {
    patient,
    bmi,
    riskLevel,
    timestamp: new Date().toISOString(),
  };
}

export function exportToCSV(report: GeneratedReport): string {
  const rows = [
    ["Field", "Value"],
    ["Report Generated", new Date(report.timestamp).toLocaleString()],
    ["Patient Name", report.patient.name],
    ["Patient Age (years)", report.patient.age.toString()],
    ["Sex", report.patient.sex],
    ["Weight (kg)", report.patient.weight.toString()],
    ["Height (cm)", report.patient.height.toString()],
    ["BMI", report.bmi.toString()],
    ["SpO2 (%)", report.patient.spo2.toString()],
    ["Temperature (C)", report.patient.temp.toString()],
    ["Heart Rate", report.patient.hr.toString()],
    ["Blood Pressure", `${report.patient.bpSystolic}/${report.patient.bpDiastolic}`],
    ["Risk Level", report.riskLevel],
    ["Symptoms", report.patient.symptoms.join("; ")],
  ];

  return rows.map(row => row.map(cell => `"${cell}"`).join(",")).join("\n");
}