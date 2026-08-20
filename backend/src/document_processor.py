"""
Document processor for JSON metadata files
Handles chunking of medical paper abstracts
"""

import json
import re
from typing import List, Dict, Tuple
from pathlib import Path


class DocumentProcessor:
    """Process JSON metadata files into text chunks"""
    
    def __init__(self, max_tokens: int = 512):
        """
        Initialize processor
        
        Args:
            max_tokens: Maximum tokens per chunk (default: 512 for PubMedBERT)
        """
        self.max_tokens = max_tokens
        # Rough estimate: 1 token ≈ 0.75 words
        self.max_words = int(max_tokens * 0.75)
    
    def count_words(self, text: str) -> int:
        """Count words in text"""
        return len(text.split())
    
    def split_at_sentence(self, text: str) -> Tuple[str, str]:
        """Split text at sentence boundary near middle"""
        sentences = re.split(r'(?<=[.!?])\s+', text)
        
        if len(sentences) <= 1:
            mid = len(text) // 2
            return text[:mid], text[mid:]
        
        # Find midpoint
        mid_point = len(sentences) // 2
        first_half = ' '.join(sentences[:mid_point])
        second_half = ' '.join(sentences[mid_point:])
        
        return first_half, second_half
    
    def format_paper(self, paper: Dict, abstract: str = None) -> str:
        """Format paper metadata into readable text"""
        authors = paper.get('authors', [])
        if isinstance(authors, list):
            author_str = ', '.join(authors[:3])
            if len(authors) > 3:
                author_str += ' et al.'
        else:
            author_str = str(authors)
        
        abstract_text = abstract if abstract else paper.get('abstract', '')
        
        return f"""Title: {paper.get('title', 'No title')}
Authors: {author_str}
Journal: {paper.get('journal', 'Unknown')} ({paper.get('year', 'N/A')})
PMID: {paper.get('pmid', 'N/A')} | DOI: {paper.get('doi', 'N/A')}

Abstract:
{abstract_text}"""
    
    def process_paper(self, paper: Dict, index: int) -> List[Dict]:
        """
        Process single paper into 1 or 2 chunks
        
        Returns:
            List of chunk dictionaries with id, text, metadata
        """
        chunks = []
        pmid = str(paper.get('pmid', f'paper_{index}'))
        
        # Format full text
        full_text = self.format_paper(paper)
        word_count = self.count_words(full_text)
        
        # Prepare metadata (all values must be strings)
        authors = paper.get('authors', [])
        author_str = ', '.join(authors[:3]) if isinstance(authors, list) else str(authors)
        if isinstance(authors, list) and len(authors) > 3:
            author_str += ' et al.'
        
        base_metadata = {
            'pmid': pmid,
            'doi': str(paper.get('doi', '')),
            'title': str(paper.get('title', ''))[:500],
            'journal': str(paper.get('journal', '')),
            'year': str(paper.get('year', '')),
            'authors': author_str,
            'source': f"{paper.get('journal', 'Unknown')} ({paper.get('year', 'N/A')})"
        }
        
        # Check if needs splitting
        if word_count <= self.max_words:
            # Keep as single chunk
            chunks.append({
                'id': pmid,
                'text': full_text,
                'metadata': {**base_metadata, 'chunk_index': '0', 'total_chunks': '1'}
            })
        else:
            # Split into 2 chunks
            abstract = paper.get('abstract', '')
            part1, part2 = self.split_at_sentence(abstract)
            
            for idx, abstract_part in enumerate([part1, part2], 1):
                chunk_text = self.format_paper(paper, abstract_part)
                chunks.append({
                    'id': f"{pmid}_part{idx}",
                    'text': chunk_text,
                    'metadata': {**base_metadata, 'chunk_index': str(idx-1), 'total_chunks': '2'}
                })
        
        return chunks
    
    def process_json_file(self, json_path: str) -> List[Dict]:
        """Process entire JSON file"""
        print(f"Processing: {json_path}")
        
        try:
            with open(json_path, 'r', encoding='utf-8') as f:
                papers = json.load(f)
            
            if not isinstance(papers, list):
                print(f"  Warning: Expected list, got {type(papers)}")
                return []
            
            all_chunks = []
            split_count = 0
            
            for idx, paper in enumerate(papers):
                if not isinstance(paper, dict):
                    continue
                
                chunks = self.process_paper(paper, idx)
                all_chunks.extend(chunks)
                
                if len(chunks) > 1:
                    split_count += 1
                
                if (idx + 1) % 1000 == 0:
                    print(f"  Processed {idx + 1}/{len(papers)}...")
            
            print(f"  ✓ {len(papers)} papers → {len(all_chunks)} chunks")
            print(f"    ({len(papers) - split_count} whole, {split_count} split)")
            
            return all_chunks
            
        except Exception as e:
            print(f"  ❌ Error: {e}")
            return []