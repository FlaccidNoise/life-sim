// A note: the "?" mark on the thing that it explains, and the note itself, open in place. Neither
// holds a hook, and neither touches the world: it runs on under an open note.

import { noteOpen, openGuide, toggleNote } from './state';
import { CHAPTERS } from './words/guide';
import { NOTE, NOTE_UI, type NoteId } from './words/notes';

/** The mark. A real button: its label says what it opens. */
export function NoteMark(props: { id: NoteId }) {
  const { id } = props;
  return (
    <button
      type="button"
      class="mark"
      aria-label={`${NOTE_UI.mark} ${NOTE[id].about}`}
      aria-expanded={noteOpen.value === id}
      aria-controls={`note-${id}`}
      onClick={() => toggleNote(id)}
    >
      ?
    </button>
  );
}

/** The note, where it is open: its sentences, then "More", which opens the guide at its chapter. */
export function Note(props: { id: NoteId }) {
  const { id } = props;
  if (noteOpen.value !== id) return null;
  const { text, more } = NOTE[id];
  const chapter = CHAPTERS.find((c) => c.id === more);
  return (
    <aside class="note" id={`note-${id}`} role="note">
      <span>{text}</span>
      <button
        type="button"
        class="note-more"
        aria-label={`${NOTE_UI.moreLabel} ${chapter?.title ?? ''}`}
        onClick={() => openGuide(more)}
      >
        {NOTE_UI.more}
      </button>
    </aside>
  );
}
