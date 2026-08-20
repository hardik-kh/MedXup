"""
Embedding service using PubMedBERT
"""

from typing import List, Union
import numpy as np
from sentence_transformers import SentenceTransformer
import torch


class EmbeddingService:
    """Generate embeddings for medical text"""
    
    def __init__(self, model_name: str = "pritamdeka/S-PubMedBert-MS-MARCO"):
        """Initialize embedding model"""
        print(f"🔄 Loading: {model_name}")
        
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"  Device: {self.device}")
        
        self.model = SentenceTransformer(model_name, device=self.device)
        self.dimension = self.model.get_sentence_embedding_dimension()
        
        print(f"✅ Model loaded! Dim: {self.dimension}")
    
    def encode_text(self, text: Union[str, List[str]], 
                    batch_size: int = 32) -> np.ndarray:
        """
        Encode text to embeddings
        
        Args:
            text: String or list of strings
            batch_size: Batch size for processing
            
        Returns:
            numpy array of embeddings
        """
        if isinstance(text, str):
            text = [text]
        
        embeddings = self.model.encode(
            text,
            batch_size=batch_size,
            convert_to_numpy=True,
            normalize_embeddings=True,
            show_progress_bar=False
        )
        
        return embeddings
    
    def encode_batch(self, texts: List[str], 
                     batch_size: int = 32) -> np.ndarray:
        """Encode batch with progress bar"""
        return self.model.encode(
            texts,
            batch_size=batch_size,
            convert_to_numpy=True,
            normalize_embeddings=True,
            show_progress_bar=True
        )