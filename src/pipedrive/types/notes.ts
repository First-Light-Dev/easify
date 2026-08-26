/**
 * Note shapes. **v1 only** — notes have not moved to API v2.
 *
 * `content` is **HTML**, not plain text. Pipedrive's UI is a rich-text editor, so a note
 * typed as a plain sentence still arrives wrapped in markup, and anything written straight
 * into another system carries tags with it.
 */

export interface PipedriveNote {
    id: number;
    /** HTML. Use `noteText()` to get something safe to write into a plain-text field. */
    content?: string;
    deal_id?: number | null;
    person_id?: number | null;
    org_id?: number | null;
    lead_id?: string | null;
    user_id?: number;
    add_time?: string;
    update_time?: string;
    pinned_to_deal_flag?: boolean;
    [key: string]: unknown;
}

export interface PipedriveNoteInput {
    content: string;
    deal_id?: number;
    person_id?: number;
    org_id?: number;
    pinned_to_deal_flag?: boolean;
}

export interface PipedriveNoteListOptions {
    deal_id?: number;
    person_id?: number;
    org_id?: number;
    /** `id`, `add_time` or `update_time`, optionally suffixed with ` DESC`. */
    sort?: string;
    start?: number;
    limit?: number;
    [key: string]: unknown;
}
