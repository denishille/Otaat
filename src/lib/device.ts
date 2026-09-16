/**
 * Geraete ohne Mauszeiger. Wird einmal beim Laden ausgewertet — ein Wechsel
 * mitten in der Sitzung kommt praktisch nicht vor.
 */
export const isTouch =
  typeof matchMedia !== 'undefined' && matchMedia('(hover: none)').matches

/**
 * Felder sollen sich auf dem Handy nicht selbst den Fokus greifen: iOS
 * schiebt dann sofort Tastatur und Kontakt-Autofill ins Bild, noch bevor man
 * gesehen hat, was das Blatt ueberhaupt fragt. Am Schreibtisch ist genau das
 * dagegen bequem.
 */
export const autoFocusUnlessTouch = !isTouch

/**
 * Sperrt die Vorschlaege, die iOS und Browser sonst ueber ein Textfeld
 * legen — hier wird nie ein Name oder eine Adresse eingegeben.
 */
export const noAutofill = {
  autoComplete: 'off',
  autoCorrect: 'off',
  autoCapitalize: 'sentences',
  spellCheck: false,
} as const
