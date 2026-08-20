"""
Clinical Analyzer - Main Pipeline Orchestrator
Uses advanced multi-DB RAG pipeline for clinical decision support
"""

from typing import Dict
from src.rag_engine import RAGEngine


class ClinicalAnalyzer:
    """Main pipeline for pediatric clinical decision support"""
    
    def __init__(self, config):
        """
        Initialize the clinical analyzer with new RAG pipeline
        
        Args:
            config: Configuration module
        """
        print("\n" + "="*70)
        print("🏥 Initializing MedXup Clinical Analyzer")
        print("="*70 + "\n")
        
        self.config = config
        
        # Initialize RAG engine
        # (Handles all: query processing, hybrid search, reranking, LLM)
        self.rag_engine = RAGEngine(azure_config=config.AZURE_CONFIG)
        
        print("\n" + "="*70)
        print("✅ MedXup Clinical Analyzer Ready!")
        print("="*70 + "\n")
    
    def analyze_patient(self, patient_data: Dict) -> Dict:
        """
        Analyze a patient case using advanced RAG pipeline
        
        Pipeline:
        1. Query processing (LLM + complexity scoring)
        2. Multi-DB routing (Nelson + BNF + Qdrant Research if complex)
        3. Hybrid search (BM25 + Semantic)
        4. CrossEncoder reranking
        5. LLM clinical analysis
        
        Args:
            patient_data: Dictionary containing:
                - name, age, sex
                - weight, height
                - spo2, temp, hr, bp_sys, bp_dia
                - symptoms
                
        Returns:
            Dictionary with clinical analysis and metadata
        """
        print("\n" + "="*70)
        print("🔍 Analyzing Patient Case")
        print("="*70 + "\n")
        
        # Preprocess patient data
        patient_data = self._preprocess_patient_data(patient_data)
        
        # Run advanced RAG analysis
        result = self.rag_engine.analyze_patient(
            patient_data=patient_data,
            prompt_template=self.config.CLINICAL_PROMPT_TEMPLATE
        )
        
        # Add patient data to result
        result["patient_data"] = patient_data
        
        return result
    
    def _preprocess_patient_data(self, patient_data: Dict) -> Dict:
        """
        Calculate BMI and format vitals
        
        Args:
            patient_data: Raw patient data
            
        Returns:
            Preprocessed patient data
        """
        # Calculate BMI
        bmi = "Not calculated"
        bmi_cat = "Unknown"
        
        if patient_data.get("weight") and patient_data.get("height"):
            h_m = patient_data["height"] / 100
            bmi_val = patient_data["weight"] / (h_m * h_m)
            bmi = round(bmi_val, 1)
            
            # Pediatric BMI categories (simplified)
            # Note: Proper pediatric BMI uses growth charts and percentiles
            if bmi_val < 18.5:
                bmi_cat = "Underweight"
            elif bmi_val < 25:
                bmi_cat = "Normal weight"
            elif bmi_val < 30:
                bmi_cat = "Overweight"
            else:
                bmi_cat = "Obese"
        
        patient_data["bmi"] = bmi
        patient_data["bmi_cat"] = bmi_cat
        
        # Format blood pressure
        if patient_data.get("bp_sys") and patient_data.get("bp_dia"):
            patient_data["bp"] = f"{patient_data['bp_sys']}/{patient_data['bp_dia']}"
        else:
            patient_data["bp"] = "Not provided"
        
        return patient_data
    
    def get_system_stats(self) -> Dict:
        """
        Get statistics about indexed databases
        
        Returns:
            Dict with stats for each database
        """
        db_stats = self.rag_engine.get_system_stats()
        
        return {
            "databases": db_stats,
            "embedding_model": self.config.MODELS["embedder"],
            "reranker_model": self.config.MODELS["reranker"],
            "llm_model": self.config.AZURE_CONFIG["deployment_name"],
            "rag_config": self.config.RAG_CONFIG
        }


if __name__ == "__main__":
    # Test the clinical analyzer
    import sys
    from pathlib import Path
    sys.path.append(str(Path(__file__).parent.parent))
    import config
    
    print("\n🧪 Testing Clinical Analyzer\n")
    
    try:
        # Validate config
        config.validate_config()
        
        # Initialize analyzer
        analyzer = ClinicalAnalyzer(config)
        
        # Get stats
        stats = analyzer.get_system_stats()
        print("\n📊 System Stats:")
        for db_name, db_info in stats['databases'].items():
            print(f"   {db_name}: {db_info['total_chunks']} chunks")
        
        print("\n✅ Clinical analyzer test complete!")
        
    except ValueError as e:
        print(f"❌ Configuration error: {e}")
        print("\nPlease:")
        print("1. Copy .env.template to .env")
        print("2. Fill in your Azure OpenAI credentials")