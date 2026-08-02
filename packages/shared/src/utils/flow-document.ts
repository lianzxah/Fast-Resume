import type {
  FlowDocument,
  LayoutFragmentId,
  LogicalBlockId,
  LogicalContentBlock,
  LogicalTextRole,
  ResumeData,
  ResumeSemanticRef,
} from '../types';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function ensureItemId(
  kind: 'experience' | 'education' | 'projects' | 'custom',
  id: string,
  item: unknown,
  index: number
): string {
  if (id.trim()) return id;
  return `${kind}_${stableHash(`${JSON.stringify(item)}:${index}`)}`;
}

export function normalizeResumeDataItemIds(data: ResumeData): ResumeData {
  const normalized = clone(data);
  const normalizeCollection = <T extends { id: string }>(
    kind: 'experience' | 'education' | 'projects' | 'custom',
    items: T[]
  ) => {
    const seen = new Set<string>();
    items.forEach((item, index) => {
      let id = ensureItemId(kind, item.id, item, index);
      if (seen.has(id)) id = `${kind}_${stableHash(`${JSON.stringify(item)}:${index}:duplicate`)}`;
      item.id = id;
      seen.add(id);
    });
  };
  normalizeCollection('experience', normalized.experience);
  normalizeCollection('education', normalized.education);
  normalizeCollection('projects', normalized.projects);
  normalizeCollection('custom', normalized.customSections);
  return normalized;
}

function idPart(value: string): string {
  return encodeURIComponent(value || 'root');
}

export function createLogicalBlockId(ref: ResumeSemanticRef): LogicalBlockId {
  return `flow:${ref.section}:${idPart(ref.itemId ?? 'root')}:${idPart(
    ref.field ?? ref.role ?? 'body'
  )}`;
}

export function createLayoutFragmentId(
  blockId: LogicalBlockId,
  fragmentIndex: number
): LayoutFragmentId {
  return `${blockId}::fragment:${fragmentIndex}`;
}

interface AddBlockOptions {
  role?: LogicalTextRole;
  sync?: 'scalar' | 'lines' | 'readonly';
  keepTogether?: boolean;
  breakPolicy?: 'between-lines' | 'between-items' | 'avoid';
}

function compileSectionBlocks(data: ResumeData): Record<string, LogicalContentBlock[]> {
  const sections: Record<string, LogicalContentBlock[]> = {};

  const add = (
    sectionKey: string,
    semanticRef: ResumeSemanticRef,
    content: string,
    options: AddBlockOptions = {}
  ) => {
    const block: LogicalContentBlock = {
      id: createLogicalBlockId(semanticRef),
      semanticRef,
      content,
      style: { role: options.role ?? 'body' },
      layout: {
        role: 'flow',
        regionId: 'main',
        groupId: `semantic:${semanticRef.section}:${semanticRef.itemId ?? 'root'}`,
        keepTogether: options.keepTogether,
        breakPolicy: options.breakPolicy ?? 'between-lines',
      },
      source: { kind: 'resumeData', sync: options.sync ?? 'scalar' },
    };
    (sections[sectionKey] ??= []).push(block);
  };

  const personalFields = [
    'name',
    'title',
    'email',
    'phone',
    'location',
    'website',
    'linkedin',
    'github',
  ] as const;
  personalFields.forEach((field) =>
    add(
      'personalInfo',
      { section: 'personalInfo', field, role: field === 'name' ? 'itemTitle' : 'metadata' },
      data.personalInfo[field] ?? '',
      { role: field === 'name' ? 'name' : field === 'title' ? 'headline' : 'metadata' }
    )
  );
  add(
    'summary',
    { section: 'summary', field: 'summary', role: 'itemBody' },
    data.personalInfo.summary ?? '',
    { breakPolicy: 'between-lines' }
  );

  data.experience.forEach((item) => {
    const key = 'experience';
    const scalarFields = ['company', 'position', 'startDate', 'endDate', 'location'] as const;
    scalarFields.forEach((field) =>
      add(
        key,
        {
          section: 'experience',
          itemId: item.id,
          field,
          role: field === 'position' ? 'itemTitle' : 'metadata',
        },
        item[field] ?? '',
        { role: field === 'position' ? 'itemTitle' : 'metadata', keepTogether: true }
      )
    );
    add(
      key,
      { section: 'experience', itemId: item.id, field: 'descriptions', role: 'itemBody' },
      item.descriptions.join('\n'),
      { sync: 'lines', breakPolicy: 'between-items' }
    );
    add(
      key,
      { section: 'experience', itemId: item.id, field: 'highlights', role: 'itemBody' },
      (item.highlights ?? []).join('\n'),
      { sync: 'lines', breakPolicy: 'between-items' }
    );
  });

  data.projects.forEach((item) => {
    const scalarFields = ['name', 'role', 'startDate', 'endDate', 'description', 'link'] as const;
    scalarFields.forEach((field) =>
      add(
        'projects',
        {
          section: 'projects',
          itemId: item.id,
          field,
          role: field === 'name' ? 'itemTitle' : field === 'description' ? 'itemBody' : 'metadata',
        },
        item[field] ?? '',
        { role: field === 'name' ? 'itemTitle' : field === 'description' ? 'body' : 'metadata' }
      )
    );
    add(
      'projects',
      { section: 'projects', itemId: item.id, field: 'techStack', role: 'itemBody' },
      (item.techStack ?? []).join('\n'),
      { sync: 'lines', breakPolicy: 'between-items' }
    );
  });

  data.education.forEach((item) => {
    const scalarFields = ['school', 'degree', 'major', 'startDate', 'endDate', 'gpa'] as const;
    scalarFields.forEach((field) =>
      add(
        'education',
        {
          section: 'education',
          itemId: item.id,
          field,
          role: field === 'school' ? 'itemTitle' : 'metadata',
        },
        item[field] ?? '',
        { role: field === 'school' ? 'itemTitle' : 'metadata', keepTogether: true }
      )
    );
    add(
      'education',
      { section: 'education', itemId: item.id, field: 'achievements', role: 'itemBody' },
      (item.achievements ?? []).join('\n'),
      { sync: 'lines', breakPolicy: 'between-items' }
    );
  });

  add(
    'skills',
    { section: 'skills', field: 'skills', role: 'itemBody' },
    data.skills
      .map((group) => `${group.category}: ${group.items.map((item) => item.name).join('、')}`)
      .join('\n'),
    { sync: 'readonly', breakPolicy: 'between-items' }
  );
  add(
    'certifications',
    { section: 'certifications', field: 'certifications', role: 'itemBody' },
    data.certifications
      .map((item) => [item.name, item.issuer, item.date].filter(Boolean).join(' · '))
      .join('\n'),
    { sync: 'readonly', breakPolicy: 'between-items' }
  );

  data.customSections.forEach((section) => {
    const key = `custom:${section.id}`;
    add(
      key,
      { section: 'custom', itemId: section.id, field: 'title', role: 'sectionTitle' },
      section.title,
      { role: 'sectionTitle', keepTogether: true }
    );
    add(
      key,
      { section: 'custom', itemId: section.id, field: 'items', role: 'itemBody' },
      section.items
        .map((item) =>
          [item.title, item.subtitle, item.date, item.description, ...(item.details ?? [])]
            .filter(Boolean)
            .join('\n')
        )
        .join('\n'),
      { sync: 'readonly', breakPolicy: 'between-items' }
    );
  });

  return sections;
}

