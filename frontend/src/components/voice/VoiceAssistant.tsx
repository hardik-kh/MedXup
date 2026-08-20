import { useState, useRef, useEffect } from "react";
import { Mic, MicOff, Volume2, Loader2, X, CheckCircle, ChevronDown } from "lucide-react";
import GB from "country-flag-icons/react/3x2/GB";
import DE from "country-flag-icons/react/3x2/DE";
import FR from "country-flag-icons/react/3x2/FR";
import IT from "country-flag-icons/react/3x2/IT";
import RU from "country-flag-icons/react/3x2/RU";
import ES from "country-flag-icons/react/3x2/ES";
import PL from "country-flag-icons/react/3x2/PL";
import NL from "country-flag-icons/react/3x2/NL";

const LANGUAGES = [
  { code: "en-GB", label: "English",    name: "English",    Flag: GB },
  { code: "de-DE", label: "Deutsch",    name: "German",     Flag: DE },
  { code: "fr-FR", label: "Français",   name: "French",     Flag: FR },
  { code: "it-IT", label: "Italiano",   name: "Italian",    Flag: IT },
  { code: "ru-RU", label: "Русский",    name: "Russian",    Flag: RU },
  { code: "es-ES", label: "Español",    name: "Spanish",    Flag: ES },
  { code: "pl-PL", label: "Polski",     name: "Polish",     Flag: PL },
  { code: "nl-NL", label: "Nederlands", name: "Dutch",      Flag: NL },
];

type Phase = "idle" | "listening" | "thinking" | "questioning" | "done";
interface Message { role: "user" | "assistant"; text: string; }
interface ScreeningContext {
  age?: string;
  sex?: string;
  weight?: string;
  height?: string;
  spo2?: string;
  temperature?: string;
  heartRate?: string;
  bloodPressure?: string;
}
interface VoiceAssistantProps {
  onSymptomsExtracted: (displayText: string, englishText: string) => void;
  screeningContext?: ScreeningContext;
}
interface CompletedSymptoms { done: true; display_symptoms: string; english_symptoms: string; }

const COMPLETION_ACKNOWLEDGEMENTS: Record<string, string> = {
  "en-GB": "Got it. Your symptoms have been captured.",
  "de-DE": "Verstanden. Ihre Symptome wurden erfasst.",
  "fr-FR": "C'est noté. Vos symptômes ont été enregistrés.",
  "it-IT": "Ricevuto. I sintomi sono stati registrati.",
  "ru-RU": "Понятно. Ваши симптомы записаны.",
  "es-ES": "Entendido. Sus síntomas han sido registrados.",
  "pl-PL": "Rozumiem. Objawy zostały zapisane.",
  "nl-NL": "Begrepen. Uw symptomen zijn vastgelegd.",
};

const OTHER_SYMPTOMS_QUESTIONS: Record<string, string> = {
  "en-GB": "Are there any other symptoms?",
  "de-DE": "Gibt es weitere Symptome?",
  "fr-FR": "Y a-t-il d'autres symptômes ?",
  "it-IT": "Ci sono altri sintomi?",
  "ru-RU": "Есть ли другие симптомы?",
  "es-ES": "¿Hay algún otro síntoma?",
  "pl-PL": "Czy są inne objawy?",
  "nl-NL": "Zijn er nog andere symptomen?",
};

const FORM_FIELD_QUESTION_PATTERN = new RegExp(
  "\\b(spo2|oxygen saturation|temperature|heart rate|pulse rate|blood pressure|" +
  "age|how old|date of birth|sex|gender|weight|height|bmi)\\b|" +
  "\\bhow high (?:is )?(?:the )?fever\\b",
  "i"
);
const CONFIRMATION_QUESTION_PATTERN = /\b(?:do|did) you mean\b|\bare you (?:saying|telling me)\b|\bcan you confirm\b/i;
const COMPLETE_SHORT_ANSWER_PATTERN = /^(?:yes|no|yeah|nope|ja|nein|oui|non|sì|si|да|нет|tak|nie|nee)$/i;

