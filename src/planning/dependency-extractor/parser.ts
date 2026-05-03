import type { EpicDoc, EpicPhase } from './types.js';

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export function parseEpicMarkdown(text: string): EpicDoc {
  const titleMatch = text.match(/^#\s+(.+)/m);
  const title = titleMatch ? titleMatch[1].trim() : 'unknown';

  const headingRegex = /^###\s+(.+)/gm;
  const sections: Array<{ name: string; start: number }> = [];
  let match: RegExpExecArray | null;

  while ((match = headingRegex.exec(text)) !== null) {
    sections.push({ name: match[1].trim(), start: match.index });
  }

  if (sections.length === 0) {
    return { title: 'unknown', phases: [] };
  }

  const phases: EpicPhase[] = sections.map((section, i) => {
    const sectionEnd = i + 1 < sections.length ? sections[i + 1].start : text.length;
    const sectionText = text.slice(section.start, sectionEnd);

    const depMatch = sectionText.match(/\*\*Dependencies\*\*:\s*(.+)|Dependencies:\s*(.+)/i);
    const depRaw = depMatch ? (depMatch[1] ?? depMatch[2]).trim() : 'None';

    let dependencies: string[] = [];
    if (depRaw.toLowerCase() !== 'none') {
      dependencies = depRaw
        .split(',')
        .map((d) => slugify(d.trim()))
        .filter((d) => d.length > 0);
    }

    return {
      id: slugify(section.name),
      name: section.name,
      dependencies,
    };
  });

  return { title, phases };
}
