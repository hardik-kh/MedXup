import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Navbar } from "@/components/layout/Navbar";
import { Disclaimer } from "@/components/layout/Disclaimer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { saveDemoUser } from "@/lib/demoSession";

const roles = [
  { value: "pediatrician", label: "Pediatrician" },
  { value: "gp", label: "General Practitioner" },
  { value: "pharmacist", label: "Pharmacist" },
  { value: "nurse", label: "Nurse" },
];

const countries = [
  "United States",
  "United Kingdom",
  "Canada",
  "Australia",
  "Germany",
  "France",
  "Spain",
  "Italy",
  "Netherlands",
  "Other"
];

export default function Signup() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    role: "",
    institution: "",
    country: ""
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveDemoUser(form);
    navigate("/onboarding");
  };

  const isValid = form.fullName && form.email && form.role && form.institution && form.country;

  return (
    <div className="min-h-screen bg-background pb-10">
      <Navbar />
      
      <div className="container py-12">
        <div className="mx-auto max-w-md">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold text-foreground">Join the Demo</h1>
            <p className="mt-2 text-muted-foreground">
              Create a demo account to explore MedXup's pediatric screening workflow.
            </p>
          </div>

          <Card className="border-clinical-border">
            <CardHeader>
              <CardTitle>Doctor Sign Up</CardTitle>
              <CardDescription>
                This is a demonstration environment. No real patient data will be stored.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input
                    id="fullName"
                    value={form.fullName}
                    onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                    placeholder="Dr. Jane Smith"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Work Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="jane.smith@hospital.org"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="role">Role</Label>
                  <Select value={form.role} onValueChange={(value) => setForm({ ...form, role: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select your role" />
                    </SelectTrigger>
                    <SelectContent>
                      {roles.map((role) => (
                        <SelectItem key={role.value} value={role.value}>
                          {role.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="institution">Institution</Label>
                  <Input
                    id="institution"
                    value={form.institution}
                    onChange={(e) => setForm({ ...form, institution: e.target.value })}
                    placeholder="City Children's Hospital"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="country">Country</Label>
                  <Select value={form.country} onValueChange={(value) => setForm({ ...form, country: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select your country" />
                    </SelectTrigger>
                    <SelectContent>
                      {countries.map((country) => (
                        <SelectItem key={country} value={country}>
                          {country}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button type="submit" className="w-full" disabled={!isValid}>
                  Create Demo Account
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>

      <Disclaimer />
    </div>
  );
}
