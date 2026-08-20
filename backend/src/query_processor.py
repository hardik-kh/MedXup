"""
Query Processor for RAG Pipeline
Handles clinical query generation and complexity scoring.

Scoring Strategy (Option C):
- LLM generates clinical query AND scores complexity in one call
- Rule-based hard overrides applied after for critical safety cases
- Score 1-3: Routine textbook case
- Score 4-6: Atypical features, age risk, borderline vitals
- Score 7-10: Research literature would genuinely add value beyond Nelson+BNF
"""

from openai import AzureOpenAI
from typing import Dict, List
import re
import json
import config


class QueryProcessor:
    """Process patient data into clinical queries with complexity scoring"""

    def __init__(self, azure_config: Dict):
        self.client = AzureOpenAI(
            api_key=azure_config["api_key"],
            api_version=azure_config["api_version"],
            azure_endpoint=azure_config["endpoint"]
        )
        self.deployment_name = azure_config["deployment_name"]

    def process_query(self, patient_data: Dict) -> Dict:
        """
        Process patient data into clinical query + dosage query + complexity score.
        Single LLM call returns all three.
        Rule-based overrides applied after.
        """
        # Single LLM call: clinical query + dosage query + score.
        # dosage_query is retained for a future dedicated dosage-retrieval path;
        # the current drug-table lookup uses drug_names + clinical_query instead.
        clinical_query, dosage_query, drug_names, llm_score, llm_reasoning = self._generate_query_and_score(patient_data)

        # Apply rule-based hard overrides on top of LLM score
        final_score, override_reason = self._apply_hard_overrides(patient_data, llm_score)

        print(f"   Clinical Query : {clinical_query}")
        print(f"   Dosage Query   : {dosage_query}")
        print(f"   Drug Names     : {drug_names}")
        print(f"   LLM score: {llm_score}/10 → Final: {final_score}/10")
        if override_reason:
            print(f"   Override reason: {override_reason}")
        else:
            print(f"   LLM reasoning: {llm_reasoning}")

        return {
            "clinical_query": clinical_query,
            "dosage_query": dosage_query,
            "drug_names": drug_names,
            "complexity_score": final_score,
            "llm_score": llm_score,
            "score_reasoning": override_reason or llm_reasoning,
        }

    # ------------------------------------------------------------------ #
    # LLM Call: Query + Score (combined, single call)
    # ------------------------------------------------------------------ #

    def _generate_query_and_score(self, patient_data: Dict):
        """
        Single LLM call that generates:
        1. A clinical search query
        2. A complexity score (1-10)
        3. One-line reasoning for the score

        Returns:
            (clinical_query: str, dosage_query: str, drug_names: list, score: int, reasoning: str)
        """
        age = patient_data.get('age', 'Unknown')
        sex = patient_data.get('sex', 'Unknown')
        symptoms = patient_data.get('symptoms', '')

        vitals_parts = []
        if patient_data.get('temp'):
            vitals_parts.append(f"Temp {patient_data['temp']}°C")
        if patient_data.get('spo2'):
            vitals_parts.append(f"SpO2 {patient_data['spo2']}%")
        if patient_data.get('hr'):
            vitals_parts.append(f"HR {patient_data['hr']} bpm")
        if patient_data.get('bp_sys') and patient_data.get('bp_dia'):
            vitals_parts.append(f"BP {patient_data['bp_sys']}/{patient_data['bp_dia']} mmHg")
        if patient_data.get('weight'):
            vitals_parts.append(f"Weight {patient_data['weight']} kg")

        vitals_str = ", ".join(vitals_parts) if vitals_parts else "not provided"

        prompt = f"""You are a pediatric clinical decision support system. Given a patient presentation, do FOUR things:

1. Generate a concise clinical search query (2-3 sentences) for searching medical literature (Nelson Textbook). Focus on diagnosis, symptoms, differential diagnosis.
2. Generate a focused dosage/drug query for searching BNF for Children. Infer the most likely condition(s) and list specific drug names, dosing keywords, and route. Be specific — drug names matter here.
3. List the specific drug names from step 2 as a simple array (max 4 drugs). These must be individual drug names only — no phrases, no descriptions.
4. Score the clinical complexity (1-10) based on whether research literature would genuinely improve the recommendation beyond standard textbook knowledge (Nelson, BNF).

SCORING GUIDE:
- 1-3: Truly routine. Textbook case, healthy child, normal or mildly abnormal vitals. Nelson + BNF is sufficient.
  Examples: 8yo fever + sore throat (2), simple viral URTI (1), mild eczema flare (2)

- 4-6: Some atypical features, age-related risk, borderline vitals, or presentation where clinical nuance matters.
  Examples: 4yo febrile UTI with pyelonephritis consideration (4), infant bronchiolitis with moderate symptoms (5),
  toddler with recurrent wheeze (5), febrile child with borderline BP for age (4)

- 7-10: Research literature would GENUINELY add value. Complex, rare, treatment-resistant, or cutting-edge management.
  Examples: 2mo fever + lethargy (8), immunocompromised child with infection (8),
  treatment-resistant condition (7), rare/atypical presentation (8-9),
  multi-system involvement (7), sepsis or shock (9-10)

DEFAULT BIAS: When unsure, score LOWER. Research is only needed when it would genuinely change management.

PATIENT:
Age: {age} years | Sex: {sex}
Symptoms: {symptoms}
Vitals: {vitals_str}

IMPORTANT: Use British/BNF spelling for all drug names (e.g. cefalexin not cephalexin, adrenaline not epinephrine, paracetamol not acetaminophen, amoxicillin not amoxycillin). This is critical for correct drug lookup in BNF for Children.

Respond ONLY with valid JSON in this exact format (no markdown, no extra text):
{{
  "clinical_query": "...",
  "dosage_query": "...",
  "drug_names": ["drug1", "drug2", "drug3"],
  "complexity_score": <integer 1-10>,
  "reasoning": "one sentence explanation"
}}"""

        try:
            response = self.client.chat.completions.create(
                model=self.deployment_name,
                messages=[{"role": "user", "content": prompt}],
                reasoning_effort=config.QUERY_LLM_CONFIG["reasoning_effort"],
                max_completion_tokens=config.QUERY_LLM_CONFIG["max_completion_tokens"]
            )

            raw = response.choices[0].message.content.strip()
            raw = re.sub(r"^```(?:json)?", "", raw).strip()
            raw = re.sub(r"```$", "", raw).strip()

            parsed = json.loads(raw)
            clinical_query = parsed.get("clinical_query", "").strip()
            dosage_query = parsed.get("dosage_query", clinical_query).strip()
            drug_names = parsed.get("drug_names", [])
            llm_score = int(parsed.get("complexity_score", 3))
            reasoning = parsed.get("reasoning", "").strip()

            llm_score = max(1, min(10, llm_score))

            return clinical_query, dosage_query, drug_names, llm_score, reasoning

        except Exception as e:
            print(f"⚠️ LLM query+score generation failed: {e}")
            fallback_query = f"{age} year old {sex} with {symptoms}. Vitals: {vitals_str}"
            return fallback_query, fallback_query, [], 3, "fallback score due to LLM error"

    # ------------------------------------------------------------------ #
    # Rule-based Hard Overrides (safety nets)
    # ------------------------------------------------------------------ #

    def _apply_hard_overrides(self, patient_data: Dict, llm_score: int):
        """
        Apply deterministic safety overrides on top of LLM score.
        These protect against LLM underscoring genuinely dangerous presentations.

        Returns:
            (final_score: int, override_reason: str or None)
        """
        age = patient_data.get('age', 10)
        temp = patient_data.get('temp') or 37.0
        spo2 = patient_data.get('spo2') or 100
        hr = patient_data.get('hr') or 0
        bp_sys = patient_data.get('bp_sys') or 999
        symptoms_lower = patient_data.get('symptoms', '').lower()
        floor_matches = []

        # ── HARD FLOOR RULES (minimum score, regardless of LLM) ──

        # Young infants (< 3 months) with any fever → always high complexity
        if age < 0.25 and temp >= 38.0:
            floor_matches.append((8, "Young infant (<3mo) with fever — serious bacterial infection must be excluded"))

        # Young infant (< 1 year) with fever
        if age < 1 and temp >= 38.0:
            floor_matches.append((6, "Infant (<1yr) with fever — higher risk presentation"))

        # Critical SpO2
        if spo2 < 90:
            floor_matches.append((9, f"Critical hypoxia: SpO2 {spo2}%"))
        elif spo2 < 94:
            floor_matches.append((7, f"Significant hypoxia: SpO2 {spo2}%"))

        # High fever in any age
        if temp >= 40.5:
            floor_matches.append((7, f"Very high fever: {temp}°C"))

        # Age-adjusted tachycardia (severe)
        tachycardia_threshold = (
            180 if age < 1 else
            160 if age < 2 else
            140 if age < 5 else
            130 if age < 12 else
            120
        )
        if hr > tachycardia_threshold:
            floor_matches.append((6, f"Severe tachycardia for age: {hr} bpm"))

        # Age-adjusted hypotension (systolic BP floor)
        bp_floor = (
            60 if age < 1 else
            70 if age < 2 else
            int(70 + 2 * age) if age < 10 else
            90
        )
        if bp_sys < bp_floor:
            floor_matches.append((7, f"Hypotension for age: BP {bp_sys} mmHg (floor {bp_floor})"))

        # Critical symptom keywords → hard floor 8
        critical_keywords = [
            'seizure', 'convulsion', 'unconscious', 'unresponsive',
            'cyanosis', 'blue lips', 'not breathing',
            'meningism', 'bulging fontanel', 'petechial', 'purpura', 'non-blanching',
            'sepsis', 'shock', 'altered consciousness', 'altered mental status',
        ]
        for kw in critical_keywords:
            if kw in symptoms_lower:
                floor_matches.append((8, f"Critical keyword detected: '{kw}'"))

        # Complexity-raising keywords → floor 6
        moderate_keywords = [
            'immunocompromised', 'immunosuppressed', 'hiv', 'cancer', 'oncology',
            'transplant', 'chemotherapy', 'sickle cell',
            'treatment failure', 'not responding', 'not improving',
            'resistant', 'recurrent', 'relapse',
            'stridor', 'respiratory distress', 'grunting', 'nasal flaring',
            'dehydration', 'no urine output',
        ]
        for kw in moderate_keywords:
            if kw in symptoms_lower:
                floor_matches.append((6, f"Complexity keyword detected: '{kw}'"))

        # Multi-system involvement (3+ organ systems mentioned)
        system_keywords = {
            'respiratory': ['cough', 'wheeze', 'breathing', 'stridor', 'spo2'],
            'neuro': ['seizure', 'headache', 'lethargy', 'consciousness', 'fontanel'],
            'cardiac': ['heart rate', 'tachycardia', 'murmur', 'chest pain'],
            'renal': ['urine', 'dysuria', 'frequency', 'oliguria'],
            'gi': ['vomiting', 'diarrhea', 'abdominal', 'feeding'],
            'skin': ['rash', 'petechial', 'purpura', 'jaundice'],
        }
        systems_involved = sum(
            1 for system_words in system_keywords.values()
            if any(w in symptoms_lower for w in system_words)
        )
        if systems_involved >= 3:
            floor_matches.append((6, f"Multi-system involvement: {systems_involved} systems"))

        # Febrile UTI in child (fever + urinary symptoms) → min 4
        urinary_keywords = ['uti', 'urinary', 'dysuria', 'frequency', 'urine', 'bladder', 'bedwetting']
        has_urinary = any(kw in symptoms_lower for kw in urinary_keywords)
        if has_urinary and temp >= 38.0 and age >= 1:
            floor_matches.append((4, f"Febrile UTI in child: fever {temp}°C with urinary symptoms"))

        # Evaluate every safety rule, then apply the strongest matched floor.
        # This prevents a lower-priority early match from hiding a critical one.
        if floor_matches:
            highest_floor = max(score for score, _ in floor_matches)
            highest_reasons = [
                reason for score, reason in floor_matches if score == highest_floor
            ]
            return max(llm_score, highest_floor), "; ".join(highest_reasons)

        # ── HARD CEILING RULES (cap score if clearly routine) ──

        # Very mild presentation — cap at 4
        if (temp <= 38.5 and spo2 >= 97 and age >= 2 and
                not any(kw in symptoms_lower for kw in critical_keywords + moderate_keywords)):
            return min(llm_score, 4), None

        # No override applied — trust LLM score
        return llm_score, None

    # ------------------------------------------------------------------ #
    # Routing decision
    # ------------------------------------------------------------------ #

    def should_use_research(self, complexity_score: int) -> bool:
        """Research papers queried only for genuinely complex cases (score >= 7)"""
        return complexity_score >= 7
