/**
 * Arabic (and Arabic-Indic digits) → Latin transliteration shared by every
 * URL-slug generator (catalog products/categories, identity stores).
 *
 * The mapping covers the full Arabic block (letters U+0621..U+064A, the
 * hamza forms, tatweel, taa-marbuta and the Arabic-Indic digit ranges
 * U+0660..U+0669 and U+06F0..U+06F9) plus the Arabic diacritics (tashkeel),
 * which are dropped. Characters outside this map pass through unchanged so
 * Latin text, digits and punctuation are preserved verbatim.
 *
 * This is a best-effort, implementation-specific transliteration (the exact
 * algorithm is deliberately NOT specified by the product requirements): the
 * only hard requirement is that a non-empty Arabic name must produce a
 * non-empty, URL-safe slug candidate.
 */
const ARABIC_TRANSLITERATION: ReadonlyArray<readonly [RegExp, string]> = [
  // Tashkeel / diacritics are dropped entirely.
  [/[\u064B-\u0655\u0670\u0640]/g, ''],
  // Digits.
  [/[\u0660]/g, '0'],
  [/[\u0661]/g, '1'],
  [/[\u0662]/g, '2'],
  [/[\u0663]/g, '3'],
  [/[\u0664]/g, '4'],
  [/[\u0665]/g, '5'],
  [/[\u0666]/g, '6'],
  [/[\u0667]/g, '7'],
  [/[\u0668]/g, '8'],
  [/[\u0669]/g, '9'],
  [/[\u06F0]/g, '0'],
  [/[\u06F1]/g, '1'],
  [/[\u06F2]/g, '2'],
  [/[\u06F3]/g, '3'],
  [/[\u06F4]/g, '4'],
  [/[\u06F5]/g, '5'],
  [/[\u06F6]/g, '6'],
  [/[\u06F7]/g, '7'],
  [/[\u06F8]/g, '8'],
  [/[\u06F9]/g, '9'],
  // Alef / hamza forms.
  [/[\u0622\u0623\u0621\u0627\u0649]/g, 'a'],
  [/[\u0625]/g, 'e'],
  [/[\u0624]/g, 'w'],
  [/[\u0626]/g, 'y'],
  // Consonants.
  [/[\u0628]/g, 'b'],
  [/[\u0629]/g, 'a'],
  [/[\u062A]/g, 't'],
  [/[\u062B]/g, 'th'],
  [/[\u062C]/g, 'j'],
  [/[\u062D]/g, 'h'],
  [/[\u062E]/g, 'kh'],
  [/[\u062F]/g, 'd'],
  [/[\u0630]/g, 'dh'],
  [/[\u0631]/g, 'r'],
  [/[\u0632]/g, 'z'],
  [/[\u0633]/g, 's'],
  [/[\u0634]/g, 'sh'],
  [/[\u0635]/g, 's'],
  [/[\u0636]/g, 'd'],
  [/[\u0637]/g, 't'],
  [/[\u0638]/g, 'z'],
  [/[\u0639]/g, 'a'],
  [/[\u063A]/g, 'gh'],
  [/[\u0641]/g, 'f'],
  [/[\u0642]/g, 'q'],
  [/[\u0643]/g, 'k'],
  [/[\u0644]/g, 'l'],
  [/[\u0645]/g, 'm'],
  [/[\u0646]/g, 'n'],
  [/[\u0647]/g, 'h'],
  [/[\u0648]/g, 'w'],
  [/[\u064A]/g, 'y'],
];

/**
 * Transliterates Arabic script in a name to Latin letters so a multilingual
 * name can produce a URL-safe slug. Applied BEFORE normalization so pure-Arabic
 * names never collapse to an empty candidate.
 */
export function transliterateArabic(input: string): string {
  let output = input;
  for (const [pattern, replacement] of ARABIC_TRANSLITERATION) {
    output = output.replace(pattern, replacement);
  }
  return output;
}
