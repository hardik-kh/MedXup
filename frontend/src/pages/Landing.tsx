import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Disclaimer } from "@/components/layout/Disclaimer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Link } from "react-router-dom";
import { useState } from "react";
import { 
  BookOpen, 
  Shield, 
  Baby, 
  FileSearch, 
  ClipboardList, 
  Cpu, 
  FileOutput,
  CheckCircle2,
  ArrowRight
} from "lucide-react";

export default function Landing() {
  const [pilotSubmitted, setPilotSubmitted] = useState(false);
  const [pilotForm, setPilotForm] = useState({
    name: "",
    email: "",
    hospital: "",
    message: ""
  });

  const handlePilotSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPilotSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-background pb-10">
      <Navbar />
      
      {/* Hero Section */}
      <section className="container py-20 md:py-28">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-4xl font-bold tracking-tight text-foreground md:text-5xl lg:text-6xl">
            MedXup
          </h1>
          <p className="mt-4 text-xl text-primary font-medium">
            Evidence-linked pediatric screening and medication safety support.
          </p>
          <p className="mt-6 text-lg text-muted-foreground leading-relaxed">
            Children with similar symptoms can require different decisions because age, physiology, and condition-specific risk modify what is safe.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/signup">
              <Button size="lg" className="gap-2">
                Try Demo
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <a href="#book-pilot">
              <Button variant="outline" size="lg">
                Book a Pilot
              </Button>
            </a>
          </div>
        </div>
      </section>

      {/* Value Proposition Cards */}
      <section className="container py-16">
        <div className="grid gap-6 md:grid-cols-3">
          <Card className="border-clinical-border">
            <CardHeader>
              <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-lg bg-secondary">
                <BookOpen className="h-6 w-6 text-primary" />
              </div>
              <CardTitle className="text-lg">Evidence-linked Guidance</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-base leading-relaxed">
                Every recommendation links to its source: peer-reviewed papers, clinical guidelines, and trusted knowledge bases. Full citations with DOI links for verification.
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="border-clinical-border">
            <CardHeader>
              <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-lg bg-secondary">
                <Shield className="h-6 w-6 text-primary" />
              </div>
              <CardTitle className="text-lg">Rule-based Reasoning</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-base leading-relaxed">
                Deterministic logic that follows clinical decision trees. No hallucinations, no unpredictable outputs. Auditable reasoning paths you can trust.
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="border-clinical-border">
            <CardHeader>
              <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-lg bg-secondary">
                <Baby className="h-6 w-6 text-primary" />
              </div>
              <CardTitle className="text-lg">Pediatric Safety Focus</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-base leading-relaxed">
                Weight-adjusted considerations, age-specific guidance, and error prevention built in. Designed for the unique complexities of pediatric medicine.
              </CardDescription>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="bg-muted/30 py-20">
        <div className="container">
          <h2 className="text-center text-3xl font-bold text-foreground">How It Works</h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-muted-foreground">
            A structured workflow from evidence to actionable clinical output.
          </p>

          <div className="mt-12 grid gap-8 md:grid-cols-4">
            {[
              { icon: FileSearch, title: "Evidence Ingestion", desc: "Guidelines and literature curated into a structured knowledge base." },
              { icon: ClipboardList, title: "Structured Intake", desc: "Clinical data captured through validated intake forms." },
              { icon: Cpu, title: "Rule-based Inference", desc: "Deterministic logic maps symptoms to guidance." },
              { icon: FileOutput, title: "Exportable Report", desc: "PDF and CSV exports with full citations." },
            ].map((step, i) => (
              <div key={i} className="relative text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                  <step.icon className="h-7 w-7 text-primary" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-foreground">{step.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{step.desc}</p>
                {i < 3 && (
                  <div className="absolute right-0 top-8 hidden h-0.5 w-8 bg-border md:block" style={{ right: "-16px" }} />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Social Proof */}
      <section className="container py-16">
        <div className="flex flex-wrap items-center justify-center gap-4">
          {[
            "Pilot-ready workflow",
            "Designed with pediatric clinicians",
            "Audit-friendly outputs"
          ].map((badge, i) => (
            <div
              key={i}
              className="flex items-center gap-2 rounded-full border border-clinical-border bg-secondary/50 px-4 py-2"
            >
              <CheckCircle2 className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-foreground">{badge}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Book a Pilot */}
      <section id="book-pilot" className="bg-muted/30 py-20">
        <div className="container">
          <div className="mx-auto max-w-xl">
            <h2 className="text-center text-3xl font-bold text-foreground">Book a Pilot</h2>
            <p className="mt-4 text-center text-muted-foreground">
              Interested in piloting MedXup at your institution? Let us know.
            </p>

            {pilotSubmitted ? (
              <Card className="mt-8 border-clinical-border">
                <CardContent className="pt-6 text-center">
                  <CheckCircle2 className="mx-auto h-12 w-12 text-primary" />
                  <p className="mt-4 text-lg font-medium text-foreground">
                    Thanks. We'll reach out within 48 hours.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Card className="mt-8 border-clinical-border">
                <CardContent className="pt-6">
                  <form onSubmit={handlePilotSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="pilot-name">Name</Label>
                      <Input
                        id="pilot-name"
                        value={pilotForm.name}
                        onChange={(e) => setPilotForm({ ...pilotForm, name: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pilot-email">Email</Label>
                      <Input
                        id="pilot-email"
                        type="email"
                        value={pilotForm.email}
                        onChange={(e) => setPilotForm({ ...pilotForm, email: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pilot-hospital">Hospital / Clinic</Label>
                      <Input
                        id="pilot-hospital"
                        value={pilotForm.hospital}
                        onChange={(e) => setPilotForm({ ...pilotForm, hospital: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pilot-message">Message</Label>
                      <Textarea
                        id="pilot-message"
                        value={pilotForm.message}
                        onChange={(e) => setPilotForm({ ...pilotForm, message: e.target.value })}
                        rows={4}
                      />
                    </div>
                    <Button type="submit" className="w-full">
                      Submit
                    </Button>
                  </form>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </section>

      <Footer />
      <Disclaimer />
    </div>
  );
}
