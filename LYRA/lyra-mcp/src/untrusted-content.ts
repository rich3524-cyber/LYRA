// XML-tag framing for third-party content (comments, reviews, trend data)
// returned into Claude's context -- Claude models are trained to respect XML
// tag boundaries as data-not-instruction. Any closing-tag-like sequence
// inside the source text is neutralized so hostile content can't prematurely
// terminate the wrapper and inject content that reads as trusted.
//
// Claude isn't parsing this as structural XML -- it's pattern-matching on the
// trust-boundary convention this function establishes. So the match is
// case-insensitive and tolerant of stray whitespace around the slash/brackets
// (e.g. "</UNTRUSTED_EXTERNAL_CONTENT>", "</ untrusted_external_content >"),
// not just an exact literal-string match, since near-exact variants are a
// real bypass shape for this kind of injection, not just a theoretical one.
//
// The neutralization inserts a zero-width space (U+200B, built via
// String.fromCharCode rather than a literal invisible character in this
// source file) right after the "<" of any matched closing tag so the
// sequence is broken up but the visible text is unaffected when rendered.
const ZERO_WIDTH_SPACE = String.fromCharCode(0x200b)

const CLOSING_TAG_PATTERN = /<\s*\/\s*untrusted_external_content\s*>/gi

// NOTE: `source` is interpolated into the wrapper's attribute unescaped. It
// must be a static, caller-controlled string (e.g. 'instagram_comment'), not
// a value derived from untrusted input -- it is not quote-escaped here.
export function wrapUntrusted(text: string, source: string): string {
  const neutralized = text.replace(
    CLOSING_TAG_PATTERN,
    (match) => `<${ZERO_WIDTH_SPACE}${match.slice(1)}`
  )
  return `<untrusted_external_content source="${source}">${neutralized}</untrusted_external_content>`
}
