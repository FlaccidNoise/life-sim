// The field guide: six short chapters and a glossary in one panel, with a live reading of the
// player's own world beside a chapter. It is a modal `<dialog>`, so the browser traps the focus in
// it and closes it on Escape. The world runs on behind it. Every word is in ./words/guide.ts.

import type { ComponentChild } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { BudBody } from './BudCard';
import {
  closeGuide,
  guideAt,
  guideBrain,
  lastBud,
  lineageAlive,
  mode,
  openGuide,
  stats,
  worldParams,
} from './state';
import { CHANCES, CHAPTERS, GLOSSARY, GUIDE_UI, fill, type EntryId } from './words/guide';

const count = (n: number): string => n.toLocaleString('en-US');
// A chance as a percent, with one decimal where it has one.
const percent = (chance: number): string => `${Math.round(chance * 1000) / 10}%`;

function Rows(props: { rows: [string, string][] }) {
  return (
    <dl class="guide-rows">
      {props.rows.map(([name, value]) => (
        <div key={name}>
          <dt>{name}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

// What a chapter shows of the world that runs. A chapter with none shows no box.
function reading(at: EntryId): ComponentChild {
  switch (at) {
    case 'brain': {
      const b = guideBrain.value;
      return b === null ? (
        <p>{GUIDE_UI.noBody}</p>
      ) : (
        <Rows
          rows={[
            [GUIDE_UI.inputs, count(b.inputs)],
            [GUIDE_UI.hidden, count(b.hidden)],
            [GUIDE_UI.outputs, count(b.outputs)],
            [GUIDE_UI.connections, count(b.connections)],
          ]}
        />
      );
    }
    case 'child': {
      const bud = lastBud.value;
      const params = worldParams.value;
      const chances = CHANCES.flatMap(({ param, label }): [string, string][] => {
        const found = params.find((p) => p.name === param);
        return found ? [[label, percent(found.value)]] : [];
      });
      return (
        <>
          <h5>{GUIDE_UI.chances}</h5>
          <Rows rows={chances} />
          <h5>{GUIDE_UI.lastBud}</h5>
          {bud ? (
            <div class="bud guide-bud">
              <BudBody bud={bud} />
            </div>
          ) : (
            <p>{GUIDE_UI.noBud}</p>
          )}
        </>
      );
    }
    case 'line':
      // In a body the count is that of the counter on the screen, which leaves out the body.
      return (
        <Rows
          rows={
            mode.value === 'play'
              ? [[GUIDE_UI.descendants, count(Math.max(lineageAlive.value - 1, 0))]]
              : [[GUIDE_UI.lineAlive, count(lineageAlive.value)]]
          }
        />
      );
    case 'machine':
      return (
        <Rows
          rows={[
            [GUIDE_UI.tick, count(stats.value.tick)],
            [GUIDE_UI.bodies, count(stats.value.creatures)],
            [GUIDE_UI.plants, count(stats.value.plants)],
          ]}
        />
      );
    default:
      return null;
  }
}

function Page(props: { at: EntryId }) {
  const { at } = props;
  const i = CHAPTERS.findIndex((c) => c.id === at);
  const chapter = CHAPTERS[i];
  if (!chapter) {
    return (
      <>
        <h3>{GUIDE_UI.glossary}</h3>
        <dl class="guide-terms">
          {GLOSSARY.map((entry) => (
            <div key={entry.term}>
              <dt>{entry.term}</dt>
              <dd>{entry.means}</dd>
            </div>
          ))}
        </dl>
      </>
    );
  }
  const live = reading(at);
  const before = CHAPTERS[i - 1];
  const after = CHAPTERS[i + 1];
  return (
    <>
      <p class="guide-n">
        {GUIDE_UI.count.replace('{n}', String(i + 1)).replace('{of}', String(CHAPTERS.length))}
      </p>
      <h3>{chapter.title}</h3>
      {chapter.text.map((paragraph) => (
        <p key={paragraph}>{fill(paragraph)}</p>
      ))}
      {live !== null && (
        <aside class="guide-live">
          <h4>{GUIDE_UI.live}</h4>
          {live}
        </aside>
      )}
      <footer>
        {before && (
          <button type="button" onClick={() => openGuide(before.id)}>
            <small>{GUIDE_UI.back}</small>
            {before.title}
          </button>
        )}
        <button
          type="button"
          class="guide-next"
          onClick={() => openGuide(after ? after.id : 'glossary')}
        >
          <small>{GUIDE_UI.next}</small>
          {after ? after.title : GUIDE_UI.glossary}
        </button>
      </footer>
    </>
  );
}

/** The button that opens the guide. The key G does the same. */
export function GuideToggle() {
  return (
    // The class `leave` gives it the look of the buttons beside it.
    <button
      type="button"
      class="leave"
      aria-haspopup="dialog"
      aria-keyshortcuts="G"
      onClick={() => openGuide()}
    >
      {GUIDE_UI.button} <kbd>G</kbd>
    </button>
  );
}

export function Guide() {
  const dialog = useRef<HTMLDialogElement>(null);
  const at = guideAt.value;
  // The dialog follows the signal: the key G and "More" of a note open it from outside.
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (at !== null && !d.open) d.showModal();
    if (at === null && d.open) d.close();
    // A new page starts at its top, and its place in the row of chapters is on the screen.
    d.querySelector('article')?.scrollTo(0, 0);
    d.querySelector('nav [aria-current]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [at]);
  return (
    <dialog
      ref={dialog}
      class="guide"
      aria-labelledby="guide-title"
      // Escape closes a modal dialog, and so does a click on the water around this one.
      onClose={closeGuide}
      onClick={(e) => {
        if (e.target === e.currentTarget) closeGuide();
      }}
    >
      {at !== null && (
        <>
          <header>
            <h2 id="guide-title">{GUIDE_UI.title}</h2>
            <p>{GUIDE_UI.sub}</p>
            <button
              type="button"
              class="brain-close"
              aria-label={GUIDE_UI.close}
              onClick={closeGuide}
            >
              ×
            </button>
          </header>
          <nav aria-label={GUIDE_UI.chapters}>
            {CHAPTERS.map((c, i) => (
              <button
                type="button"
                key={c.id}
                aria-current={c.id === at ? 'page' : undefined}
                // The dialog puts the focus here when it opens.
                autofocus={c.id === at}
                onClick={() => openGuide(c.id)}
              >
                <b>{i + 1}</b>
                {c.title}
              </button>
            ))}
            <button
              type="button"
              aria-current={at === 'glossary' ? 'page' : undefined}
              autofocus={at === 'glossary'}
              onClick={() => openGuide('glossary')}
            >
              <b>A</b>
              {GUIDE_UI.glossary}
            </button>
          </nav>
          <article>
            <Page at={at} />
          </article>
        </>
      )}
    </dialog>
  );
}
