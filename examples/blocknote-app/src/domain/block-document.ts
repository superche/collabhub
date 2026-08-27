export interface PortableBlockRecord {
  id: string
  orderKey: string
  block: Record<string, unknown>
}

export interface BlockDocument {
  id: string
  blocks: PortableBlockRecord[]
}

export type BlockCommand =
  | { type: 'block.insert'; block: Record<string, unknown>; afterId?: string }
  | { type: 'block.update'; block: Record<string, unknown> }
  | { type: 'block.delete'; blockId: string }
  | { type: 'block.move'; blockId: string; afterId?: string }

export interface BlockCommandResult {
  ok: boolean
  canonicalVersion: number
  reason?: string
}

function inlineText(text: string) {
  return [{ type: 'text', text, styles: {} }]
}

export function initialBlockDocument(id: string): BlockDocument {
  return {
    id,
    blocks: [
      {
        id: 'welcome', orderKey: '1024',
        block: {
          id: 'welcome', type: 'heading',
          props: { textColor: 'default', backgroundColor: 'default', textAlignment: 'left', level: 1, isToggleable: false },
          content: inlineText('CollabHub × BlockNote'), children: [],
        },
      },
      {
        id: 'intro', orderKey: '2048',
        block: {
          id: 'intro', type: 'paragraph',
          props: { textColor: 'default', backgroundColor: 'default', textAlignment: 'left' },
          content: inlineText('Edit this block from either browser.'), children: [],
        },
      },
      {
        id: 'notes', orderKey: '3072',
        block: {
          id: 'notes', type: 'bulletListItem',
          props: { textColor: 'default', backgroundColor: 'default', textAlignment: 'left' },
          content: inlineText('Changes travel as incremental block operations.'), children: [],
        },
      },
    ],
  }
}
