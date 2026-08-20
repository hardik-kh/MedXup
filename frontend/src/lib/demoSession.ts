export interface DemoUser {
  fullName: string;
  email: string;
  role: string;
  institution: string;
  country: string;
}

export interface OnboardingPreferences {
  specialty: string;
  practiceSetting: string;
  preferredOutputs: string[];
}

const DEMO_USER_KEY = "medxup_demo_user";
const ONBOARDING_KEY = "medxup_onboarding";
const SCREENING_DATA_KEY = "medxup_screening_data";
const REPORT_DATA_KEY = "medxup_report_data";

export function saveDemoUser(user: DemoUser): void {
  localStorage.setItem(DEMO_USER_KEY, JSON.stringify(user));
}

export function getDemoUser(): DemoUser | null {
  const data = localStorage.getItem(DEMO_USER_KEY);
  return data ? JSON.parse(data) : null;
}

export function saveOnboardingPreferences(prefs: OnboardingPreferences): void {
  localStorage.setItem(ONBOARDING_KEY, JSON.stringify(prefs));
}

export function getOnboardingPreferences(): OnboardingPreferences | null {
  const data = localStorage.getItem(ONBOARDING_KEY);
  return data ? JSON.parse(data) : null;
}

export function saveScreeningData(data: any): void {
  localStorage.setItem(SCREENING_DATA_KEY, JSON.stringify(data));
}

export function getScreeningData(): any | null {
  const data = localStorage.getItem(SCREENING_DATA_KEY);
  return data ? JSON.parse(data) : null;
}

export function saveReportData(data: any): void {
  localStorage.setItem(REPORT_DATA_KEY, JSON.stringify(data));
}

export function getReportData(): any | null {
  const data = localStorage.getItem(REPORT_DATA_KEY);
  return data ? JSON.parse(data) : null;
}

export function clearDemoSession(): void {
  localStorage.removeItem(DEMO_USER_KEY);
  localStorage.removeItem(ONBOARDING_KEY);
  localStorage.removeItem(SCREENING_DATA_KEY);
  localStorage.removeItem(REPORT_DATA_KEY);
}

export function hasCompletedOnboarding(): boolean {
  return getDemoUser() !== null && getOnboardingPreferences() !== null;
}
