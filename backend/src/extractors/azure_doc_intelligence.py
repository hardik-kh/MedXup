"""
Azure Document Intelligence PDF Extractor
Production version - extracts text, tables, and figures
"""

from azure.ai.formrecognizer import DocumentAnalysisClient
from azure.core.credentials import AzureKeyCredential
from typing import List, Dict
import os


class AzureDocExtractor:
    """Extract content from PDFs using Azure Document Intelligence"""
    
    def __init__(self):
        """Initialize Azure client with credentials from environment"""
        self.endpoint = os.getenv("AZURE_DOC_INTELLIGENCE_ENDPOINT")
        self.api_key = os.getenv("AZURE_DOC_INTELLIGENCE_KEY")
        
        if not self.endpoint or not self.api_key:
            raise ValueError(
                "Missing Azure credentials. Set in .env:\n"
                "AZURE_DOC_INTELLIGENCE_ENDPOINT=...\n"
                "AZURE_DOC_INTELLIGENCE_KEY=..."
            )
        
        self.client = DocumentAnalysisClient(
            endpoint=self.endpoint,
            credential=AzureKeyCredential(self.api_key)
        )
    
    def extract_pdf(self, pdf_path: str, page_start: int, page_end: int) -> List[Dict]:
        """
        Extract pages from PDF
        
        Args:
            pdf_path: Path to PDF file
            page_start: First page (1-indexed)
            page_end: Last page (1-indexed)
            
        Returns:
            List of page dicts with text, tables, figures
        """
        print(f"📄 Extracting: {pdf_path}")
        print(f"   Pages: {page_start} to {page_end}")
        
        with open(pdf_path, "rb") as f:
            pdf_content = f.read()
        
        print("   ⏳ Analyzing with Azure...")
        poller = self.client.begin_analyze_document("prebuilt-layout", document=pdf_content)
        result = poller.result()
        
        # Extract pages
        pages = []
        for page_num, page in enumerate(result.pages, start=1):
            if page_num < page_start or page_num > page_end:
                continue
            
            page_text = '\n'.join([line.content for line in page.lines]) if page.lines else ''
            
            pages.append({
                'page_number': page_num,
                'text': page_text,
                'tables': [],
                'figures': []
            })
            
            if page_num % 500 == 0:
                print(f"   📄 {page_num}/{page_end}")
        
        # Extract tables
        if result.tables:
            for table in result.tables:
                table_page = table.bounding_regions[0].page_number
                if page_start <= table_page <= page_end:
                    page_idx = table_page - page_start
                    if 0 <= page_idx < len(pages):
                        pages[page_idx]['tables'].append(self._format_table(table))
        
        # Extract figures
        if hasattr(result, 'figures') and result.figures:
            for figure in result.figures:
                fig_page = figure.bounding_regions[0].page_number
                if page_start <= fig_page <= page_end:
                    page_idx = fig_page - page_start
                    if 0 <= page_idx < len(pages):
                        pages[page_idx]['figures'].append(self._format_figure(figure))
        
        print(f"   ✅ Extracted {len(pages)} pages")
        print(f"   📊 Tables: {sum(len(p['tables']) for p in pages)}")
        print(f"   🖼️  Figures: {sum(len(p['figures']) for p in pages)}")
        
        return pages
    
    def _format_table(self, table) -> Dict:
        """Convert table to structured format"""
        rows = []
        for cell in table.cells:
            while len(rows) <= cell.row_index:
                rows.append([])
            while len(rows[cell.row_index]) <= cell.column_index:
                rows[cell.row_index].append('')
            rows[cell.row_index][cell.column_index] = cell.content
        
        return {'rows': rows, 'row_count': table.row_count, 'column_count': table.column_count}
    
    def _format_figure(self, figure) -> Dict:
        """Extract figure information"""
        text_parts = []
        if hasattr(figure, 'spans'):
            for span in figure.spans:
                if hasattr(span, 'content'):
                    text_parts.append(span.content)
        
        return {
            'caption': figure.caption.content if hasattr(figure, 'caption') and figure.caption else '',
            'text': ' '.join(text_parts)
        }