export function resumeDataToFlowDocument(input: ResumeData): FlowDocument {
  const semanticData = normalizeResumeDataItemIds(input);
  const sections = compileSectionBlocks(semanticData);
  const canonical = [
    'summary',
    'experience',
    'projects',
    'education',
    'skills',
    'certifications',
    ...semanticData.customSections.map((section) => `custom:${section.id}`),
  ];
  const requested = [...new Set(semanticData.sectionOrder ?? canonical)];
  const sectionOrder = [
    'personalInfo',
    ...requested,
    ...canonical.filter((section) => !requested.includes(section)),
  ];
  const blocks = sectionOrder.flatMap((section) => sections[section] ?? []);

  return {
    schemaVersion: 1,
    blocks,
    order: blocks.map((block) => block.id),
    semanticData,
  };
}

function nonEmptyLines(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export interface LogicalBlockEditResult {
  document: FlowDocument;
  semanticSync: 'synchronized' | 'unmapped';
}

export function applyLogicalBlockContentEdit(
  input: FlowDocument,
  blockId: LogicalBlockId,
  content: string
): LogicalBlockEditResult {
  const document = clone(input);
  const block = document.blocks.find((candidate) => candidate.id === blockId);
  if (!block) throw new Error(`Logical block not found: ${blockId}`);
  block.content = content;
  delete block.segments;

  const ref = block.semanticRef;
  const semanticData = document.semanticData;
  if (!ref || !semanticData || block.source?.sync === 'readonly') {
    return { document, semanticSync: 'unmapped' };
  }

  const nextValue = block.source?.sync === 'lines' ? nonEmptyLines(content) : content;
  if (ref.section === 'personalInfo' || ref.section === 'summary') {
    const field = ref.section === 'summary' ? 'summary' : ref.field;
    if (field) {
      (semanticData.personalInfo as unknown as Record<string, unknown>)[field] = nextValue;
      return { document, semanticSync: 'synchronized' };
    }
  }

  const collection =
    ref.section === 'experience'
      ? semanticData.experience
      : ref.section === 'projects'
        ? semanticData.projects
        : ref.section === 'education'
          ? semanticData.education
          : ref.section === 'custom'
            ? semanticData.customSections
            : undefined;
  const item = collection?.find((candidate) => candidate.id === ref.itemId);
  if (item && ref.field) {
    (item as unknown as Record<string, unknown>)[ref.field] = nextValue;
    return { document, semanticSync: 'synchronized' };
  }

  return { document, semanticSync: 'unmapped' };
}
