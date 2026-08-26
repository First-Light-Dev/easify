/**
 * Notes — free-text commentary attached to a deal, person or organization.
 *
 * **v1 only**, and paged the v1 way: `start`/`limit` offsets rather than the cursor paging
 * every v2 collection uses. The client's `paginate` helper does not apply here.
 */

import type { PipedriveHttpClient } from '../client/http-client';
import type {
  PipedriveNote,
  PipedriveNoteInput,
  PipedriveNoteListOptions,
} from '../types/notes';

/** How many notes to pull per page. v1 caps this at 500. */
const PAGE_LIMIT = 100;

export class PipedriveNotes {
  constructor(private readonly http: PipedriveHttpClient) {}

  async list(options: PipedriveNoteListOptions = {}): Promise<PipedriveNote[]> {
    const data = await this.http.get<PipedriveNote[]>(
      'notes',
      { limit: PAGE_LIMIT, ...options },
      { version: 'v1', operation: 'listNotes' }
    );
    return data ?? [];
  }

  /**
   * Every note on a deal, oldest first.
   *
   * Ordered deliberately: where notes are being used to carry instructions, reading them in
   * the order they were written is the only sequence that makes sense to a human.
   */
  async forDeal(dealId: number | string): Promise<PipedriveNote[]> {
    return this.list({ deal_id: Number(dealId), sort: 'add_time' });
  }

  async forOrganization(orgId: number | string): Promise<PipedriveNote[]> {
    return this.list({ org_id: Number(orgId), sort: 'add_time' });
  }

  async forPerson(personId: number | string): Promise<PipedriveNote[]> {
    return this.list({ person_id: Number(personId), sort: 'add_time' });
  }

  async create(input: PipedriveNoteInput): Promise<PipedriveNote> {
    return this.http.post<PipedriveNote>('notes', input, {
      version: 'v1',
      operation: 'createNote',
    });
  }

  async delete(id: number | string): Promise<unknown> {
    return this.http.delete(`notes/${id}`, {
      version: 'v1',
      operation: 'deleteNote',
      recordId: id,
    });
  }
}

/**
 * The readable text of a note.
 *
 * Note `content` is **HTML** — Pipedrive's note editor is rich text, so even a note typed as
 * one plain sentence arrives as `<p>…</p>`, and pasted email addresses arrive as anchor tags.
 * Writing that straight into another system puts markup in front of whoever reads it there,
 * which for a delivery instruction means a picker reading `<p>Leave at the north gate</p>`.
 *
 * Block-level tags become newlines so a multi-line note stays multi-line, `&nbsp;` and the
 * common entities are decoded, and runs of blank lines are collapsed.
 */
export function noteText(note: Pick<PipedriveNote, 'content'> | undefined | null): string {
  if (!note?.content) return '';

  return note.content
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Several notes as one block of text, oldest first, blank ones dropped. */
export function notesText(notes: PipedriveNote[]): string {
  return notes.map(noteText).filter(Boolean).join('\n\n');
}
