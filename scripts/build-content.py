#!/usr/bin/env python3
"""Convert content/*.md to content.json for the portfolio."""
import json
import re
import yaml
from pathlib import Path

CONTENT_DIR = Path(__file__).parent.parent / 'content'
OUTPUT_FILE = CONTENT_DIR / 'content.json'

def parse_markdown(filepath):
    """Parse markdown with YAML frontmatter and structured content."""
    text = filepath.read_text(encoding='utf-8')
    
    # Extract frontmatter
    fm_match = re.match(r'^---\n(.*?)\n---', text, re.DOTALL)
    if not fm_match:
        raise ValueError(f'No frontmatter in {filepath}')
    
    frontmatter = yaml.safe_load(fm_match.group(1))
    body = text[fm_match.end():].strip()
    
    return frontmatter, body

def parse_residence(body, fm):
    """Parse residence content with skills sections."""
    # Split intro and skills
    parts = re.split(r'\n## Skills\n', body, maxsplit=1)
    intro_section = parts[0].strip()
    
    # Extract highlights (line starting with "Quests:") from intro_section
    intro_lines = intro_section.split('\n')
    highlights = ''
    intro_lines_filtered = []
    for line in intro_lines:
        if line.strip().startswith('Quests:'):
            highlights = line.strip()
        else:
            intro_lines_filtered.append(line)
    intro = '\n'.join(intro_lines_filtered).strip()
    
    skills = []
    if len(parts) > 1:
        # Parse skill groups
        skill_sections = re.split(r'\n### ', parts[1])
        for sec in skill_sections:
            sec = sec.strip()
            if not sec:
                continue
            lines = sec.split('\n')
            category = lines[0].strip()
            items = [re.sub(r'^[-*]\s*', '', l).strip() for l in lines[1:] if l.strip().startswith(('-', '*'))]
            if items:
                skills.append({'category': category, 'items': items})
    
    return {
        **fm,
        'intro': intro,
        'highlights': highlights,
        'skills': skills
    }

def parse_entries_building(body, fm):
    """Parse library, smith, market, tavern with entries."""
    parts = re.split(r'\n## Entries\n', body, maxsplit=1)
    intro = parts[0].strip()
    
    entries = []
    if len(parts) > 1:
        # Each entry starts with ### Title
        entry_blocks = re.split(r'\n### ', parts[1])
        for block in entry_blocks:
            block = block.strip()
            if not block:
                continue
            lines = block.split('\n')
            title = lines[0].strip()
            
            # Parse meta line: **Type · Year** | URL
            meta = ''
            url = ''
            desc = ''
            for line in lines[1:]:
                line = line.strip()
                if line.startswith('**') and '|' in line:
                    # **Meta** | URL
                    meta_part, url_part = line.split('|', 1)
                    meta = meta_part.strip('* ').strip()
                    url = url_part.strip()
                elif line and not line.startswith('#'):
                    desc = line
            
            entry = {'title': title}
            if meta:
                entry['meta'] = meta
            if url:
                entry['url'] = url
            if desc:
                entry['desc'] = desc
            # Use building's pointer as default icon
            if fm.get('pointer'):
                entry['icon'] = fm['pointer'].replace('assets/', '')
            entries.append(entry)
    
    return {
        **fm,
        'intro': intro,
        'entries': entries
    }

def main():
    site_data = {'title': "Cliff's Town", 'tagline': 'A walkable portfolio — pick a building, read its scroll.'}
    buildings = []
    
    # Parse site.md
    site_fm, _ = parse_markdown(CONTENT_DIR / 'site.md')
    site_data.update(site_fm)
    
    # Parse each building
    building_files = {
        'residence.md': parse_residence,
        'library.md': parse_entries_building,
        'smith.md': parse_entries_building,
        'market.md': parse_entries_building,
        'tavern.md': parse_entries_building,
    }
    
    for fname, parser in building_files.items():
        fpath = CONTENT_DIR / fname
        if not fpath.exists():
            print(f'Warning: {fname} not found, skipping')
            continue
        fm, body = parse_markdown(fpath)
        building = parser(body, fm)
        buildings.append(building)
    
    output = {'site': site_data, 'buildings': buildings}
    OUTPUT_FILE.write_text(json.dumps(output, indent=2, ensure_ascii=False), encoding='utf-8')
    print(f'Generated {OUTPUT_FILE}')

if __name__ == '__main__':
    main()