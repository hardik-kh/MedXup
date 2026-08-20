"""
Nelson Textbook Parser - One Chunk Per Chapter
Chapter boundaries only (e.g., "Chapter 1", "Chapter 2", etc.)
"""

import re
from typing import List, Dict
from dataclasses import dataclass


@dataclass
class Chapter:
    """Chapter in Nelson textbook"""
    chapter_num: str
    chapter_title: str
    text: str
    page_start: int
    page_end: int
    tables: List[Dict]
    figures: List[Dict]


class NelsonParser:
    """Parse Nelson by chapters only"""
    
    def __init__(self):
        # Pattern: "Chapter 1" or "Chapter 342"
        self.chapter_re = re.compile(r'^Chapter\s+(\d+)\s*$', re.IGNORECASE)
        
        # Pattern: "Chapter 1" followed by title on next line(s)
        # e.g., "Chapter 1\nOverview of Pediatrics"
    
    def parse_pages(self, pages: List[Dict]) -> List[Chapter]:
        """Parse pages into chapters"""
        print(f"\n🔍 Parsing {len(pages)} pages by chapters...")
        
        chapters = []
        current_chapter_num = None
        current_chapter_title = ""
        text_buffer = []
        tables_buffer = []
        figures_buffer = []
        chapter_start = pages[0]['page_number']
        
        # Track if we've seen the title line after "Chapter X"
        waiting_for_title = False
        
        for page in pages:
            page_num = page['page_number']
            
            # Stop at page 5773 (index starts after)
            if page_num > 5773:
                break
            
            lines = page['text'].split('\n')
            
            for line in lines:
                line_stripped = line.strip()
                
                if not line_stripped:
                    continue
                
                # Check for "Chapter X" pattern
                chapter_match = self.chapter_re.match(line_stripped)
                
                if chapter_match:
                    # Save previous chapter
                    if current_chapter_num is not None and text_buffer:
                        chapters.append(Chapter(
                            current_chapter_num,
                            current_chapter_title,
                            '\n'.join(text_buffer),
                            chapter_start,
                            page_num - 1,
                            tables_buffer,
                            figures_buffer
                        ))
                        print(f"   ✅ Chapter {current_chapter_num}: {len(text_buffer)} lines")
                    
                    # Start new chapter
                    current_chapter_num = chapter_match.group(1)
                    current_chapter_title = ""
                    text_buffer = []
                    tables_buffer = []
                    figures_buffer = []
                    chapter_start = page_num
                    waiting_for_title = True
                    continue
                
                # Get title (first non-empty line after "Chapter X")
                if waiting_for_title and line_stripped:
                    current_chapter_title = line_stripped
                    waiting_for_title = False
                    text_buffer.append(line)
                    continue
                
                # Regular text
                if current_chapter_num is not None:
                    text_buffer.append(line)
            
            # Add tables and figures
            if current_chapter_num is not None:
                tables_buffer.extend(page['tables'])
                figures_buffer.extend(page['figures'])
            
            if page_num % 500 == 0:
                print(f"   📄 Page {page_num}")
        
        # Save final chapter
        if current_chapter_num is not None and text_buffer:
            chapters.append(Chapter(
                current_chapter_num,
                current_chapter_title,
                '\n'.join(text_buffer),
                chapter_start,
                pages[-1]['page_number'] if pages[-1]['page_number'] <= 5773 else 5773,
                tables_buffer,
                figures_buffer
            ))
            print(f"   ✅ Chapter {current_chapter_num}: {len(text_buffer)} lines")
        
        print(f"\n   ✅ Total chapters found: {len(chapters)}")
        return chapters
    
    def create_chunks(self, chapters: List[Chapter]) -> List[Dict]:
        """Convert chapters to chunks"""
        print(f"\n📦 Creating chunks from {len(chapters)} chapters...")
        
        chunks = []
        for idx, chapter in enumerate(chapters):  # Add enumerate
            text_parts = [
                f"Chapter {chapter.chapter_num}: {chapter.chapter_title}",
                "",
                chapter.text
            ]
            
            # Add tables
            if chapter.tables:
                text_parts.append("\n[TABLES]")
                for i, table in enumerate(chapter.tables, 1):
                    text_parts.append(f"Table {i}:")
                    for row in table['rows']:
                        text_parts.append(' | '.join(str(c) for c in row))
            
            # Add figures
            if chapter.figures:
                text_parts.append("\n[FIGURES]")
                for i, fig in enumerate(chapter.figures, 1):
                    if fig['caption']:
                        text_parts.append(f"Figure {i}: {fig['caption']}")
                    if fig['text']:
                        text_parts.append(fig['text'])
            
            chunks.append({
                'id': f"nelson_ch{chapter.chapter_num}_{idx}",  # Add _{idx} for uniqueness
                'text': '\n'.join(text_parts),
                'metadata': {
                    'source': 'Nelson Textbook of Pediatrics',
                    'chapter_number': chapter.chapter_num,
                    'chapter_title': chapter.chapter_title,
                    'page_start': str(chapter.page_start),
                    'page_end': str(chapter.page_end),
                    'has_tables': str(len(chapter.tables) > 0),
                    'has_figures': str(len(chapter.figures) > 0)
                }
            })
        
        print(f"   ✅ Created {len(chunks)} chunks")
        
        # Stats
        if chunks:
            total_pages = sum(int(c['metadata']['page_end']) - int(c['metadata']['page_start']) + 1 for c in chunks)
            avg_pages = total_pages / len(chunks)
            print(f"   📊 Average: {avg_pages:.1f} pages per chapter")
        
        return chunks