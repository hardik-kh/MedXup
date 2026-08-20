"""
BNF for Children Parser - Page-Boundary Based
Uses exact page ranges from Table of Contents
"""

from typing import List, Dict
from dataclasses import dataclass


@dataclass
class Chunk:
    chunk_type: str
    chapter_num: str
    chapter_title: str
    section_num: str
    section_title: str
    page_start: int
    page_end: int
    text: str
    tables: List[Dict]
    figures: List[Dict]


class BNFParser:
    """Parse BNF using TOC-defined page boundaries"""
    
    def __init__(self):
        # Define all sections with page ranges from TOC
        # Format: (chapter, section_num, section_title, page_start, page_end)
        self.sections = [
            # Chapter 1: Gastro-intestinal system
            ('1', '1', 'Chronic bowel disorders', 30, 40),
            ('1', '2', 'Constipation and bowel cleansing', 41, 52),
            ('1', '3', 'Diarrhoea', 53, 54),
            ('1', '4', 'Disorders of gastric acid and ulceration', 55, 65),
            ('1', '5', 'Food allergy', 66, 66),
            ('1', '6', 'Gastro-intestinal smooth muscle spasm', 66, 68),
            ('1', '7', 'Liver disorders and related conditions', 69, 73),
            ('1', '8', 'Obesity', 72, 73),
            ('1', '9', 'Rectal and anal disorders', 74, 75),
            ('1', '10', 'Reduced exocrine secretions', 76, 77),
            ('1', '11', 'Stoma care', 78, 79),
            
            # Chapter 2: Cardiovascular system
            ('2', '1', 'Arrhythmias', 80, 86),
            ('2', '2', 'Bleeding disorders', 87, 92),
            ('2', '3', 'Blood clots', 93, 103),
            ('2', '4', 'Blood pressure conditions', 104, 131),
            ('2', '5', 'Heart failure', 132, 134),
            ('2', '6', 'Hyperlipidaemia', 135, 141),
            ('2', '7', 'Myocardial ischaemia', 142, 145),
            ('2', '8', 'Oedema', 146, 149),
            ('2', '9', 'Patent ductus arteriosus', 150, 150),
            ('2', '10', 'Vascular disease', 151, 152),
            
            # Chapter 3: Respiratory system
            ('3', '1', 'Airways disease, obstructive', 154, 179),
            ('3', '2', 'Allergic conditions', 180, 193),
            ('3', '3', 'Conditions affecting sputum viscosity', 194, 197),
            ('3', '4', 'Cough and congestion', 198, 199),
            ('3', '5', 'Respiratory depression, respiratory distress syndrome and apnoea', 200, 201),
            
            # Chapter 4: Nervous system
            ('4', '1', 'Epilepsy and other seizure disorders', 203, 240),
            ('4', '2', 'Mental health disorders', 241, 270),
            ('4', '3', 'Movement disorders', 271, 274),
            ('4', '4', 'Nausea and labyrinth disorders', 275, 285),
            ('4', '5', 'Pain', 286, 310),
            ('4', '6', 'Sleep disorders', 311, 312),
            ('4', '7', 'Substance dependence', 313, 317),
            
            # Chapter 5: Infection
            ('5', '1', 'Bacterial infection', 318, 402),
            ('5', '2', 'Fungal infection', 403, 414),
            ('5', '3', 'Helminth infection', 415, 417),
            ('5', '4', 'Protozoal infection', 418, 432),
            ('5', '5', 'Viral infection', 433, 467),
            
            # Chapter 6: Endocrine system
            ('6', '1', 'Antidiuretic hormone disorders', 468, 469),
            ('6', '2', 'Corticosteroid responsive conditions', 470, 480),
            ('6', '3', 'Diabetes mellitus and hypoglycaemia', 481, 503),
            ('6', '4', 'Disorders of bone metabolism', 504, 508),
            ('6', '5', 'Gonadotrophin responsive conditions', 509, 510),
            ('6', '6', 'Hypothalamic and anterior pituitary hormone related disorders', 511, 514),
            ('6', '7', 'Sex hormone responsive conditions', 515, 520),
            ('6', '8', 'Thyroid disorders', 521, 525),
            
            # Chapter 7: Genito-urinary system
            ('7', '1', 'Bladder and urinary disorders', 526, 531),
            ('7', '2', 'Bladder instillations and urological surgery', 532, 532),
            ('7', '3', 'Contraception', 532, 553),
            ('7', '4', 'Vaginal and vulval conditions', 554, 556),
            
            # Chapter 8: Immune system and malignant disease
            ('8', '1', 'Immune system disorders and transplantation', 557, 569),
            ('8', '2', 'Antibody responsive malignancy', 570, 574),
            ('8', '3', 'Cytotoxic responsive malignancy', 575, 601),
            ('8', '4', 'Immunotherapy responsive malignancy', 602, 602),
            ('8', '5', 'Targeted therapy responsive malignancy', 603, 608),
            
            # Chapter 9: Blood and nutrition
            ('9', '1', 'Anaemias', 609, 621),
            ('9', '2', 'Iron overload', 622, 624),
            ('9', '3', 'Neutropenia and stem cell mobilisation', 625, 627),
            ('9', '4', 'Platelet disorders', 627, 629),
            ('9', '5', 'Acid-base imbalance', 630, 630),
            ('9', '6', 'Fluid and electrolyte imbalances', 631, 651),
            ('9', '7', 'Metabolic disorders', 652, 666),
            ('9', '8', 'Mineral and trace elements deficiencies', 667, 667),
            ('9', '9', 'Nutrition (intravenous)', 668, 670),
            ('9', '10', 'Nutrition (oral)', 671, 673),
            ('9', '11', 'Vitamin deficiency', 674, 688),
            
            # Chapter 10: Musculoskeletal system
            ('10', '1', 'Arthritis', 689, 697),
            ('10', '2', 'Neuromuscular disorders', 698, 702),
            ('10', '3', 'Pain and inflammation in musculoskeletal disorders', 703, 713),
            ('10', '4', 'Soft tissue and joint disorders', 714, 717),
            
            # Chapter 11: Eye
            ('11', '1', 'Allergic and inflammatory eye conditions', 718, 722),
            ('11', '2', 'Dry eye conditions', 723, 725),
            ('11', '3', 'Eye infections', 726, 730),
            ('11', '4', 'Eye procedures', 730, 732),
            ('11', '5', 'Glaucoma and ocular hypertension', 733, 738),
            ('11', '6', 'Retinal disorders', 739, 740),
            
            # Chapter 12: Ear, nose and oropharynx
            ('12', '1', 'Otitis externa', 742, 745),
            ('12', '2', 'Removal of earwax', 746, 746),
            ('12', '3', 'Nasal congestion', 748, 749),
            ('12', '4', 'Nasal infection', 750, 750),
            ('12', '5', 'Nasal inflammation, nasal polyps and rhinitis', 751, 753),
            ('12', '6', 'Dry mouth', 754, 754),
            ('12', '7', 'Oral hygiene', 755, 757),
            ('12', '8', 'Oral ulceration and inflammation', 758, 760),
            ('12', '9', 'Oropharyngeal bacterial infections', 761, 761),
            ('12', '10', 'Oropharyngeal fungal infections', 762, 762),
            ('12', '11', 'Oropharyngeal viral infections', 763, 763),
            
            # Chapter 13: Skin
            ('13', '1', 'Dry and scaling skin disorders', 765, 771),
            ('13', '2', 'Infections of the skin', 772, 780),
            ('13', '3', 'Inflammatory skin conditions', 781, 803),
            ('13', '4', 'Perspiration', 803, 803),
            ('13', '5', 'Pruritus', 804, 804),
            ('13', '6', 'Rosacea and acne', 805, 810),
            ('13', '7', 'Scalp and hair conditions', 811, 811),
            ('13', '8', 'Skin cleansers, antiseptics and desloughing agents', 812, 815),
            ('13', '9', 'Skin disfigurement', 816, 816),
            ('13', '10', 'Sun protection and photodamage', 816, 817),
            ('13', '11', 'Superficial soft-tissue injuries and superficial thrombophlebitis', 817, 817),
            ('13', '12', 'Warts and calluses', 818, 820),
            
            # Chapter 14: Vaccines
            ('14', '1', 'Immunoglobulin therapy', 821, 826),
            ('14', '2', 'Post-exposure prophylaxis', 827, 827),
            ('14', '3', 'Tuberculosis diagnostic test', 828, 828),
            ('14', '4', 'Vaccination', 828, 861),
            
            # Chapter 15: Anaesthesia
            ('15', '1', 'Anaesthesia adjuvants', 868, 880),
            ('15', '2', 'Malignant hyperthermia', 880, 880),
            ('15', '3', 'Local anaesthesia', 881, 897),
            
            # Chapter 16: Emergency treatment of poisoning
            ('16', '1', 'Active elimination from the gastrointestinal tract', 898, 898),
            ('16', '2', 'Chemical toxicity', 898, 899),
            ('16', '3', 'Drug toxicity', 899, 903),
            ('16', '4', 'Methaemoglobinaemia', 903, 903),
            ('16', '5', 'Snake bites', 904, 904),
        ]
        
        self.chapter_names = {
            '1': 'Gastro-intestinal system',
            '2': 'Cardiovascular system',
            '3': 'Respiratory system',
            '4': 'Nervous system',
            '5': 'Infection',
            '6': 'Endocrine system',
            '7': 'Genito-urinary system',
            '8': 'Immune system and malignant disease',
            '9': 'Blood and nutrition',
            '10': 'Musculoskeletal system',
            '11': 'Eye',
            '12': 'Ear, nose and oropharynx',
            '13': 'Skin',
            '14': 'Vaccines',
            '15': 'Anaesthesia',
            '16': 'Emergency treatment of poisoning'
        }
    
    def parse_pages(self, pages: List[Dict]) -> List[Chunk]:
        """Parse using page boundaries"""
        print(f"\n🔍 Parsing {len(pages)} pages with TOC boundaries...")
        
        chunks = []
        
        # CHUNK 1: Guidance (pages before 30)
        guidance_text = []
        guidance_tables = []
        guidance_figures = []
        
        for page in pages:
            pnum = page['page_number']- 22
            if pnum >= 23 and pnum < 30:  # Guidance pages
                guidance_text.append(page['text'])
                guidance_tables.extend(page['tables'])
                guidance_figures.extend(page['figures'])
        
        if guidance_text:
            chunks.append(Chunk(
                chunk_type='guidance',
                chapter_num='0',
                chapter_title='Guidance on Prescribing',
                section_num='0',
                section_title='Guidance on Prescribing',
                page_start=23,
                page_end=29,
                text='\n'.join(guidance_text),
                tables=guidance_tables,
                figures=guidance_figures
            ))
            print(f"   ✅ Guidance: pages 23-29")
        
        # CHUNK 2-N: Sections from chapters
        for ch_num, sec_num, sec_title, page_start, page_end in self.sections:
            section_text = []
            section_tables = []
            section_figures = []
            
            for page in pages:
                pnum = page['page_number']- 22
                if pnum >= page_start and pnum <= page_end:
                    section_text.append(page['text'])
                    section_tables.extend(page['tables'])
                    section_figures.extend(page['figures'])
            
            if section_text:
                chunks.append(Chunk(
                    chunk_type='section',
                    chapter_num=ch_num,
                    chapter_title=self.chapter_names[ch_num],
                    section_num=sec_num,
                    section_title=sec_title,
                    page_start=page_start,
                    page_end=page_end,
                    text='\n'.join(section_text),
                    tables=section_tables,
                    figures=section_figures
                ))
                print(f"   ✅ Ch{ch_num}, Sec{sec_num}: {sec_title} (pages {page_start}-{page_end})")
        
        # CHUNK N+: Appendices
        appendices = [
            ('A1', 'Interactions', 905, 1097),
            ('A2', 'Borderline substances', 1098, 1137),
            ('A3', 'Cautionary and advisory labels', 1138, 1140),
        ]
        
        for app_num, app_title, page_start, page_end in appendices:
            app_text = []
            app_tables = []
            app_figures = []
            
            for page in pages:
                pnum = page['page_number']- 22
                if pnum >= page_start and pnum <= page_end:
                    app_text.append(page['text'])
                    app_tables.extend(page['tables'])
                    app_figures.extend(page['figures'])
            
            if app_text:
                chunks.append(Chunk(
                    chunk_type='appendix',
                    chapter_num='A',
                    chapter_title='Appendices',
                    section_num=app_num,
                    section_title=app_title,
                    page_start=page_start,
                    page_end=page_end,
                    text='\n'.join(app_text),
                    tables=app_tables,
                    figures=app_figures
                ))
                print(f"   ✅ Appendix {app_num}: {app_title} (pages {page_start}-{page_end})")
        
        print(f"\n   ✅ Total chunks: {len(chunks)}")
        return chunks
    
    def create_chunks_metadata(self, chunks: List[Chunk]) -> List[Dict]:
        """Convert to embedding format"""
        print(f"\n📦 Creating metadata for {len(chunks)} chunks...")
        
        output = []
        for idx, chunk in enumerate(chunks):
            text_parts = []
            
            if chunk.chunk_type == 'guidance':
                text_parts.append("BNF for Children - Guidance on Prescribing")
            elif chunk.chunk_type == 'appendix':
                text_parts.append(f"BNF for Children - Appendix {chunk.section_num}: {chunk.section_title}")
            else:
                text_parts.append(f"Chapter {chunk.chapter_num}: {chunk.chapter_title}")
                text_parts.append(f"Section {chunk.section_num}: {chunk.section_title}")
            
            text_parts.append("")
            text_parts.append(chunk.text)
            
            if chunk.tables:
                text_parts.append("\n[TABLES]")
                for i, table in enumerate(chunk.tables, 1):
                    text_parts.append(f"Table {i}:")
                    for row in table['rows']:
                        text_parts.append(' | '.join(str(c) for c in row))
            
            if chunk.figures:
                text_parts.append("\n[FIGURES]")
                for i, fig in enumerate(chunk.figures, 1):
                    if fig.get('caption'):
                        text_parts.append(f"Figure {i}: {fig['caption']}")
                    if fig.get('text'):
                        text_parts.append(fig['text'])
            
            output.append({
                'id': f"bnf_ch{chunk.chapter_num}_sec{chunk.section_num}_{idx}",
                'text': '\n'.join(text_parts),
                'metadata': {
                    'source': 'BNF for Children',
                    'chunk_type': chunk.chunk_type,
                    'chapter_number': chunk.chapter_num,
                    'chapter_title': chunk.chapter_title,
                    'section_number': chunk.section_num,
                    'section_title': chunk.section_title,
                    'page_start': str(chunk.page_start),
                    'page_end': str(chunk.page_end)
                }
            })
        
        print(f"   ✅ Created {len(output)} chunks")
        return output