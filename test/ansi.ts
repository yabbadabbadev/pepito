// Network matcher failure messages carry color (see
// docs/knowledge/salida-coloreada-matchers.md): `this.utils.matcherHint`
// interleaves the ANSI code right between words a test needs to search for
// whole — for example between "not" and the matcher name in the negated
// hint. Without stripping it first, a content assertion would depend on
// exactly where the color cuts, not on what the message says.
const ESC = String.fromCharCode(27)
const ANSI_ESCAPE_SEQUENCE = new RegExp(`${ESC}\\[[0-9;]*m`, 'g')

/** Strips ANSI color codes from a failure message, to search for text that spans across them. */
export function stripAnsi(text: string): string {
  return text.replace(ANSI_ESCAPE_SEQUENCE, '')
}