function silenceDelayFor(transcript: string): number {
  const cleaned = transcript.trim();
  if (COMPLETE_SHORT_ANSWER_PATTERN.test(cleaned)) return 3000;
  const wordCount = cleaned.split(/\s+/).filter(Boolean).length;
  return wordCount <= 2 ? 4000 : 2200;
}

async function callLLM(
  messages: { role: "user" | "assistant"; content: string }[],
  languageCode: string,
  screeningContext: ScreeningContext,
): Promise<string> {
  const res = await fetch("/voice-llm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      language_code: languageCode,
      screening_context: screeningContext,
      messages,
    }),
  });
  const text = await res.text();
  if (!text) throw new Error("Empty response from server");
  let data;
  try { data = JSON.parse(text); } catch { throw new Error(`Invalid JSON: ${text.slice(0, 200)}`); }
  if (!res.ok) throw new Error(`Server error ${res.status}: ${data?.detail ?? text.slice(0, 200)}`);
  return data.content ?? "";
}

function speak(text: string, lang: string) {
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.lang = lang; utt.rate = 1.0;
  window.speechSynthesis.speak(utt);
}

function parseCompletedSymptoms(reply: string): CompletedSymptoms | null {
  const fenced = reply.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const trimmed = reply.trim();
  const objectStart = trimmed.indexOf("{");
  const objectEnd = trimmed.lastIndexOf("}");
  const embedded = objectStart >= 0 && objectEnd > objectStart
    ? trimmed.slice(objectStart, objectEnd + 1)
    : null;

  for (const candidate of [fenced, embedded, trimmed]) {
    if (!candidate) continue;
    try {
      const parsed = JSON.parse(candidate);
      if (
        parsed?.done === true &&
        typeof parsed.display_symptoms === "string" && parsed.display_symptoms.trim() &&
        typeof parsed.english_symptoms === "string" && parsed.english_symptoms.trim()
      ) {
        return parsed as CompletedSymptoms;
      }
    } catch {
      // This candidate was conversational text, not the completion payload.
    }
  }
  return null;
}

function makeConciseQuestion(reply: string): string {
  let question = reply
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const firstQuestionEnd = question.indexOf("?");
  if (firstQuestionEnd >= 0) question = question.slice(0, firstQuestionEnd + 1);
  question = question.replace(/\s*\([^)]*\)/g, "").trim();

  let words = question.split(/\s+/).filter(Boolean);
  if (words.length > 12) {
    const clauseBreak = question.search(/[,;]|\s+(?:or|and|also)\s+/i);
    if (clauseBreak > 0) {
      const shorterClause = question.slice(0, clauseBreak).trim();
      if (shorterClause.split(/\s+/).length >= 4) question = shorterClause;
    }
    words = question.split(/\s+/).filter(Boolean);
    if (words.length > 12) question = words.slice(0, 12).join(" ");
  }

  return `${question.replace(/[.!?]+$/, "").trim()}?`;
}

function normaliseTranscriptFromContext(transcript: string, previousQuestion: string): string {
  let normalised = transcript;
  const context = previousQuestion.toLowerCase();

  // Correct likely clinical mishearings only when the preceding question
  // makes the intended meaning clear.
  if (/phlegm|sputum|productive|dry cough/.test(context)) {
    normalised = normalised.replace(/\b(?:flame|flem|phlem|flehm|film)\b/gi, "phlegm");
  }
  if (/wheez/.test(context)) {
    normalised = normalised.replace(/\b(?:wheels|wees|weezing)\b/gi, "wheezing");
  }
  if (/sore throat/.test(context)) {
    normalised = normalised.replace(/\b(?:saw throat|soar throat)\b/gi, "sore throat");
  }

  return normalised;
}

