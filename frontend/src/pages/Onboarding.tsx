import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Navbar } from "@/components/layout/Navbar";
import { Disclaimer } from "@/components/layout/Disclaimer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { saveOnboardingPreferences } from "@/lib/demoSession";
import { cn } from "@/lib/utils";

const steps = [
  { id: 1, title: "Specialty Focus" },
  { id: 2, title: "Practice Setting" },
  { id: 3, title: "Preferred Outputs" },
];

const specialties = [
  { value: "pediatrics", label: "Pediatrics" },
  { value: "family-medicine", label: "Family Medicine" },
  { value: "emergency", label: "Emergency Medicine" },
  { value: "pharmacy", label: "Pharmacy" },
];

const settings = [
  { value: "clinic", label: "Outpatient Clinic" },
  { value: "hospital", label: "Hospital / Inpatient" },
  { value: "er", label: "Emergency Room" },
];

const outputs = [
  { value: "pdf", label: "PDF Report" },
  { value: "csv", label: "CSV Export" },
  { value: "evidence", label: "Evidence Links" },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [specialty, setSpecialty] = useState("pediatrics");
  const [practiceSetting, setPracticeSetting] = useState("");
  const [preferredOutputs, setPreferredOutputs] = useState<string[]>(["pdf", "evidence"]);

  const handleOutputToggle = (value: string) => {
    setPreferredOutputs(prev =>
      prev.includes(value)
        ? prev.filter(v => v !== value)
        : [...prev, value]
    );
  };

  const handleNext = () => {
    if (currentStep < 3) {
      setCurrentStep(currentStep + 1);
    } else {
      saveOnboardingPreferences({
        specialty,
        practiceSetting,
        preferredOutputs
      });
      navigate("/screening");
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const canProceed = () => {
    if (currentStep === 1) return !!specialty;
    if (currentStep === 2) return !!practiceSetting;
    if (currentStep === 3) return preferredOutputs.length > 0;
    return false;
  };

  return (
    <div className="min-h-screen bg-background pb-10">
      <Navbar />
      
      <div className="container py-12">
        <div className="mx-auto max-w-lg">
          {/* Progress */}
          <div className="mb-8">
            <div className="flex items-center justify-between">
              {steps.map((step, i) => (
                <div key={step.id} className="flex items-center">
                  <div className="flex flex-col items-center">
                    <div
                      className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-medium transition-colors",
                        currentStep >= step.id
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background text-muted-foreground"
                      )}
                    >
                      {step.id}
                    </div>
                    <span className="mt-2 text-xs text-muted-foreground">{step.title}</span>
                  </div>
                  {i < steps.length - 1 && (
                    <div
                      className={cn(
                        "mx-4 h-0.5 w-16 transition-colors",
                        currentStep > step.id ? "bg-primary" : "bg-border"
                      )}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          <Card className="border-clinical-border">
            <CardHeader>
              <CardTitle>Tell us your workflow</CardTitle>
              <CardDescription>
                Help us tailor the demo experience to your practice.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Step 1: Specialty */}
              {currentStep === 1 && (
                <div className="space-y-4">
                  <Label className="text-base">What is your specialty focus?</Label>
                  <RadioGroup value={specialty} onValueChange={setSpecialty}>
                    {specialties.map((s) => (
                      <div key={s.value} className="flex items-center space-x-3 rounded-lg border border-border p-3 hover:bg-muted/50 transition-colors">
                        <RadioGroupItem value={s.value} id={s.value} />
                        <Label htmlFor={s.value} className="flex-1 cursor-pointer font-normal">
                          {s.label}
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>
              )}

              {/* Step 2: Practice Setting */}
              {currentStep === 2 && (
                <div className="space-y-4">
                  <Label className="text-base">What is your primary practice setting?</Label>
                  <RadioGroup value={practiceSetting} onValueChange={setPracticeSetting}>
                    {settings.map((s) => (
                      <div key={s.value} className="flex items-center space-x-3 rounded-lg border border-border p-3 hover:bg-muted/50 transition-colors">
                        <RadioGroupItem value={s.value} id={s.value} />
                        <Label htmlFor={s.value} className="flex-1 cursor-pointer font-normal">
                          {s.label}
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>
              )}

              {/* Step 3: Outputs */}
              {currentStep === 3 && (
                <div className="space-y-4">
                  <Label className="text-base">Which output formats do you prefer?</Label>
                  {outputs.map((o) => (
                    <div key={o.value} className="flex items-center space-x-3 rounded-lg border border-border p-3 hover:bg-muted/50 transition-colors">
                      <Checkbox
                        id={o.value}
                        checked={preferredOutputs.includes(o.value)}
                        onCheckedChange={() => handleOutputToggle(o.value)}
                      />
                      <Label htmlFor={o.value} className="flex-1 cursor-pointer font-normal">
                        {o.label}
                      </Label>
                    </div>
                  ))}
                </div>
              )}

              {/* Navigation */}
              <div className="mt-8 flex justify-between">
                <Button
                  variant="outline"
                  onClick={handleBack}
                  disabled={currentStep === 1}
                >
                  Back
                </Button>
                <Button onClick={handleNext} disabled={!canProceed()}>
                  {currentStep === 3 ? "Start Screening Demo" : "Next"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Disclaimer />
    </div>
  );
}
