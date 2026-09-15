import type { Cadence } from '../lib/types'

export interface Preset {
  id: string
  title: string
  category: string
  cadence: Cadence
  /** Vorlauf in Tagen, ab wann es im Radar auftaucht */
  lead: number
  note?: string
}

/** Kurzform: every(n, unit) */
const e = (n: number, unit: 'day' | 'week' | 'month' | 'year'): Cadence => ({ type: 'every', n, unit })

export const CATEGORIES = [
  'Körper',
  'Zähne & Augen',
  'Kopf',
  'Auto & Fahren',
  'Rad & ÖPNV',
  'Wohnen',
  'Haushalt & Technik',
  'Geld',
  'Verträge & Abos',
  'Versicherung',
  'Vorsorge & Ernstfall',
  'Ämter & Papiere',
  'Studium',
  'Job',
  'Digital',
  'Menschen',
  'Haustier',
  'Klamotten & Kram',
  'Saison',
] as const

/* Ein Regal fuer alles, was im Erwachsenenleben irgendwann anklopft.
   Nichts davon ist Pflicht — man zieht sich raus, was einen betrifft. */
export const CATALOG: Preset[] = [
  /* ---------------- Körper ---------------- */
  { id: 'checkup',        title: 'Gesundheits-Check beim Hausarzt',        category: 'Körper', cadence: e(3, 'year'), lead: 30 },
  { id: 'blood',          title: 'Großes Blutbild',                        category: 'Körper', cadence: e(1, 'year'), lead: 21 },
  { id: 'skin',           title: 'Hautkrebsscreening',                     category: 'Körper', cadence: e(2, 'year'), lead: 30 },
  { id: 'derma-moles',    title: 'Muttermale selbst abchecken',            category: 'Körper', cadence: e(3, 'month'), lead: 3 },
  { id: 'tetanus',        title: 'Tetanus-Auffrischung',                   category: 'Körper', cadence: e(10, 'year'), lead: 60 },
  { id: 'flu',            title: 'Grippeimpfung',                          category: 'Körper', cadence: e(1, 'year'), lead: 21 },
  { id: 'vacc-check',     title: 'Impfpass durchsehen',                    category: 'Körper', cadence: e(2, 'year'), lead: 30 },
  { id: 'urologist',      title: 'Urologe / Gynäkologe',                   category: 'Körper', cadence: e(1, 'year'), lead: 30 },
  { id: 'physio',         title: 'Physio-Rezept einlösen',                 category: 'Körper', cadence: e(6, 'month'), lead: 14 },
  { id: 'meds',           title: 'Hausapotheke ausmisten',                 category: 'Körper', cadence: e(1, 'year'), lead: 7 },
  { id: 'blood-donate',   title: 'Blut spenden',                           category: 'Körper', cadence: e(4, 'month'), lead: 7 },
  { id: 'weight',         title: 'Körperwerte notieren',                   category: 'Körper', cadence: e(1, 'month'), lead: 2 },
  { id: 'shoes-run',      title: 'Laufschuhe ersetzen',                    category: 'Körper', cadence: e(1, 'year'), lead: 14, note: '~800 km' },
  { id: 'gym-review',     title: 'Trainingsplan überarbeiten',             category: 'Körper', cadence: e(3, 'month'), lead: 7 },

  /* ---------------- Zähne & Augen ---------------- */
  { id: 'dentist',        title: 'Zahnarzt Kontrolle',                     category: 'Zähne & Augen', cadence: e(6, 'month'), lead: 21, note: 'Bonusheft!' },
  { id: 'cleaning',       title: 'Professionelle Zahnreinigung',           category: 'Zähne & Augen', cadence: e(1, 'year'), lead: 21 },
  { id: 'bonusheft',      title: 'Bonusheft abstempeln lassen',            category: 'Zähne & Augen', cadence: e(1, 'year'), lead: 14 },
  { id: 'toothbrush',     title: 'Bürstenkopf wechseln',                   category: 'Zähne & Augen', cadence: e(3, 'month'), lead: 3 },
  { id: 'eyes',           title: 'Augenarzt / Sehtest',                    category: 'Zähne & Augen', cadence: e(2, 'year'), lead: 30 },
  { id: 'lenses',         title: 'Kontaktlinsen nachbestellen',            category: 'Zähne & Augen', cadence: e(3, 'month'), lead: 10 },
  { id: 'glasses',        title: 'Brille checken / neue Gläser',           category: 'Zähne & Augen', cadence: e(2, 'year'), lead: 30 },

  /* ---------------- Kopf ---------------- */
  { id: 'therapy-check',  title: 'Ehrlicher Check: wie geht es mir',       category: 'Kopf', cadence: e(1, 'month'), lead: 2 },
  { id: 'year-review',    title: 'Jahresrückblick schreiben',              category: 'Kopf', cadence: e(1, 'year'), lead: 14 },
  { id: 'quarter-goals',  title: 'Quartalsziele neu setzen',               category: 'Kopf', cadence: e(3, 'month'), lead: 7 },
  { id: 'digital-detox',  title: 'Wochenende ohne Handy',                  category: 'Kopf', cadence: e(3, 'month'), lead: 7 },
  { id: 'offline-day',    title: 'Einen Tag komplett offline',             category: 'Kopf', cadence: e(1, 'month'), lead: 3 },

  /* ---------------- Auto & Fahren ---------------- */
  { id: 'tuev',           title: 'HU / TÜV',                               category: 'Auto & Fahren', cadence: e(2, 'year'), lead: 45 },
  { id: 'inspection',     title: 'Inspektion / Ölwechsel',                 category: 'Auto & Fahren', cadence: e(1, 'year'), lead: 21 },
  { id: 'tires-winter',   title: 'Winterreifen drauf',                     category: 'Auto & Fahren', cadence: e(1, 'year'), lead: 21, note: 'O bis O' },
  { id: 'tires-summer',   title: 'Sommerreifen drauf',                     category: 'Auto & Fahren', cadence: e(1, 'year'), lead: 21 },
  { id: 'tire-age',       title: 'Reifenprofil & DOT prüfen',              category: 'Auto & Fahren', cadence: e(6, 'month'), lead: 7 },
  { id: 'kfz-tax',        title: 'Kfz-Steuer abbuchen',                    category: 'Auto & Fahren', cadence: e(1, 'year'), lead: 14 },
  { id: 'kfz-insurance',  title: 'Kfz-Versicherung vergleichen',           category: 'Auto & Fahren', cadence: e(1, 'year'), lead: 45, note: 'Kündigung bis 30.11.' },
  { id: 'wiper',          title: 'Scheibenwischer wechseln',               category: 'Auto & Fahren', cadence: e(1, 'year'), lead: 14 },
  { id: 'firstaid-car',   title: 'Verbandskasten Ablauf prüfen',           category: 'Auto & Fahren', cadence: e(1, 'year'), lead: 21 },
  { id: 'car-wash',       title: 'Auto innen ausräumen & waschen',         category: 'Auto & Fahren', cadence: e(2, 'month'), lead: 3 },
  { id: 'license-check',  title: 'Führerschein-Umtausch Frist',            category: 'Auto & Fahren', cadence: e(5, 'year'), lead: 90 },
  { id: 'parking-permit', title: 'Anwohnerparkausweis verlängern',         category: 'Auto & Fahren', cadence: e(1, 'year'), lead: 30 },
  { id: 'car-value',      title: 'Restwert & Verkauf durchrechnen',        category: 'Auto & Fahren', cadence: e(1, 'year'), lead: 21 },

  /* ---------------- Rad & ÖPNV ---------------- */
  { id: 'bike-service',   title: 'Rad zur Inspektion',                     category: 'Rad & ÖPNV', cadence: e(1, 'year'), lead: 14 },
  { id: 'bike-chain',     title: 'Kette ölen / Bremsen prüfen',            category: 'Rad & ÖPNV', cadence: e(2, 'month'), lead: 3 },
  { id: 'bike-light',     title: 'Beleuchtung vor dem Winter',             category: 'Rad & ÖPNV', cadence: e(1, 'year'), lead: 14 },
  { id: 'bike-reg',       title: 'Fahrrad codieren / registrieren',        category: 'Rad & ÖPNV', cadence: e(3, 'year'), lead: 21 },
  { id: 'transit-pass',   title: 'Abo Nahverkehr prüfen',                  category: 'Rad & ÖPNV', cadence: e(1, 'year'), lead: 21 },
  { id: 'bahncard',       title: 'BahnCard verlängert sich',               category: 'Rad & ÖPNV', cadence: e(1, 'year'), lead: 45, note: 'Kündigung 6 Wochen vorher' },

  /* ---------------- Wohnen ---------------- */
  { id: 'nebenkosten',    title: 'Nebenkostenabrechnung prüfen',           category: 'Wohnen', cadence: e(1, 'year'), lead: 21 },
  { id: 'meter',          title: 'Zählerstände ablesen',                   category: 'Wohnen', cadence: e(1, 'year'), lead: 7 },
  { id: 'rent-check',     title: 'Mieterhöhung / Mietspiegel checken',     category: 'Wohnen', cadence: e(1, 'year'), lead: 30 },
  { id: 'smoke-alarm',    title: 'Rauchmelder testen',                     category: 'Wohnen', cadence: e(6, 'month'), lead: 7 },
  { id: 'smoke-battery',  title: 'Rauchmelder-Batterien tauschen',         category: 'Wohnen', cadence: e(1, 'year'), lead: 14 },
  { id: 'heating',        title: 'Heizung entlüften',                      category: 'Wohnen', cadence: e(1, 'year'), lead: 14 },
  { id: 'chimney',        title: 'Schornsteinfeger-Termin',                category: 'Wohnen', cadence: e(1, 'year'), lead: 14 },
  { id: 'window-seal',    title: 'Fenster- & Türdichtungen prüfen',        category: 'Wohnen', cadence: e(1, 'year'), lead: 14 },
  { id: 'silicone',       title: 'Silikonfugen im Bad checken',            category: 'Wohnen', cadence: e(1, 'year'), lead: 14 },
  { id: 'drain',          title: 'Abflüsse reinigen',                      category: 'Wohnen', cadence: e(3, 'month'), lead: 3 },
  { id: 'mattress',       title: 'Matratze wenden',                        category: 'Wohnen', cadence: e(6, 'month'), lead: 5 },
  { id: 'mattress-new',   title: 'Matratze ersetzen',                      category: 'Wohnen', cadence: e(8, 'year'), lead: 60 },
  { id: 'pillow',         title: 'Kopfkissen ersetzen',                    category: 'Wohnen', cadence: e(2, 'year'), lead: 21 },
  { id: 'deep-clean',     title: 'Großputz',                               category: 'Wohnen', cadence: e(6, 'month'), lead: 7 },
  { id: 'declutter',      title: 'Eine Ecke ausmisten',                    category: 'Wohnen', cadence: e(1, 'month'), lead: 3 },
  { id: 'plants',         title: 'Pflanzen umtopfen / düngen',             category: 'Wohnen', cadence: e(6, 'month'), lead: 7 },
  { id: 'fridge-clean',   title: 'Kühlschrank ausräumen',                  category: 'Wohnen', cadence: e(1, 'month'), lead: 2 },
  { id: 'freezer',        title: 'Gefrierfach abtauen',                    category: 'Wohnen', cadence: e(1, 'year'), lead: 7 },

  /* ---------------- Haushalt & Technik ---------------- */
  { id: 'washing-clean',  title: 'Waschmaschine Reinigungslauf',           category: 'Haushalt & Technik', cadence: e(2, 'month'), lead: 3 },
  { id: 'lint',           title: 'Flusensieb & Trocknerfilter',            category: 'Haushalt & Technik', cadence: e(1, 'month'), lead: 2 },
  { id: 'dishwasher',     title: 'Spülmaschinen-Sieb reinigen',            category: 'Haushalt & Technik', cadence: e(1, 'month'), lead: 2 },
  { id: 'hood-filter',    title: 'Dunstabzug-Filter tauschen',             category: 'Haushalt & Technik', cadence: e(3, 'month'), lead: 5 },
  { id: 'vacuum-filter',  title: 'Staubsauger-Filter tauschen',            category: 'Haushalt & Technik', cadence: e(6, 'month'), lead: 7 },
  { id: 'water-filter',   title: 'Wasserfilter-Kartusche',                 category: 'Haushalt & Technik', cadence: e(1, 'month'), lead: 3 },
  { id: 'coffee-decalc',  title: 'Kaffeemaschine entkalken',               category: 'Haushalt & Technik', cadence: e(2, 'month'), lead: 3 },
  { id: 'knives',         title: 'Messer schärfen',                        category: 'Haushalt & Technik', cadence: e(3, 'month'), lead: 5 },
  { id: 'warranty',       title: 'Garantien & Kassenbons sortieren',       category: 'Haushalt & Technik', cadence: e(1, 'year'), lead: 14 },
  { id: 'battery-stock',  title: 'Batterien & Glühbirnen nachkaufen',      category: 'Haushalt & Technik', cadence: e(6, 'month'), lead: 7 },
  { id: 'firstaid-home',  title: 'Erste-Hilfe-Set daheim prüfen',          category: 'Haushalt & Technik', cadence: e(1, 'year'), lead: 14 },

  /* ---------------- Geld ---------------- */
  { id: 'taxes',          title: 'Steuererklärung',                        category: 'Geld', cadence: e(1, 'year'), lead: 60, note: 'Frist 31.07.' },
  { id: 'tax-docs',       title: 'Belege fürs Steuerjahr sammeln',         category: 'Geld', cadence: e(3, 'month'), lead: 7 },
  { id: 'budget',         title: 'Monatsabschluss: Konto durchgehen',      category: 'Geld', cadence: e(1, 'month'), lead: 2 },
  { id: 'subs-audit',     title: 'Alle Abbuchungen durchgehen',            category: 'Geld', cadence: e(6, 'month'), lead: 7 },
  { id: 'schufa',         title: 'SCHUFA-Selbstauskunft (kostenlos)',      category: 'Geld', cadence: e(1, 'year'), lead: 14 },
  { id: 'depot',          title: 'Depot rebalancen',                       category: 'Geld', cadence: e(6, 'month'), lead: 14 },
  { id: 'savings-rate',   title: 'Sparrate anpassen',                      category: 'Geld', cadence: e(1, 'year'), lead: 14 },
  { id: 'emergency-fund', title: 'Notgroschen auffüllen / prüfen',         category: 'Geld', cadence: e(6, 'month'), lead: 7 },
  { id: 'freistellung',   title: 'Freistellungsauftrag prüfen',            category: 'Geld', cadence: e(1, 'year'), lead: 21 },
  { id: 'bank-fees',      title: 'Kontogebühren & Konditionen vergleichen',category: 'Geld', cadence: e(1, 'year'), lead: 21 },
  { id: 'card-expiry',    title: 'Karten-Ablaufdatum im Blick',            category: 'Geld', cadence: e(1, 'year'), lead: 45 },
  { id: 'pension-info',   title: 'Renteninformation lesen',                category: 'Geld', cadence: e(1, 'year'), lead: 21 },
  { id: 'salary-talk',    title: 'Gehalt neu verhandeln',                  category: 'Geld', cadence: e(1, 'year'), lead: 45 },

  /* ---------------- Verträge & Abos ---------------- */
  { id: 'energy',         title: 'Strom- & Gastarif wechseln',             category: 'Verträge & Abos', cadence: e(1, 'year'), lead: 60 },
  { id: 'internet',       title: 'Internet- & Mobilfunkvertrag prüfen',    category: 'Verträge & Abos', cadence: e(1, 'year'), lead: 60 },
  { id: 'streaming',      title: 'Streaming-Abos ausmisten',               category: 'Verträge & Abos', cadence: e(6, 'month'), lead: 7 },
  { id: 'gym-contract',   title: 'Fitnessvertrag: kündigen oder bleiben',  category: 'Verträge & Abos', cadence: e(1, 'year'), lead: 60 },
  { id: 'rundfunk',       title: 'Rundfunkbeitrag',                        category: 'Verträge & Abos', cadence: e(3, 'month'), lead: 10 },
  { id: 'cloud-storage',  title: 'Cloud-Speicher Abo prüfen',              category: 'Verträge & Abos', cadence: e(1, 'year'), lead: 21 },
  { id: 'domain',         title: 'Domains & Hosting verlängern',           category: 'Verträge & Abos', cadence: e(1, 'year'), lead: 30 },
  { id: 'memberships',    title: 'Mitgliedschaften & Vereine prüfen',      category: 'Verträge & Abos', cadence: e(1, 'year'), lead: 30 },

  /* ---------------- Versicherung ---------------- */
  { id: 'liability',      title: 'Haftpflicht: Summe & Preis prüfen',      category: 'Versicherung', cadence: e(2, 'year'), lead: 30 },
  { id: 'household-ins',  title: 'Hausratversicherung anpassen',           category: 'Versicherung', cadence: e(2, 'year'), lead: 30 },
  { id: 'health-ins',     title: 'Krankenkasse vergleichen',               category: 'Versicherung', cadence: e(2, 'year'), lead: 30 },
  { id: 'bu',             title: 'Berufsunfähigkeit prüfen',               category: 'Versicherung', cadence: e(2, 'year'), lead: 30 },
  { id: 'travel-ins',     title: 'Auslandskrankenschutz vor Reise',        category: 'Versicherung', cadence: e(1, 'year'), lead: 21 },
  { id: 'legal-ins',      title: 'Rechtsschutz: brauche ich das noch?',    category: 'Versicherung', cadence: e(2, 'year'), lead: 30 },
  { id: 'ins-overview',   title: 'Alle Policen auflisten',                 category: 'Versicherung', cadence: e(1, 'year'), lead: 21 },

  /* ---------------- Vorsorge & Ernstfall ---------------- */
  { id: 'patientenvfg',   title: 'Patientenverfügung aktualisieren',       category: 'Vorsorge & Ernstfall', cadence: e(2, 'year'), lead: 30 },
  { id: 'vollmacht',      title: 'Vorsorgevollmacht prüfen',               category: 'Vorsorge & Ernstfall', cadence: e(2, 'year'), lead: 30 },
  { id: 'testament',      title: 'Testament / Erbfragen klären',           category: 'Vorsorge & Ernstfall', cadence: e(5, 'year'), lead: 60 },
  { id: 'organ-card',     title: 'Organspendeausweis',                     category: 'Vorsorge & Ernstfall', cadence: e(5, 'year'), lead: 30 },
  { id: 'emergency-info', title: 'Notfallkontakte & Zugänge hinterlegen',  category: 'Vorsorge & Ernstfall', cadence: e(1, 'year'), lead: 21 },
  { id: 'doc-safe',       title: 'Wichtige Dokumente digitalisieren',      category: 'Vorsorge & Ernstfall', cadence: e(1, 'year'), lead: 21 },

  /* ---------------- Ämter & Papiere ---------------- */
  { id: 'perso',          title: 'Personalausweis läuft ab',               category: 'Ämter & Papiere', cadence: e(10, 'year'), lead: 90 },
  { id: 'passport',       title: 'Reisepass läuft ab',                     category: 'Ämter & Papiere', cadence: e(10, 'year'), lead: 120, note: 'Viele Länder: 6 Monate Restgültigkeit' },
  { id: 'anmeldung',      title: 'Ummeldung nach Umzug',                   category: 'Ämter & Papiere', cadence: { type: 'once', on: '' }, lead: 7, note: '2 Wochen Frist' },
  { id: 'fuehrungszeugn', title: 'Führungszeugnis beantragen',             category: 'Ämter & Papiere', cadence: { type: 'once', on: '' }, lead: 14 },
  { id: 'gez-change',     title: 'Rundfunkbeitrag ummelden',               category: 'Ämter & Papiere', cadence: { type: 'once', on: '' }, lead: 7 },
  { id: 'wahl',           title: 'Wahl: Briefwahl beantragen',             category: 'Ämter & Papiere', cadence: e(4, 'year'), lead: 30 },
  { id: 'files-purge',    title: 'Ordner ausmisten, Aufbewahrungsfristen', category: 'Ämter & Papiere', cadence: e(1, 'year'), lead: 14 },

  /* ---------------- Studium ---------------- */
  { id: 'semesterbeitrag',title: 'Semesterbeitrag überweisen',             category: 'Studium', cadence: e(6, 'month'), lead: 21 },
  { id: 'rueckmeldung',   title: 'Rückmeldung zum Semester',               category: 'Studium', cadence: e(6, 'month'), lead: 21 },
  { id: 'exam-reg',       title: 'Prüfungsanmeldung Frist',                category: 'Studium', cadence: e(6, 'month'), lead: 21 },
  { id: 'bafoeg',         title: 'BAföG-Folgeantrag',                      category: 'Studium', cadence: e(1, 'year'), lead: 60 },
  { id: 'scholarship',    title: 'Stipendien-Bewerbungsfrist',             category: 'Studium', cadence: e(1, 'year'), lead: 45 },
  { id: 'student-ins',    title: 'Studentische Krankenversicherung prüfen',category: 'Studium', cadence: e(1, 'year'), lead: 30 },
  { id: 'semesterticket', title: 'Semesterticket aktivieren',              category: 'Studium', cadence: e(6, 'month'), lead: 14 },
  { id: 'thesis-plan',    title: 'Abschlussarbeit: nächster Meilenstein',  category: 'Studium', cadence: e(1, 'month'), lead: 5 },
  { id: 'student-discount', title: 'Studi-Rabatte neu verifizieren',       category: 'Studium', cadence: e(1, 'year'), lead: 14 },

  /* ---------------- Job ---------------- */
  { id: 'cv',             title: 'Lebenslauf aktualisieren',               category: 'Job', cadence: e(1, 'year'), lead: 21 },
  { id: 'linkedin',       title: 'Profil & Portfolio aufräumen',           category: 'Job', cadence: e(6, 'month'), lead: 14 },
  { id: 'urlaub',         title: 'Resturlaub verplanen',                   category: 'Job', cadence: e(1, 'year'), lead: 60 },
  { id: 'review-talk',    title: 'Mitarbeitergespräch vorbereiten',        category: 'Job', cadence: e(1, 'year'), lead: 21 },
  { id: 'skills',         title: 'Weiterbildung suchen & buchen',          category: 'Job', cadence: e(6, 'month'), lead: 30 },
  { id: 'network',        title: 'Netzwerk pflegen: 3 Leute anschreiben',  category: 'Job', cadence: e(3, 'month'), lead: 5 },
  { id: 'work-backup',    title: 'Arbeitsergebnisse sichern & belegen',    category: 'Job', cadence: e(3, 'month'), lead: 5 },
  { id: 'invoices',       title: 'Rechnungen schreiben / Mahnlauf',        category: 'Job', cadence: e(1, 'month'), lead: 3 },
  { id: 'ustva',          title: 'Umsatzsteuer-Voranmeldung',              category: 'Job', cadence: e(3, 'month'), lead: 7 },

  /* ---------------- Digital ---------------- */
  { id: 'backup',         title: 'Backup prüfen — läuft es wirklich?',     category: 'Digital', cadence: e(1, 'month'), lead: 2 },
  { id: 'backup-restore', title: 'Backup testweise zurückspielen',         category: 'Digital', cadence: e(1, 'year'), lead: 14 },
  { id: 'passwords',      title: 'Passwort-Hygiene: Leaks checken',        category: 'Digital', cadence: e(6, 'month'), lead: 7 },
  { id: '2fa',            title: '2FA-Backupcodes sichern',                category: 'Digital', cadence: e(1, 'year'), lead: 14 },
  { id: 'updates',        title: 'Geräte-Updates durchziehen',             category: 'Digital', cadence: e(1, 'month'), lead: 2 },
  { id: 'photos',         title: 'Fotos sortieren & aussortieren',         category: 'Digital', cadence: e(3, 'month'), lead: 7 },
  { id: 'inbox-zero',     title: 'Mailfach leerräumen',                    category: 'Digital', cadence: e(1, 'month'), lead: 2 },
  { id: 'unsubscribe',    title: 'Newsletter abbestellen',                 category: 'Digital', cadence: e(6, 'month'), lead: 5 },
  { id: 'privacy',        title: 'App-Berechtigungen durchgehen',          category: 'Digital', cadence: e(6, 'month'), lead: 7 },
  { id: 'old-accounts',   title: 'Alte Accounts löschen',                  category: 'Digital', cadence: e(1, 'year'), lead: 14 },
  { id: 'phone-storage',  title: 'Handy-Speicher aufräumen',               category: 'Digital', cadence: e(3, 'month'), lead: 3 },

  /* ---------------- Menschen ---------------- */
  { id: 'birthdays',      title: 'Geburtstage im Kalender nachtragen',     category: 'Menschen', cadence: e(1, 'year'), lead: 14 },
  { id: 'call-family',    title: 'Bei der Familie melden',                 category: 'Menschen', cadence: e(2, 'week'), lead: 2 },
  { id: 'old-friend',     title: 'Alten Freund anrufen',                   category: 'Menschen', cadence: e(1, 'month'), lead: 3 },
  { id: 'date-night',     title: 'Was zu zweit planen',                    category: 'Menschen', cadence: e(2, 'week'), lead: 3 },
  { id: 'gift-think',     title: 'Geschenkideen sammeln',                  category: 'Menschen', cadence: e(3, 'month'), lead: 7 },
  { id: 'xmas-gifts',     title: 'Weihnachtsgeschenke besorgen',           category: 'Menschen', cadence: e(1, 'year'), lead: 30 },
  { id: 'thanks',         title: 'Jemandem danke sagen',                   category: 'Menschen', cadence: e(1, 'month'), lead: 3 },

  /* ---------------- Haustier ---------------- */
  { id: 'vet',            title: 'Tierarzt Routinecheck',                  category: 'Haustier', cadence: e(1, 'year'), lead: 21 },
  { id: 'pet-vacc',       title: 'Impfung Haustier',                       category: 'Haustier', cadence: e(1, 'year'), lead: 21 },
  { id: 'deworm',         title: 'Entwurmung / Zeckenschutz',              category: 'Haustier', cadence: e(3, 'month'), lead: 5 },
  { id: 'pet-tax',        title: 'Hundesteuer',                            category: 'Haustier', cadence: e(1, 'year'), lead: 14 },
  { id: 'pet-chip',       title: 'Chip-Daten aktuell halten',              category: 'Haustier', cadence: e(1, 'year'), lead: 14 },
  { id: 'claws',          title: 'Krallen / Fell / Pflege',                category: 'Haustier', cadence: e(2, 'month'), lead: 3 },

  /* ---------------- Klamotten & Kram ---------------- */
  { id: 'wardrobe',       title: 'Kleiderschrank umräumen',                category: 'Klamotten & Kram', cadence: e(6, 'month'), lead: 7 },
  { id: 'clothes-donate', title: 'Klamotten spenden / verkaufen',          category: 'Klamotten & Kram', cadence: e(6, 'month'), lead: 7 },
  { id: 'shoe-repair',    title: 'Schuhe zum Schuster',                    category: 'Klamotten & Kram', cadence: e(1, 'year'), lead: 14 },
  { id: 'jacket-wash',    title: 'Winterjacke imprägnieren',               category: 'Klamotten & Kram', cadence: e(1, 'year'), lead: 14 },
  { id: 'haircut',        title: 'Haare schneiden',                        category: 'Klamotten & Kram', cadence: e(6, 'week'), lead: 5 },
  { id: 'razor',          title: 'Rasierklingen nachkaufen',               category: 'Klamotten & Kram', cadence: e(2, 'month'), lead: 5 },
  { id: 'towels',         title: 'Handtücher & Bettwäsche ersetzen',       category: 'Klamotten & Kram', cadence: e(2, 'year'), lead: 21 },

  /* ---------------- Saison ---------------- */
  { id: 'vacation-plan',  title: 'Urlaub planen & buchen',                 category: 'Saison', cadence: e(1, 'year'), lead: 60 },
  { id: 'spring-clean',   title: 'Frühjahrsputz Balkon / Garten',          category: 'Saison', cadence: e(1, 'year'), lead: 14 },
  { id: 'ac-clean',       title: 'Klimaanlage / Ventilator reinigen',      category: 'Saison', cadence: e(1, 'year'), lead: 14 },
  { id: 'winter-prep',    title: 'Winterfest machen',                      category: 'Saison', cadence: e(1, 'year'), lead: 21 },
  { id: 'daylight',       title: 'Zeitumstellung: Uhren & Geräte',         category: 'Saison', cadence: e(6, 'month'), lead: 3 },
  { id: 'vitamin-d',      title: 'Vitamin D vor dem Winter checken',       category: 'Saison', cadence: e(1, 'year'), lead: 21 },
  { id: 'advent',         title: 'Dezember-Kram früh erledigen',           category: 'Saison', cadence: e(1, 'year'), lead: 30 },
]

export const CATALOG_BY_CATEGORY = CATEGORIES.map((c) => ({
  category: c as string,
  items: CATALOG.filter((p) => p.category === c),
})).filter((g) => g.items.length > 0)
