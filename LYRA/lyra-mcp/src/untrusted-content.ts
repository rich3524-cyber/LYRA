// XML-tag framing for third-party content (comments, reviews, trend data)
// returned into Claude's context -- Claude models are trained to respect XML
// tag boundaries as data-not-instruction. Any literal closing-tag sequence
// inside the source text is neutralized so hostile content can't prematurely
// terminate the wrapper and inject content that reads as trusted.
//
// The neutralization inserts a zero-width space (U+200B, built via
// String.fromCharCode rather than a literal invisible character in this
// source file) between "<" and "/" so the sequence is broken up but the
// visible text is unaffected when rendered.
const ZERO_WIDTH_SPACE = String.fromCharCode(0x200b)

export function wrapUntrusted(text: string, source: string): string {
  const neutralized = text.replaceAll(
    '</untrusted_external_content>',
    `<${ZERO_WIDTH_SPACE}/untrusted_external_content>`
  )
  return `<untrusted_external_content source="${source}">${neutralized}</untrusted_external_content>`
}
