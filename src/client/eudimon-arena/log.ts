/**
 * "Under the hood" panel of the EUDIMON arena: one entry per turn with the
 * presentation request, the disclosed claims and what Gary still doesn't know.
 */

import type { LogEntry } from './battle';

/** All claims of an EUDIMON credential (eudiplo-config/playground/issuance/credentials/eudimon-*.json) */
export const CREDENTIAL_CLAIMS = [
  'species',
  'nickname',
  'dex_number',
  'type',
  'level',
  'trainer_name',
  'trainer_id',
  'move_1',
  'move_2',
  'move_3',
  'move_4',
];

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

function rows(pairs: [string, string][]): HTMLDListElement {
  const list = element('dl', 'log-rows');
  for (const [label, value] of pairs) {
    list.append(element('dt', undefined, label), element('dd', undefined, value));
  }
  return list;
}

function chips(names: string[], className: string): HTMLElement {
  const list = element('ul', 'log-chips');
  for (const name of names) {
    list.append(element('li', className, name));
  }
  return list;
}

/** Claims Gary has not seen in any response so far */
export function neverShared(log: LogEntry[]): string[] {
  const seen = new Set(log.flatMap((entry) => entry.received.map(([claim]) => claim)));
  return CREDENTIAL_CLAIMS.filter((claim) => !seen.has(claim));
}

export function renderLog(list: HTMLOListElement, summary: HTMLElement, log: LogEntry[]): void {
  const requests = log.filter((entry) => entry.configId).length;
  const hidden = neverShared(log);
  summary.replaceChildren(
    element('span', undefined, `${requests} wallet request${requests === 1 ? '' : 's'} so far. `),
    element('span', undefined, 'Never shared: '),
    hidden.length > 0
      ? chips(hidden, 'chip hidden-claim')
      : element('strong', undefined, 'nothing, Gary knows everything.')
  );

  const seen = new Set<string>();
  list.replaceChildren(
    ...log
      .map((entry, index) => {
        const item = element('li', 'log-entry');
        const details = element('details');
        details.open = index === log.length - 1;

        const title = element('summary');
        const shared = entry.received.length;
        const fresh = entry.received.filter(([claim]) => !seen.has(claim)).length;
        entry.received.forEach(([claim]) => seen.add(claim));
        title.append(
          element('span', 'log-turn', `Turn ${entry.turn}`),
          ` ${entry.title} `,
          element(
            'span',
            'log-count',
            entry.configId
              ? `${shared} claim${shared === 1 ? '' : 's'} shared, ${fresh} new`
              : 'no request'
          )
        );
        details.append(title);

        const body = element('div', 'log-body');
        if (entry.configId) {
          body.append(
            rows([
              ['Request', entry.configId],
              ['Via', entry.method],
              ['Session', entry.sessionId ?? '-'],
            ]),
            element('h3', undefined, 'Asked for'),
            chips(entry.requested, 'chip'),
            element('h3', undefined, 'Received'),
            rows(entry.received)
          );
          if (entry.meta.length > 0) {
            body.append(element('h3', undefined, 'Credential'), rows(entry.meta));
          }
        }
        if (entry.note) {
          body.append(element('p', 'log-note', entry.note));
        }
        details.append(body);
        item.append(details);
        return item;
      })
      .reverse()
  );
}