export default function VoiceAssistant({ onSymptomsExtracted, screeningContext = {} }: VoiceAssistantProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [selectedLang, setSelectedLang] = useState(LANGUAGES[0]);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentTranscript, setCurrentTranscript] = useState("");
  const [statusText, setStatusText] = useState("Select language and tap mic to begin");
  const recognitionRef = useRef<InstanceType<typeof window.SpeechRecognition> | null>(null);
  const conversationRef = useRef<{ role: "user" | "assistant"; content: string }[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const currentTranscriptRef = useRef("");
  const silenceTimerRef = useRef<number | null>(null);

  const clearSilenceTimer = () => {
    if (silenceTimerRef.current !== null) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  };

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => { currentTranscriptRef.current = currentTranscript; }, [currentTranscript]);

  const startListening = () => {
    const SR = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setStatusText("Speech recognition not supported in this browser."); return; }
    const rec = new SR();
    rec.lang = selectedLang.code; rec.continuous = true; rec.interimResults = true;
    recognitionRef.current = rec;
    clearSilenceTimer();
    currentTranscriptRef.current = "";
    setPhase("listening"); setCurrentTranscript(""); setStatusText("Listening… tap the mic when finished");
    rec.onresult = (e: SpeechRecognitionEvent) => {
      const transcript = Array.from(e.results).map((r) => r[0].transcript).join(" ").trim();
      currentTranscriptRef.current = transcript;
      setCurrentTranscript(transcript);
      clearSilenceTimer();
      silenceTimerRef.current = window.setTimeout(() => {
        recognitionRef.current?.stop();
      }, silenceDelayFor(transcript));
    };
    rec.onerror = () => {
      clearSilenceTimer();
      setPhase("idle"); setStatusText("Microphone error. Please try again.");
    };
    rec.onend = () => {
      clearSilenceTimer();
      const t = currentTranscriptRef.current;
      currentTranscriptRef.current = "";
      if (t.trim()) handleUserSpeech(t.trim());
      else { setPhase("idle"); setStatusText("Nothing heard. Tap mic to try again."); }
    };
    rec.start();
  };

  const stopListening = () => {
    clearSilenceTimer();
    recognitionRef.current?.stop();
  };

  const handleUserSpeech = async (transcript: string) => {
    setPhase("thinking"); setStatusText("Processing…");
    window.speechSynthesis.cancel();
    setMessages((prev) => [...prev, { role: "user", text: transcript }]);

    const previousQuestion = [...conversationRef.current]
      .reverse()
      .find(message => message.role === "assistant")?.content ?? "";
    const clinicalTranscript = normaliseTranscriptFromContext(transcript, previousQuestion);

    conversationRef.current.push({ role: "user", content: clinicalTranscript });
    try {
      const reply = await callLLM(
        conversationRef.current,
        selectedLang.code,
        screeningContext,
      );
      const completed = parseCompletedSymptoms(reply);
      if (completed) {
        conversationRef.current.push({ role: "assistant", content: reply });
        const acknowledgement = COMPLETION_ACKNOWLEDGEMENTS[selectedLang.code]
          ?? COMPLETION_ACKNOWLEDGEMENTS["en-GB"];
        setPhase("done"); setStatusText("Symptoms captured ✓");
        setMessages((prev) => [...prev, { role: "assistant", text: acknowledgement }]);
        onSymptomsExtracted(completed.display_symptoms, completed.english_symptoms);
        speak(acknowledgement, selectedLang.code);
        return;
      }
      const proposedQuestion = makeConciseQuestion(reply);
      const conciseQuestion = (
        FORM_FIELD_QUESTION_PATTERN.test(proposedQuestion) ||
        CONFIRMATION_QUESTION_PATTERN.test(proposedQuestion)
      )
        ? (OTHER_SYMPTOMS_QUESTIONS[selectedLang.code] ?? OTHER_SYMPTOMS_QUESTIONS["en-GB"])
        : proposedQuestion;
      conversationRef.current.push({ role: "assistant", content: conciseQuestion });
      setPhase("questioning");
      setMessages((prev) => [...prev, { role: "assistant", text: conciseQuestion }]);
      setStatusText("Tap mic to answer");
      speak(conciseQuestion, selectedLang.code);
    } catch {
      setPhase("idle"); setStatusText("Error processing. Please try again.");
    }
  };

  const reset = () => {
    clearSilenceTimer();
    window.speechSynthesis.cancel(); recognitionRef.current?.stop();
    setPhase("idle"); setMessages([]); setCurrentTranscript("");
    conversationRef.current = []; setStatusText("Select language and tap mic to begin");
  };

  const micActive = phase === "listening";
  const micDisabled = phase === "thinking" || phase === "done";
  const SelectedFlag = selectedLang.Flag;

  return (
    <div className="rounded-xl border border-border bg-card/50 p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          <span className="text-sm font-medium text-foreground">Voice Assistant</span>
        </div>
        {messages.length > 0 && (
          <button onClick={reset} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Language selector */}
      <div className="relative">
        <button
          onClick={() => setShowLangMenu(!showLangMenu)}
          disabled={phase !== "idle" && phase !== "questioning"}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-background text-sm hover:bg-accent transition-colors disabled:opacity-50"
        >
          <SelectedFlag style={{ width: 22, height: 15, borderRadius: 3, display: "block" }} />
          <span>{selectedLang.label}</span>
          <ChevronDown className="w-3 h-3 text-muted-foreground" />
        </button>

        {showLangMenu && (
          <div className="absolute z-50 top-full mt-1 left-0 rounded-xl border border-border bg-card shadow-lg p-1 grid grid-cols-2 gap-0.5 min-w-[220px]">
            {LANGUAGES.map((lang) => {
              const LangFlag = lang.Flag;
              return (
                <button
                  key={lang.code}
                  onClick={() => { setSelectedLang(lang); setShowLangMenu(false); }}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-accent transition-colors text-left ${
                    selectedLang.code === lang.code ? "bg-accent font-medium" : ""
                  }`}
                >
                  <LangFlag style={{ width: 22, height: 15, borderRadius: 3, display: "block", flexShrink: 0 }} />
                  <span>{lang.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Conversation */}
      {messages.length > 0 && (
        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                msg.role === "user" ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted text-foreground rounded-bl-sm"
              }`}>{msg.text}</div>
            </div>
          ))}
          {phase === "listening" && currentTranscript && (
            <div className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-sm px-3 py-2 text-sm bg-primary/30 text-foreground italic">{currentTranscript}</div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
      )}

      {/* Mic + status */}
      <div className="flex items-center gap-4">
        <button
          onClick={micActive ? stopListening : startListening}
          disabled={micDisabled}
          className={`relative w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200 shadow-md disabled:opacity-40 disabled:cursor-not-allowed
            ${micActive ? "bg-red-500 hover:bg-red-600 scale-110" : phase === "done" ? "bg-green-500" : "bg-primary hover:bg-primary/90"}`}
        >
          {micActive && <span className="absolute inset-0 rounded-full bg-red-400 animate-ping opacity-40" />}
          {phase === "thinking" ? <Loader2 className="w-6 h-6 text-white animate-spin" />
            : phase === "done" ? <CheckCircle className="w-6 h-6 text-white" />
            : micActive ? <MicOff className="w-6 h-6 text-white" />
            : <Mic className="w-6 h-6 text-white" />}
        </button>
        <div className="flex-1">
          <p className="text-sm text-muted-foreground">{statusText}</p>
          {phase === "questioning" && (
            <button onClick={() => speak(messages[messages.length - 1]?.text ?? "", selectedLang.code)}
              className="mt-1 flex items-center gap-1 text-xs text-primary hover:underline">
              <Volume2 className="w-3 h-3" /> Repeat question
            </button>
          )}
        </div>
      </div>

      {phase === "done" && (
        <p className="text-xs text-muted-foreground text-center">Symptoms filled below. You can still edit manually.</p>
      )}
    </div>
  );
}
