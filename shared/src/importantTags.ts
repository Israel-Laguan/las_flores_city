const IMPORTANT_REGEX = /<important>.*?<\/important>/gs;

/**
 * Ensures that any text wrapped in <important>…</important> tags in the
 * `original` string survives the LLM rewrite intact.
 *
 * Contract (§4.1 of the BYOK spec):
 *  - If `original` has zero <important> tags, the rewritten text is returned
 *    unchanged.
 *  - If `original` has tags and `rewritten` has them too, each tag in
 *    `rewritten` is replaced (in order) with the corresponding tag from
 *    `original`. This catches the case where the LLM preserves the tag
 *    structure but paraphrases the clue text.
 *  - If `original` has tags but `rewritten` drops them, the function
 *    REJECTS the rewrite for that choice entirely and returns the original
 *    string. Showing the standard text is safer than losing a critical,
 *    unclickable puzzle clue.
 */
export function preserveImportantTags(original: string, rewritten: string): string {
  const originalTags = original.match(IMPORTANT_REGEX) || [];

  if (originalTags.length === 0) return rewritten;

  const rewrittenTags = rewritten.match(IMPORTANT_REGEX) || [];
  if (rewrittenTags.length === 0) return original;

  let tagIndex = 0;
  return rewritten.replace(IMPORTANT_REGEX, () => {
    return tagIndex < originalTags.length ? originalTags[tagIndex++] : '';
  });
}
