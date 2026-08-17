// Los mensajes de fallo de los matchers de red llevan color (ver
// docs/knowledge/salida-coloreada-matchers.md): `this.utils.matcherHint`
// intercala el código ANSI justo entre palabras que un test necesita buscar
// enteras — por ejemplo entre "not" y el nombre del matcher en el hint
// negado. Sin quitarlo antes, una aserción de contenido dependería de dónde
// exactamente corta el color, no de lo que el mensaje dice.
const ESC = String.fromCharCode(27)
const ANSI_ESCAPE_SEQUENCE = new RegExp(`${ESC}\\[[0-9;]*m`, 'g')

/** Quita los códigos ANSI de color de un mensaje de fallo, para buscar texto que los atraviesa. */
export function stripAnsi(text: string): string {
  return text.replace(ANSI_ESCAPE_SEQUENCE, '')
}
