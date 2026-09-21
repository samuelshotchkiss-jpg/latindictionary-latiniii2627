(function() {
    // --- DOM Element Cache ---
    // Grabbing references to HTML elements once so we don't query the DOM repeatedly
    const searchInput = document.getElementById('search-input');
    const suggestionsList = document.getElementById('suggestions-list');
    const resultDisplay = document.getElementById('result-display');
    const wordWheel = document.getElementById('word-wheel');
    const wordWheelContainer = document.getElementById('word-wheel-container');
    const privacyNoticeModal = document.getElementById('privacy-notice-modal');
    const acknowledgePrivacyBtn = document.getElementById('acknowledge-privacy-btn');
    const viewStudyListBtn = document.getElementById('view-study-list-btn');
    const studyListModal = document.getElementById('study-list-modal');
    const closeStudyListModal = document.getElementById('close-study-list-modal');
    const studyListUl = document.getElementById('study-list-ul');
    const studyListPlaceholder = document.getElementById('study-list-placeholder');
    const downloadListBtn = document.getElementById('download-list-btn');
    const importListBtn = document.getElementById('import-list-btn');
    const importFileInput = document.getElementById('import-file-input');
    const copyListBtn = document.getElementById('copy-list-btn');
    const toggleWordWheelBtn = document.getElementById('toggle-word-wheel-btn');
    const closeWordWheelBtn = document.getElementById('close-word-wheel-btn');
    const mobileMenuOverlay = document.getElementById('mobile-menu-overlay');
    const aboutBtn = document.getElementById('about-btn');
    const aboutModal = document.getElementById('about-modal');
    const closeAboutModal = document.getElementById('close-about-modal');
    const closeAboutBtn = document.getElementById('close-about-btn');
    const aboutPharrLink = document.getElementById('about-pharr-link');
    const directionToggle = document.getElementById('direction-toggle');
    const wordWheelTitle = document.getElementById('word-wheel-title');
    const wheelLegend = document.getElementById('wheel-legend');

    // --- Global State Variables ---
    let vocabulary = new Array(); // Holds standard dictionary lemmata
    let formsList = new Array();  // Holds inflected grammar forms
    let studyList = new Array();  // Holds the user's saved words

    // --- The English side (english.json, written by the toolkit's export_reverse.py) ---
    // A KEY IS NOT A GLOSS. The English words here are what a student TYPES to find a Latin
    // word; they are never shown as a definition. Each key lists its Latin options in the
    // order the teacher ruled, each with a guidance line saying which one to pick and why.
    let english = null;           // {keys: {english: [option]}, forms: {headword: strip}}
    let englishKeys = new Array(); // every key, for search
    let wheelKeys = new Array();   // the keys the A-Z list shows: not the generated inflections
    let direction = 'la';          // 'la' = Latin -> English (the original app), 'en' = the flip
    // THE FLIP LANDS ON THE COUNTERPART OF WHAT IS ON SCREEN. It used to land on whatever
    // she had last looked at on the other side, so `turbō` flipped to `fulfil` -- a word from
    // an earlier search. Now: from a Latin word, the English she clicked through from, else
    // the word's own anchor (`turbō` -> `disturb`); from an English word, the Latin she
    // clicked, else its first option.
    let lastEnglishKey = null;     // the English word on (or last on) the English side
    let lastLatinWord = null;      // the Latin word on (or last on) the Latin side
    let pin = null;                // {key, word}: the English word she clicked a Latin word from
    
    // Keys used for browser LocalStorage
    const STORAGE_KEY_LIST = 'latinStudyList';
    const STORAGE_KEY_CONSENT = 'privacyConsent';

    // --- Pharr grammar links -------------------------------------------------
    // A {{tagged}} grammatical term opens the matching entry in the digital
    // Pharr appendix. The target is the GLOSSARY ENTRY, not a section number:
    // the entry carries Pharr's definition, the editor's plain-English
    // expansion, and a "Kinds" menu listing each construction with its own
    // section. A student who has forgotten what an ablative is and lands on
    // section 30 gets "the case of adverbial relation" and nothing else --
    // true, and no help at all. The entry answers the question they have.
    //
    // WHERE THE APPENDIX LIVES, and how to point at a local copy while testing.
    // This app has no build step -- the files served are the files edited -- so
    // there is no place to substitute an environment variable. Instead:
    //
    //     ...index.html?pharr=http://localhost:8766/     point at a local copy
    //     ...index.html?pharr=off                        back to the live site
    //
    // The choice is remembered afterwards, so the query string is needed once;
    // bookmark the ?pharr= link and testing is a click.
    //
    // WHY A URL PARAMETER AND NOT JUST localStorage. The base is resolved once,
    // while this script loads. Setting localStorage from the console therefore
    // does nothing until a reload -- and a tab restored from the back/forward
    // cache never re-runs the script at all, so the SAME window keeps the old
    // target while a freshly opened one behaves correctly. That is a genuinely
    // confusing failure, and it is avoided entirely by carrying the value in the
    // URL, where it is present *before* anything is resolved.
    //
    // TWO SAFETY PROPERTIES, both about failing toward the real site:
    //   * PRODUCTION IS THE DEFAULT, unconditionally. Missing value, blocked
    //     storage, a thrown exception -- every path returns the live URL.
    //   * The override is honoured ONLY when this page is itself on localhost,
    //     so neither a stale stored value nor a ?pharr= link that gets forwarded
    //     to a student can redirect anyone away from the live appendix.
    //
    const PHARR_BASE_PRODUCTION = 'https://samuelshotchkiss-jpg.github.io/pharr-aeneid-grammar/';
    const PHARR_OVERRIDE_KEY = 'pharrBase';
    // Words that mean "stop overriding", so undoing needs no console either.
    const PHARR_OFF_WORDS = ['', 'off', 'no', 'live', 'prod', 'production', 'clear', 'reset'];

    const PHARR_BASE = (function resolvePharrBase() {
        const onLocalhost = ['localhost', '127.0.0.1', '[::1]', ''].includes(location.hostname);
        if (!onLocalhost) return PHARR_BASE_PRODUCTION;

        const store = {
            get() { try { return localStorage.getItem(PHARR_OVERRIDE_KEY); } catch (e) { return null; } },
            set(v) { try { localStorage.setItem(PHARR_OVERRIDE_KEY, v); } catch (e) { /* blocked */ } },
            clear() { try { localStorage.removeItem(PHARR_OVERRIDE_KEY); } catch (e) { /* blocked */ } }
        };

        // The query string wins over the stored value: it is the more explicit
        // and more recent instruction.
        let param = null;
        try { param = new URLSearchParams(location.search).get('pharr'); } catch (e) { /* ancient */ }

        if (param !== null) {
            const cleaned = param.trim();
            if (PHARR_OFF_WORDS.includes(cleaned.toLowerCase())) {
                store.clear();
                console.info('[pharr] override cleared -> ' + PHARR_BASE_PRODUCTION);
                stripParam();
                return PHARR_BASE_PRODUCTION;
            }
            const base = normalize(cleaned);
            store.set(base);
            announce(base, 'from ?pharr=, and remembered');
            stripParam();
            return base;
        }

        const stored = store.get();
        if (!stored) return PHARR_BASE_PRODUCTION;
        const base = normalize(stored);
        announce(base, 'remembered; ?pharr=off to undo');
        return base;

        function normalize(url) { return url.endsWith('/') ? url : url + '/'; }

        // Say so out loud. A silent redirect is how an afternoon disappears into
        // testing links against the wrong copy of the appendix.
        function announce(base, how) {
            console.info('[pharr] grammar links -> ' + base + '  (' + how + ')');
        }

        // Take ?pharr= back out of the address bar once it has been honoured, so
        // the URL a reader might copy from here carries no local address. The
        // value is already stored, so nothing is lost by removing it.
        function stripParam() {
            try {
                const u = new URL(location.href);
                u.searchParams.delete('pharr');
                history.replaceState(null, '', u.pathname + u.search + u.hash);
            } catch (e) { /* not fatal -- the param is inert off localhost anyway */ }
        }
    })();

    // Slugs must be derived IDENTICALLY in three places, or a link dies:
    //   here, Pharr's js/tooltips.js slugify(), and the toolkit's
    //   engine/sync_grammar_terms.py slugify(). The toolkit gates every tag
    //   against the vocabulary it vendors from Pharr, so drift is caught before
    //   a student meets it.
    function pharrSlug(str) {
        return String(str || '').toLowerCase()
            .normalize('NFD').replace(/\p{Diacritic}/gu, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
    }

    // A pipe id that is a bare section number ("342", "§342") is a deliberate
    // NARROWING -- we know which construction is at play, so send them straight
    // there. Anything else names a glossary term.
    function pharrHref(id) {
        const raw = String(id || '').trim();
        const section = raw.match(/^§?\s*(\d+)$/);
        return section
            ? PHARR_BASE + '#s' + section[1]
            : PHARR_BASE + '#term=' + encodeURIComponent(pharrSlug(raw));
    }

    function escapeHTML(str) {
        return String(str).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[c]);
    }

    // A real <a>, not a span with a click handler: middle-click, ctrl-click,
    // "open in new tab", keyboard focus and screen readers all work for free.
    function grammarLinkHTML(label, id) {
        const text = String(label).trim();
        return '<a class="grammar-link" href="' + escapeHTML(pharrHref(id)) + '"' +
               ' target="_blank" rel="noopener"' +
               ' title="' + escapeHTML(text) + ' — look it up in Pharr’s grammar">' +
               escapeHTML(text) + '</a>';
    }

    // --- Core & Data Functions ---

    // Parses single {curly braces} to style commentary text lightly
    function formatHeadwordHTML(rawLatin) {
        if (!rawLatin) return '';
        return rawLatin.replace(/\{(.*?)\}/g, '<span class="headword-comment">$1</span>');
    }

    // Parses complex markup rules (Grammar links, Idioms, Commentary, Latin terms)
    // Order of operations is crucial so nested spans don't break each other
    function formatDefinitionHTML(rawDef) {
        if (!rawDef) return '';
        
        let formatted = rawDef;
        
        // 1. Grammar link with an explicit target: {{label|term}} or {{label|§342}}.
        //    The pipe is the EXCEPTION -- it is for when the visible text is not
        //    the term's name ({{takes the ablative|ablative}}), or when we mean to
        //    narrow to one section.
        formatted = formatted.replace(/\{\{([^{}|]*?)\|([^{}]*?)\}\}/g,
            (_m, label, id) => grammarLinkHTML(label, id));

        // 2. The normal case: {{ablative}} -- the visible text IS the term, so it
        //    is also the id. There is no "pending" state to author; a tag either
        //    resolves in the appendix or that page says so plainly.
        formatted = formatted.replace(/\{\{([^{}]*?)\}\}/g,
            (_m, label) => grammarLinkHTML(label, label));
        
        // 3. Idiom Phrases (Using Hex codes \x5b and \x5d to avoid markdown UI bugs)
        const idiomRegex = new RegExp('\\x5b\\x5b(.*?)\\x5d\\x5d', 'g');
        formatted = formatted.replace(idiomRegex, '<span class="idiom-phrase">$1</span>');

        // 4. English Commentary Context
        formatted = formatted.replace(/\{(.*?)\}/g, '<span class="def-comment">$1</span>');
        
        // 5. Latin Words embedded inside English Commentary
        formatted = formatted.replace(/\*(.*?)\*/g, '<span class="latin-in-context">$1</span>');
        
        return formatted;
    }

    // Lays a word's senses out one per line, with the core given the most weight.
    //
    // WHY THE LINE WAS BROKEN UP (owner, 2026-09-17). Definitions carry comments both
    // before and after a gloss, and run together on one line the reader cannot tell
    // which parenthetical belongs to which sense: `much (in the singular); (in the
    // plural) many` reads as though the plural note went with "much". Giving each sense
    // its own line settles it by layout, with no new convention for a student to learn.
    //
    // A heading is drawn ABOVE the senses, not inside the first one, because that is
    // what it means: `(with the ablative)` governs both "from" and "by".
    //
    // NO CORE IS MARKED ON EVERY ENTRY. The oldest hand-vetted entries carry no core at
    // all, and there the senses are drawn in one uniform weight rather than guessing
    // that the first one leads. Falls back to the single-line render for a word whose
    // CSV row predates the sense columns.
    // `matched` (English side): the positions of the senses the English word reached. Those
    // are highlighted and the rest drawn as usual -- she sees the whole word, with the
    // meaning she searched for picked out.
    function formatSensesHTML(word, matched = null) {
        if (!word.senses || word.senses.length === 0) {
            return `<p>${formatDefinitionHTML(word.definition)}</p>`;
        }
        const headingHtml = word.senseHeading
            ? `<p class="def-heading">${formatDefinitionHTML(word.senseHeading)}</p>`
            : '';
        const senseHtml = word.senses.map((sense, i) => {
            const isCore = (i === word.coreSense);
            const isMatch = matched && matched.includes(i);
            return `<p class="sense${isCore ? ' sense-core' : ''}${isMatch ? ' sense-match' : ''}">${formatDefinitionHTML(sense)}</p>`;
        }).join('');
        return `${headingHtml}<div class="senses">${senseHtml}</div>`;
    }

    // --- Prefix assimilation: name the rule, don't silently correct ---------------
    //
    // This dictionary is spelled to ONE orthographic norm (all-assimilated, 2026-08-12).
    // Books elsewhere are not. A student who meets `inpleat` in another edition, or who
    // half-remembers `adloquor` from a textbook, types it here and gets nothing -- and
    // because this is a PREFIX search, the letters assimilation changes are exactly the
    // ones it keys on, so there is no partial credit and no way to backspace into a hit.
    //
    // Unlike the j->i fold in normalizeForSearch, which is silent, this is SHOWN. The
    // student is not being autocorrected; they are being taught a rule they will need
    // every time they open a different book.
    //
    // THE SAFETY PROPERTY IS THE TRIGGER: a rule is only tried when the search returns
    // ZERO results, so it can never shadow a real entry. That is what makes the `ad-`
    // fricatives safe to include without special-casing -- `adsum` and `adfuī` are real
    // headwords, so typing them matches and nothing fires; `adsere` matches nothing, so
    // `assere` is offered. The exceptions defend themselves.
    const ASSIMILATION_RULES = [
        // in- before a labial or a liquid
        { from: 'inp',  to: 'imp',  note: 'in- becomes im- before p, b and m' },
        { from: 'inb',  to: 'imb',  note: 'in- becomes im- before p, b and m' },
        { from: 'inm',  to: 'imm',  note: 'in- becomes im- before p, b and m' },
        { from: 'inl',  to: 'ill',  note: 'in- becomes il- before l' },
        { from: 'inr',  to: 'irr',  note: 'in- becomes ir- before r' },
        // con- likewise
        { from: 'conp', to: 'comp', note: 'con- becomes com- before p, b and m' },
        { from: 'conb', to: 'comb', note: 'con- becomes com- before p, b and m' },
        { from: 'conm', to: 'comm', note: 'con- becomes com- before p, b and m' },
        { from: 'conl', to: 'coll', note: 'con- becomes col- before l' },
        { from: 'conr', to: 'corr', note: 'con- becomes cor- before r' },
        // ad- takes the shape of whatever follows it
        { from: 'adq',  to: 'acq',  note: 'ad- becomes ac- before qu' },
        { from: 'adsp', to: 'asp',  note: 'ad- loses its d before sp, sc and st' },
        { from: 'adsc', to: 'asc',  note: 'ad- loses its d before sp, sc and st' },
        { from: 'adst', to: 'ast',  note: 'ad- loses its d before sp, sc and st' },
        { from: 'adc',  to: 'acc',  note: 'ad- takes the shape of the consonant after it' },
        { from: 'adf',  to: 'aff',  note: 'ad- takes the shape of the consonant after it' },
        { from: 'adg',  to: 'agg',  note: 'ad- takes the shape of the consonant after it' },
        { from: 'adl',  to: 'all',  note: 'ad- takes the shape of the consonant after it' },
        { from: 'adn',  to: 'ann',  note: 'ad- takes the shape of the consonant after it' },
        { from: 'adp',  to: 'app',  note: 'ad- takes the shape of the consonant after it' },
        { from: 'adr',  to: 'arr',  note: 'ad- takes the shape of the consonant after it' },
        { from: 'ads',  to: 'ass',  note: 'ad- takes the shape of the consonant after it' },
        { from: 'adt',  to: 'att',  note: 'ad- takes the shape of the consonant after it' },
        // ob-, sub-, ex-, dis-
        { from: 'obc',  to: 'occ',  note: 'ob- takes the shape of the consonant after it' },
        { from: 'obf',  to: 'off',  note: 'ob- takes the shape of the consonant after it' },
        { from: 'obp',  to: 'opp',  note: 'ob- takes the shape of the consonant after it' },
        { from: 'subc', to: 'succ', note: 'sub- takes the shape of the consonant after it' },
        { from: 'subf', to: 'suff', note: 'sub- takes the shape of the consonant after it' },
        { from: 'subg', to: 'sugg', note: 'sub- takes the shape of the consonant after it' },
        { from: 'subp', to: 'supp', note: 'sub- takes the shape of the consonant after it' },
        { from: 'subm', to: 'summ', note: 'sub- becomes sum- before m' },
        { from: 'exf',  to: 'eff',  note: 'ex- becomes ef- before f' },
        { from: 'disf', to: 'diff', note: 'dis- becomes dif- before f' },
        // ex- keeps an s this dictionary spells out
        { from: 'exul',   to: 'exsul',   note: 'this dictionary spells the s: exsul, not exul' },
        { from: 'exil',   to: 'exsil',   note: 'this dictionary spells the s: exsilium, not exilium' },
        { from: 'extinc', to: 'exstinc', note: 'this dictionary spells the s: exstinguo, not extinguo' },
        { from: 'exting', to: 'exsting', note: 'this dictionary spells the s: exstinguo, not extinguo' },
        { from: 'extinx', to: 'exstinx', note: 'this dictionary spells the s: exstinguo, not extinguo' },
        // ...and the two words that go the OTHER way, which is exactly where a student
        // who has learned the rule will now guess wrong.
        { from: 'assum',  to: 'adsum',  note: 'adsum keeps its d, to match absum, afui' },
        { from: 'surrid', to: 'subrid', note: 'sub- keeps its b before r: subrideo' },
        { from: 'surrig', to: 'subrig', note: 'sub- keeps its b before r: subrigo' }
    ];

    // Does anything at all match this term? Same predicate the main search uses, so the
    // two can never disagree about what counts as a hit.
    function hasAnyMatch(term) {
        const pattern = searchUnits(term);
        if (pattern.norm.trim().length === 0) return false;
        for (let i = 0; i < vocabulary.length; i++) {
            if (checkOneWayMatch(vocabulary[i].searchUnits, pattern)) return true;
        }
        for (let i = 0; i < formsList.length; i++) {
            if (checkOneWayMatch(formsList[i].searchUnits, pattern)) return true;
        }
        return false;
    }

    // Returns {term, rule, typed, shown, dead} when a rule applies to a search that
    // found nothing. Two tiers:
    //
    //   dead:false -- the rewrite finds real entries. Show the rule AND the entries.
    //   dead:true  -- the rewrite finds nothing either, but NO HEADWORD IN THE DICTIONARY
    //                 BEGINS WITH THE TYPED SEQUENCE AT ALL. `inp-` is not a rare spelling
    //                 here, it is an impossible one, so we still know the student is
    //                 spelling it the other way and can say so. This is the case that
    //                 matters most: `inpleat` is an inflected form, which this prefix
    //                 search would miss even spelled `impleat`, so without this tier the
    //                 student gets a blank box and no idea why.
    function findAssimilationRedirect(term) {
        const norm = normalizeForSearch(term);
        let impossible = null;
        for (let i = 0; i < ASSIMILATION_RULES.length; i++) {
            const rule = ASSIMILATION_RULES[i];
            if (norm.indexOf(rule.from) !== 0) continue;
            const rewritten = rule.to + term.slice(rule.from.length);
            if (hasAnyMatch(rewritten)) {
                return { term: rewritten, rule: rule, typed: rule.from,
                         shown: rule.to, dead: false };
            }
            // Only claim impossibility once, and only if the bare sequence really is absent.
            if (!impossible && !hasAnyMatch(rule.from)) {
                impossible = { term: term, rule: rule, typed: rule.from,
                               shown: rule.to, dead: true };
            }
        }
        return impossible;
    }

    // Strips out all punctuation, diacritics, and handles i/j equivalence for search
    function normalizeForSearch(str) {
        if (!str) return '';
        return str
            .toLowerCase()
            .replace(/j/g, 'i') // Maps j to i for texts like Pharr
            .normalize('NFD')   // Separates letters from their diacritic marks
            .replace(/\p{Diacritic}/gu, '') // Deletes the isolated diacritic marks
            .replace(/,|;|\.|:|-|\u2013|\u2014|\(|\)|=|>|</g, '') // Cleans punctuation
            .trim(); 
    }

    // Split a string into one unit per LETTER: the bare letter, plus whatever combining
    // marks rode on it. `units.norm[i]` and `units.marks[i]` always describe the same
    // letter, and the leading space of the space-prefix rule is built in.
    //
    // WHY THIS EXISTS. The old checker held two parallel strings -- the raw text and the
    // diacritic-stripped text -- and indexed both with a position computed in the stripped
    // one. That is only safe while every accented glyph is ONE code unit, which is true of
    // `ī` (U+012B) and false of a STACKED diacritic: `ȳ̆` is U+0233 plus a combining breve,
    // two units where the stripped string has one. Past such a letter the two strings are
    // out of step and the comparison reads the wrong character. Four headwords carry the
    // anceps notation -- `mihī̆`, `tibī̆`, `Hȳ̆mēn`, `Sȳ̆chaeus` -- so typing `mihī` or
    // `sȳchaeus` found nothing at all, while the bare `mihi` and `sychaeus` worked.
    function searchUnits(str) {
        const src = String(str || '')
            .toLowerCase()
            .replace(/j/g, 'i')
            .replace(/,|;|\.|:|-|–|—|\(|\)|=|>|</g, '')
            .normalize('NFD');
        let norm = ' ';
        const marks = [''];
        let lastWasSpace = true;
        for (const ch of src) {
            if (/\p{Diacritic}/u.test(ch)) {
                marks[marks.length - 1] += ch;
                continue;
            }
            if (/\s/.test(ch)) {
                if (lastWasSpace) continue;
                norm += ' '; marks.push(''); lastWasSpace = true;
                continue;
            }
            norm += ch; marks.push(''); lastWasSpace = false;
        }
        while (norm.length > 1 && norm.charAt(norm.length - 1) === ' ') {
            norm = norm.slice(0, -1); marks.pop();
        }
        return { norm: norm, marks: marks };
    }

    // One-Way Macron Strictness Checker.
    // Type a bare vowel and you get long or short; type a macron and the short is rejected.
    //
    // The marks a student typed must be a SUBSET of the marks on the dictionary's letter,
    // not equal to them. That is what makes the anceps notation behave: `ī̆` means "long or
    // short here", so someone who types the macron of `mihī` should be shown `mihī̆`, while
    // someone who types a bare `mihi` still gets it and someone who types `mihĭ` gets it too.
    function checkOneWayMatch(target, search) {
        let startIdx = 0;
        while (startIdx < target.norm.length) {
            const matchIdx = target.norm.indexOf(search.norm, startIdx);
            if (matchIdx === -1) return false;

            let isValid = true;
            for (let i = 0; i < search.norm.length && isValid; i++) {
                const typed = search.marks[i];
                if (!typed) continue;              // bare letter: accepts anything
                const onEntry = target.marks[matchIdx + i] || '';
                for (const mark of typed) {
                    if (onEntry.indexOf(mark) === -1) { isValid = false; break; }
                }
            }
            if (isValid) return true;
            startIdx = matchIdx + 1;
        }
        return false;
    }

    // Custom CSV Parser built without array literal brackets to survive UI bugs
    function parseCSV(data) {
        const records = new Array();
        const lines = data.trim().split(/\r?\n/).slice(1); // Skips header row

        for (const line of lines) {
            let inQuotes = false;
            let currentVal = "";
            const values = new Array();

            // Manually splits columns to respect commas hidden inside quotation marks
            for (let i = 0; i < line.length; i++) {
                const char = line.charAt(i);
                if (char === '"') {
                    inQuotes = !inQuotes;
                } else if (char === ',' && !inQuotes) {
                    values.push(currentVal.trim());
                    currentVal = "";
                } else {
                    currentVal += char;
                }
            }
            values.push(currentVal.trim());
            
            if (values.length >= 2) {
                // Using slice.pop() as a safe alternative to array indexing
                const latin = (values.slice(0, 1).pop() || '').replace(/"/g, '');
                const definition = (values.slice(1, 2).pop() || '').replace(/"/g, '');
                const column3 = (values.slice(2, 3).pop() || '').replace(/"/g, '');
                const column4 = (values.slice(3, 4).pop() || '').replace(/"/g, '');

                // Columns 5-7 say what column 2 flattens away: a word-level heading
                // ("with the ablative", which governs EVERY sense), the senses as
                // separate pieces, and which one is the CORE. The toolkit sends them
                // because they cannot be recovered from column 2 -- a comment may
                // contain a semicolon, and a leading "(...)" is either a heading over
                // all the senses or one sense's own note, with nothing to tell them
                // apart. A file exported before 2026-09-17 has no such columns; these
                // come out empty and the definition is drawn the old way.
                const senseHeading = (values.slice(4, 5).pop() || '').replace(/"/g, '');
                const senseCol = (values.slice(5, 6).pop() || '').replace(/"/g, '');
                const coreCol = (values.slice(6, 7).pop() || '').replace(/"/g, '');
                const senses = senseCol ? senseCol.split(' ‖ ') : new Array();
                // 1-based in the file so that "no core marked" is an empty cell rather
                // than a 0 competing with a real position; -1 here means none.
                const coreSense = parseInt(coreCol) > 0 ? parseInt(coreCol) - 1 : -1;

                let frequency = null;
                let partOfSpeech = '';
                
                const freqNum = parseInt(column3);

                // Dynamically determines if column 3 is Frequency or Part of Speech
                if (!isNaN(freqNum)) {
                    frequency = freqNum;
                    partOfSpeech = column4;
                } else {
                    partOfSpeech = column3;
                }

                records.push({
                    latin: latin, 
                    definition: definition,
                    senseHeading: senseHeading,
                    senses: senses,
                    coreSense: coreSense,
                    frequency: frequency,
                    partOfSpeech: partOfSpeech,
                    forms: new Array() // Will be populated after forms.csv is loaded
                });
            }
        }
        return records;
    }

    // Similar robust parser for the forms list
    function parseFormsCSV(data) {
        const records = new Array();
        const lines = data.trim().split(/\r?\n/).slice(1);

        for (const line of lines) {
            let inQuotes = false;
            let currentVal = "";
            const values = new Array();

            for (let i = 0; i < line.length; i++) {
                const char = line.charAt(i);
                if (char === '"') {
                    inQuotes = !inQuotes;
                } else if (char === ',' && !inQuotes) {
                    values.push(currentVal.trim());
                    currentVal = "";
                } else {
                    currentVal += char;
                }
            }
            values.push(currentVal.trim());

            if (values.length >= 3) {
                records.push({
                    form: (values.slice(0, 1).pop() || '').replace(/"/g, ''),
                    lemma: (values.slice(1, 2).pop() || '').replace(/"/g, ''),
                    definition: (values.slice(2, 3).pop() || '').replace(/"/g, '')
                });
            }
        }
        return records;
    }
    
    // --- UI Update Functions ---

    // Fills the left-hand alphabetical sidebar
    function populateWordWheel() {
        wordWheel.innerHTML = '';
        const fragment = document.createDocumentFragment();
        vocabulary.forEach(word => {
            const li = document.createElement('li');
            li.innerHTML = formatHeadwordHTML(word.latin);
            li.dataset.latin = word.latin;
            fragment.appendChild(li);
        });
        wordWheel.appendChild(fragment);
    }

    // Renders the main definition card when a word is selected
    // `fromKey` is the English word she clicked through from, when there is one: the card then
    // offers the way back to it, so a choice between options is never a one-way trip.
    function displayWordDetails(word, selectedFormObj = null, fromKey = null) {
        if (!word) {
            resultDisplay.innerHTML = `<div class="placeholder-text"><p>Word not found.</p></div>`;
            return;
        }
        lastLatinWord = word;
        const isSaved = studyList.includes(word.latin);
        const backHtml = fromKey
            ? `<button type="button" class="pin-back">← Back to the English <span class="pin-key">${escapeHTML(fromKey)}</span></button>`
            : '';
        
        // Dynamically sets button color/text based on save state
        const buttonHtml = `<button class="btn add-to-list-btn-action ${isSaved ? 'btn-danger' : 'btn-primary'}">${isSaved ? 'Remove from List' : 'Add to List'}</button>`;
        
        const posHtml = word.partOfSpeech ? `<div class="part-of-speech">${word.partOfSpeech}</div>` : '';
        // THIS COLUMN IS THE DCC RANK, NOT A CORPUS COUNT -- the one place this app
        // differs from its ece-mythology sibling. How often a word turns up in Cloelia is
        // not a useful number for this class: the vocabulary is chosen AGAINST a frequency
        // baseline rather than measured by these texts. So the slot carries the word's
        // rank on the DCC Latin Core list, and 0 where it is not on the list at all --
        // 0 because the CSV is parsed by column index and read as a number, so a blank
        // here would be taken as the part of speech.
        const freqHtml = (word.frequency === null) ? ''
            : (word.frequency === 0)
                ? `<div class="frequency">Not on the <a href="https://dcc.dickinson.edu/latin-core-list1" target="_blank" rel="noopener">DCC Latin Core</a> list.</div>`
                : `<div class="frequency"><a href="https://dcc.dickinson.edu/latin-core-list1" target="_blank" rel="noopener">DCC Latin Core</a>: the #${word.frequency} most frequent word in Latin literature</div>`;

        // Builds the dropdown HTML for grammatical forms if they exist
        let formsHtml = '';
        if (word.forms && word.forms.length > 0) {
            const isOpen = selectedFormObj ? 'open' : '';
            const listItems = word.forms.map(f => {
                const isSelected = selectedFormObj && f.form === selectedFormObj.form;
                return `<li class="${isSelected ? 'highlighted-form' : ''}">
                    <span class="form-name">${f.form}</span>: ${f.definition}
                </li>`;
            }).join('');
            
            formsHtml = `
                <details class="forms-section" ${isOpen}>
                    <summary>Forms</summary>
                    <ul class="forms-list">
                        ${listItems}
                    </ul>
                </details>
            `;
        }

        // Injects the final parsed HTML into the screen
        resultDisplay.innerHTML = `
            ${backHtml}
            <div class="result-header">
                <h2>${formatHeadwordHTML(word.latin)}</h2>
                ${buttonHtml}
            </div>
            ${posHtml}
            ${formatSensesHTML(word)}
            ${formsHtml}
            ${freqHtml}
            <div class="result-footer">${buttonHtml}</div>
        `;

        // If a specific form was searched, scroll it to the center of the forms box
        if (selectedFormObj) {
            const highlighted = resultDisplay.querySelector('.highlighted-form');
            if (highlighted) {
                setTimeout(() => highlighted.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
            }
        }
        
        // Attach click listeners to the Add/Remove buttons
        resultDisplay.querySelectorAll('.add-to-list-btn-action').forEach(btn => {
            btn.addEventListener('click', () => {
                if (isSaved) removeFromStudyList(word.latin);
                else addToStudyList(word.latin);
                displayWordDetails(word, selectedFormObj, fromKey);
            });
        });
        const back = resultDisplay.querySelector('.pin-back');
        if (back) back.addEventListener('click', () => setDirection('en'));

        updateWordWheelSelection(word.latin);
        
        // Leaves the specific form in the search bar if they typed one, otherwise clears {comments}
        searchInput.value = selectedFormObj ? selectedFormObj.form : word.latin.replace(/\{.*?\}/g, '').trim();
        suggestionsList.style.display = 'none';
    }
    
    // Highlights the active word in the left sidebar
    function updateWordWheelSelection(latinWord) {
        const currentSelected = wordWheel.querySelector('.selected');
        if (currentSelected) currentSelected.classList.remove('selected');
        const items = wordWheel.querySelectorAll('li');
        let newSelectedItem = null;
        for (const item of items) {
            // The same list holds English words on the English side (data-key).
            if (item.dataset.latin === latinWord || item.dataset.key === latinWord) {
                newSelectedItem = item;
                break;
            }
        }

        if (newSelectedItem) {
            newSelectedItem.classList.add('selected');
            newSelectedItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
    
    // Colors words green in the sidebar if they are in the Study List
    function updateWordWheelStyles() {
        const studyListSet = new Set(studyList);
        wordWheel.querySelectorAll('li').forEach(li => {
            li.classList.toggle('in-study-list', studyListSet.has(li.dataset.latin));
        });
    }

    // --- Study List & Storage Functions ---

    function saveStudyList() {
        localStorage.setItem(STORAGE_KEY_LIST, JSON.stringify(studyList));
        updateWordWheelStyles();
    }

    function loadStudyList() {
        const savedList = localStorage.getItem(STORAGE_KEY_LIST);
        if (savedList) {
            try { studyList = JSON.parse(savedList); } 
            catch (e) { studyList = new Array(); }
        }
    }

    function addToStudyList(latinWord) {
        if (!studyList.includes(latinWord)) {
            studyList.push(latinWord);
            saveStudyList();
        }
    }
    
    function removeFromStudyList(latinWord, refreshModal = false) {
        studyList = studyList.filter(word => word !== latinWord);
        saveStudyList();
        if (refreshModal) showStudyListModal();
    }
    
    // Builds the Study List Modal UI
    function showStudyListModal() {
        studyListUl.innerHTML = '';
        if (studyList.length === 0) {
            studyListPlaceholder.style.display = 'block';
        } else {
            studyListPlaceholder.style.display = 'none';
            
            // Sorts the study list alphabetically, ignoring any {comments}
            studyList.sort((a, b) => {
                const keyA = normalizeForSearch(a.replace(/\{.*?\}/g, ''));
                const keyB = normalizeForSearch(b.replace(/\{.*?\}/g, ''));
                return keyA.localeCompare(keyB);
            }).forEach(latinWord => {
                const wordObject = vocabulary.find(w => w.latin === latinWord);
                if (wordObject) {
                    const freqHtml = (wordObject.frequency === null) ? ''
                        : (wordObject.frequency === 0)
                            ? `<span class="study-list-frequency">not on the DCC core list</span>`
                            : `<span class="study-list-frequency">DCC core: #${wordObject.frequency} most frequent</span>`;
                    const li = document.createElement('li');
                    li.innerHTML = `
                        <div class="study-list-item-content">
                            <span class="study-list-latin">${formatHeadwordHTML(wordObject.latin)}</span>
                            <span class="study-list-definition">${formatDefinitionHTML(wordObject.definition)}</span>
                            ${freqHtml}
                        </div>
                        <button class="remove-from-list-btn" data-word="${latinWord}" title="Remove from list">&times;</button>
                    `;
                    studyListUl.appendChild(li);
                }
            });
        }
        studyListModal.style.display = 'flex';
    }

    // Creates the formatted string for TSV Export
    function generateTSVContent() {
        return studyList.map(latinWord => {
            const word = vocabulary.find(w => w.latin === latinWord);
            if (!word) return '';

            const row = Array.of(word.latin, word.definition);
            if (word.frequency !== null) row.push(word.frequency);
            if (word.partOfSpeech) row.push(word.partOfSpeech);
            
            return row.join('\t');
        }).filter(Boolean).join('\n');
    }

    function downloadTSV() {
        const blobContent = Array.of(generateTSVContent());
        const blob = new Blob(blobContent, { type: 'text/tab-separated-values;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", "latin_study_list.tsv");
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    function copyTSVToClipboard() {
        const tsvContent = generateTSVContent();
        if (!navigator.clipboard) { alert("Clipboard API not available."); return; }
        navigator.clipboard.writeText(tsvContent).then(() => {
            const originalText = copyListBtn.textContent;
            copyListBtn.textContent = "Copied!";
            setTimeout(() => { copyListBtn.textContent = originalText; }, 2000);
        }).catch(err => { alert('Failed to copy list.'); });
    }

    function handleImport() {
        if (!confirm("This will replace your current study list. Are you sure?")) return;
        importFileInput.click();
    }

    // Validates and processes an uploaded TSV file
    function processImportFile(e) {
        const file = e.target.files.item(0);
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(event) {
            const content = event.target.result;
            const lines = content.trim().split('\n');
            const firstLine = lines.slice(0, 1).pop();
            const firstLineCols = lines.length > 0 ? firstLine.split('\t') : new Array();
            const firstCol = firstLineCols.slice(0, 1).pop() || '';
            
            // Checks if the first row is a header and skips it if so
            const hasHeader = firstLineCols.length > 0 && (firstCol.toLowerCase().includes('latin') || firstCol.toLowerCase().includes('word'));
            const dataLines = hasHeader ? lines.slice(1) : lines;
            const newList = new Array();
            
            // Only allows words that actually exist in the current dictionary
            const allLatinWords = new Set(vocabulary.map(v => v.latin));
            dataLines.forEach(line => {
                const parts = line.split('\t');
                const latinWord = parts.slice(0, 1).pop().trim();
                if (latinWord && allLatinWords.has(latinWord)) newList.push(latinWord);
            });
            
            studyList = Array.from(new Set(newList));
            saveStudyList();
            showStudyListModal();
            alert(`Import complete. ${studyList.length} valid words were added.`);
        };
        reader.readAsText(file);
        e.target.value = ''; // Resets the input so the same file can be uploaded again if needed
    }

    // --- The English side ------------------------------------------------------------------
    //
    // WHAT IT IS FOR. The Latin side answers "what does this word mean?". A student writing
    // Latin needs the other question -- "how do I say this?" -- and the answer should steer
    // her toward the words the class is practising, not the whole of Latin. So every option
    // is one the class has met, in the teacher's order, and each says WHERE she met it.
    //
    // WHAT IT DOES NOT DO: judge. When one English word honestly means two Latin words
    // (`fellow`: vir and homō) both are shown, with the guidance line that tells them apart.
    // Seeing the contrast at the moment of choosing is the lesson.

    // English is matched the way Latin is: from the START of any word in the key, so `elect`
    // finds "elect" and "elected official" but `lect` finds nothing.
    function englishNorm(str) {
        return ' ' + String(str || '').toLowerCase()
            .normalize('NFD').replace(/\p{Diacritic}/gu, '')
            .replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
    }

    function onEnglishSearch(typed) {
        const term = englishNorm(typed);
        if (term.trim().length === 0) { suggestionsList.style.display = 'none'; return; }
        const hits = new Array();
        for (const k of englishKeys) {
            const nk = englishNorm(k);
            if (nk.indexOf(term) === -1) continue;
            // exact first, then keys that BEGIN with what she typed, then shorter keys:
            // `state` should not be buried under `statesman` and `state religion`.
            hits.push({ key: k, rank: nk === term ? 0 : (nk.indexOf(term) === 0 ? 1 : 2) });
        }
        hits.sort((a, b) => a.rank - b.rank || a.key.length - b.key.length ||
                            a.key.localeCompare(b.key));
        suggestionsList.innerHTML = '';
        if (hits.length === 0) {
            const none = document.createElement('div');
            none.className = 'english-none';
            none.textContent = 'No Latin word in this dictionary is found under that English. ' +
                               'Try a simpler word, or one with the same meaning.';
            suggestionsList.appendChild(none);
            suggestionsList.style.display = 'block';
            return;
        }
        hits.slice(0, 10).forEach(h => {
            const div = document.createElement('div');
            const opts = english.keys[h.key];
            const preview = opts.slice(0, 3).map(o => o.h.split(',')[0]).join(' · ') +
                            (opts.length > 3 ? ' …' : '');
            div.innerHTML = '<span class="english-key">' + escapeHTML(h.key) + '</span>' +
                            ' <span class="english-preview">' + escapeHTML(preview) + '</span>';
            div.addEventListener('mousedown', () => displayEnglishKey(h.key));
            suggestionsList.appendChild(div);
        });
        suggestionsList.style.display = 'block';
    }

    // Where she met the word. The toolkit sends either the names of the texts it is read in,
    // or one of two phrases for a word she has not read in a text yet.
    function tagHTML(t) {
        if (!t) return '';
        const phrase = (t === 'known already' || t === 'on the study list');
        return '<div class="option-tag">' + (phrase ? escapeHTML(t) : 'Read in ' + escapeHTML(t)) +
               '</div>';
    }

    // The strip starts OPEN -- the forms are what a writer needs -- but a student who closes
    // it has said it is too much, so it stays closed, on every word, until she opens one again
    // (owner, 2026-09-21). One preference for the whole app, kept in this browser only.
    // Storage can be blocked (private windows): then it simply is not remembered.
    const STORAGE_KEY_FORMS = 'formsStripClosed';
    function formsClosed() {
        try { return localStorage.getItem(STORAGE_KEY_FORMS) === '1'; } catch (e) { return false; }
    }
    function setFormsClosed(closed) {
        try {
            if (closed) localStorage.setItem(STORAGE_KEY_FORMS, '1');
            else localStorage.removeItem(STORAGE_KEY_FORMS);
        } catch (e) { /* blocked: not remembered */ }
    }

    // THE FORMS STRIP: which form do I write? Only forms the class's own texts use, each with
    // the English it translates and where it was read. The label is the English, never a
    // grammar term -- "(they) are elected", not "3rd plural present passive".
    // THE FORMS SHE ASKED FOR COME FIRST. Under an English word, any form whose English
    // contains that word -- as a whole word -- rises to the top of the strip and is marked.
    // That is what makes `sum` usable at all: its "synonyms" (am, is, was, been) are not other
    // Latin words but other FORMS of this one, so `was` must put erat and eram in front of
    // her, not sum. The same rule serves every verb: `elected` lifts "(he/she/it) is elected".
    // A key of four letters or more also matches the START of a word, so `elect` finds
    // "elected" and "electing". A shorter one must match whole -- `be` is not "been", and
    // `is` must not light up every word that begins with those two letters.
    function labelText(label) {
        return label.toLowerCase().replace(/\([^)]*\)/g, ' ')
                    .replace(/[^a-z' ]+/g, ' ').replace(/\s+/g, ' ').trim();
    }
    function labelMatches(label, key) {
        if (!key || !label) return false;
        const k = key.toLowerCase().trim();
        const text = ' ' + labelText(label) + ' ';
        return k.length >= 4 ? text.indexOf(' ' + k) !== -1 : text.indexOf(' ' + k + ' ') !== -1;
    }

    function formsStripHTML(headword, key) {
        const strip = english.forms[headword];
        if (!strip || !strip.f.length) return '';
        // the closest match first: under `be`, "to be" (esse) before "(we) will be"
        const hits = strip.f.filter(f => labelMatches(f[1], key))
                            .sort((a, b) => labelText(a[1]).length - labelText(b[1]).length);
        const rest = strip.f.filter(f => !labelMatches(f[1], key));
        const chips = hits.concat(rest).map(f => {
            const [form, label, cite] = f;
            return '<li class="form-chip' + (labelMatches(label, key) ? ' form-match' : '') +
                   '"><span class="form-chip-latin">' + escapeHTML(form) +
                   '</span>' + (label ? ' <span class="form-chip-label">' + escapeHTML(label) +
                   '</span>' : '') + (cite ? ' <span class="form-chip-cite">' + escapeHTML(cite) +
                   '</span>' : '') + '</li>';
        }).join('');
        return '<details class="forms-strip"' + (formsClosed() ? '' : ' open') +
               '><summary>Forms in your texts (' + strip.f.length +
               ')</summary>' + (strip.c ? '<p class="forms-caption">' + escapeHTML(strip.c) +
               '</p>' : '') + '<ul>' + chips + '</ul></details>';
    }

    function displayEnglishKey(key) {
        const opts = english && english.keys[key];
        if (!opts) return;
        lastEnglishKey = key;
        const many = opts.length > 1;
        const items = opts.map((o, i) => {
            const pos = o.i ? 'Idiom' : o.p;
            // ONE OPTION: there is nothing to choose between, so show the WHOLE word with the
            // meaning she searched for highlighted (owner, 2026-09-21). SEVERAL: show only the
            // meaning each one has under this English word -- the distinctions are the point
            // there, and a click on the word gives the fuller treatment.
            const word = (!many && !o.i) ? vocabulary.find(w => w.latin === o.go) : null;
            const meaning = word
                ? '<div class="option-senses">' + formatSensesHTML(word, o.s || []) + '</div>'
                : (o.g ? '<div class="option-gloss">' + formatDefinitionHTML(o.g) + '</div>' : '');
            return '<li class="english-option">' +
                '<div class="option-head"><button type="button" class="option-latin" data-i="' + i +
                '">' + formatHeadwordHTML(escapeHTML(o.h)) + '</button>' +
                (pos ? ' <span class="option-pos">' + escapeHTML(pos) + '</span>' : '') + '</div>' +
                meaning +
                // Guidance is the "which one?" answer, so it is shown only when there IS a choice.
                (many && o.u ? '<div class="option-guidance">' + escapeHTML(o.u) + '</div>' : '') +
                tagHTML(o.t) +
                (o.i ? '' : formsStripHTML(o.go, key)) +
                '</li>';
        }).join('');
        // A GENERATED FORM SAYS WHAT IT IS: "went — the past of go". The student learns where
        // the word she typed sits, and the forms strip below lifts the Latin that matches it.
        const kinds = Array.from(new Set(opts.filter(o => o.x).map(o => o.x)));
        const inflHtml = kinds.length
            ? '<div class="english-inflection">“' + escapeHTML(key) + '” is the ' +
              kinds.map(x => escapeHTML(x).replace(/ of (.+)$/, ' of “$1”')).join(', or the ') +
              '</div>'
            : '';
        resultDisplay.innerHTML =
            '<div class="result-header"><h2 class="english-heading">' + escapeHTML(key) + '</h2></div>' +
            inflHtml +
            '<div class="part-of-speech">' + (many ? opts.length + ' Latin words — choose the one that fits'
                                                   : 'In Latin') + '</div>' +
            '<ol class="english-options">' + items + '</ol>';
        resultDisplay.querySelectorAll('.option-latin').forEach(btn => {
            btn.addEventListener('click', () => {
                const o = opts[Number(btn.dataset.i)];
                const word = vocabulary.find(w => w.latin === o.go);
                if (!word) return;
                pin = { key: key, word: word.latin };
                setDirection('la', true);
                displayWordDetails(word, null, key);
            });
        });
        searchInput.value = key;
        suggestionsList.style.display = 'none';
        updateWordWheelSelection(key);
    }

    // The English word list, A-Z. A second order (grouped by text, or by theme -- e.g. "words
    // for describing a government") was built and retired for now (owner, 2026-09-21):
    // alphabetical first, and the grouping decided once the class shows what it needs.
    function populateEnglishWheel() {
        wordWheel.innerHTML = '';
        const fragment = document.createDocumentFragment();
        wheelKeys.forEach(k => {
            const li = document.createElement('li');
            li.textContent = k;
            li.dataset.key = k;
            fragment.appendChild(li);
        });
        wordWheel.appendChild(fragment);
    }

    // Flip the dictionary. `quiet` skips restoring the view -- used when the caller is about
    // to draw a card itself (clicking a Latin option draws that word, not the last one).
    function setDirection(dir, quiet = false) {
        direction = dir;
        directionToggle.querySelectorAll('button').forEach(b =>
            b.setAttribute('aria-pressed', String(b.dataset.dir === dir)));
        document.body.classList.toggle('english-mode', dir === 'en');
        searchInput.placeholder = dir === 'en' ? 'Type an English word...' : 'Type a Latin word...';
        wordWheelTitle.textContent = dir === 'en' ? 'English words' : 'Vocabulary List';
        wheelLegend.hidden = dir === 'en';
        suggestionsList.style.display = 'none';
        searchInput.value = '';
        if (dir === 'en') populateEnglishWheel();
        else { populateWordWheel(); updateWordWheelStyles(); }
        if (quiet) return;
        if (dir === 'en') {
            // from the Latin word on screen to its English
            const w = lastLatinWord;
            const key = !w ? null
                : (pin && pin.word === w.latin) ? pin.key
                : (english.anchor || {})[w.latin] || null;
            // ...and pin the pair, so flipping straight back returns to THIS word, not to the
            // English word's first option (`disturb` may list another verb first).
            if (key && english.keys[key]) { pin = { key: key, word: w.latin }; displayEnglishKey(key); return; }
            lastEnglishKey = null;
            resultDisplay.innerHTML = '<div class="placeholder-text"><p>' + (w
                ? 'No English word leads to <b>' + formatHeadwordHTML(escapeHTML(w.latin)) +
                  '</b> yet.' : 'Type an English word to find the Latin for it.') + '</p></div>';
            return;
        }
        // from the English word on screen to its Latin
        const k = lastEnglishKey;
        const opts = k && english.keys[k];
        if (opts) {
            const go = (pin && pin.key === k) ? pin.word : opts[0].go;
            const word = vocabulary.find(w => w.latin === go);
            if (word) { pin = { key: k, word: word.latin }; displayWordDetails(word, null, k); return; }
        }
        lastLatinWord = null;
        resultDisplay.innerHTML = '<div class="placeholder-text"><p>Search for a word or select ' +
            'one from the list to see its details.</p></div>';
    }

    // --- Event Handlers (The Search Engine) ---

    function onSearchInput(e) {
        const typedSearchTerm = e.target.value;
        if (direction === 'en') { onEnglishSearch(typedSearchTerm); return; }

        if (normalizeForSearch(typedSearchTerm).length === 0) {
            suggestionsList.style.display = 'none';
            return;
        }

        // Only when the search finds NOTHING do we try an assimilation rule. That ordering
        // is the safety property: a redirect can never hide a real entry, so `adsum` and
        // `subrideo` need no special case -- they match, so nothing fires.
        let redirect = null;
        if (!hasAnyMatch(typedSearchTerm)) {
            redirect = findAssimilationRedirect(typedSearchTerm);
        }
        const rawSearchTerm = (redirect && !redirect.dead) ? redirect.term : typedSearchTerm;
        const normalizedSearchTerm = normalizeForSearch(rawSearchTerm);

        // Prepares the "Space-Prefix" matching pattern: one unit per letter, so the macron
        // check stays aligned even across a stacked diacritic.
        const searchPattern = searchUnits(rawSearchTerm);

        const collapsedSearchNorm = normalizedSearchTerm.replace(/\s+/g, ' ');
        const searchWordsNorm = collapsedSearchNorm.split(' ');

        let matches = new Array();
        const addedDisplays = new Set(); // Prevents duplicate visual entries

        // 1. Check Standard Dictionary Lemmata
        vocabulary.forEach(word => {
            const cleanLatinRaw = word.latin.toLowerCase().replace(/\{(.*?)\}/g, ' ');
            const collapsedLemmaNorm = normalizeForSearch(cleanLatinRaw).replace(/\s+/g, ' ');

            if (checkOneWayMatch(word.searchUnits, searchPattern)) {
                
                // Flag as "isExact" if it perfectly matches the whole word or a distinct sub-word
                let isExact = false;
                if (collapsedLemmaNorm === collapsedSearchNorm) {
                    isExact = true;
                } else {
                    const words = collapsedLemmaNorm.split(' ');
                    if (words.indexOf(collapsedSearchNorm) !== -1) {
                        isExact = true;
                    }
                }

                matches.push({
                    type: 'lemma',
                    text: word.latin,
                    displayStr: word.latin,
                    word: word,
                    isForm: false,
                    isExact: isExact
                });
                addedDisplays.add(word.latin);
            }
        });

        // 2. Check Inflected Grammar Forms
        formsList.forEach(formObj => {
            const collapsedFormNorm = normalizeForSearch(formObj.form).replace(/\s+/g, ' ');

            if (checkOneWayMatch(formObj.searchUnits, searchPattern)) {
                const displayStr = formObj.form + ' > ' + formObj.lemma;
                if (!addedDisplays.has(displayStr)) {
                    const wordObj = vocabulary.find(w => w.latin === formObj.lemma);
                    if (wordObj) {
                        let isExact = false;
                        if (collapsedFormNorm === collapsedSearchNorm) {
                            isExact = true;
                        }

                        matches.push({
                            type: 'form',
                            text: formObj.form,
                            displayStr: displayStr,
                            word: wordObj,
                            formObj: formObj,
                            isForm: true,
                            isExact: isExact
                        });
                        addedDisplays.add(displayStr);
                    }
                }
            }
        });

        // 3. Apply the Sorting Hierarchy
        matches.sort((a, b) => {
            // Rule A: Exact Matches rise to the very top
            if (a.isExact !== b.isExact) {
                return a.isExact ? -1 : 1;
            }
            // Rule B: Dictionary Lemmata defeat Inflected Forms
            if (a.isForm !== b.isForm) {
                return a.isForm ? 1 : -1;
            }
            // Rule C: Highest Dictionary Frequency wins
            const freqA = a.word.frequency !== null ? a.word.frequency : -1;
            const freqB = b.word.frequency !== null ? b.word.frequency : -1;
            if (freqA !== freqB) {
                return freqB - freqA; 
            }
            // Rule D: Alphabetical Tie-Breaker
            const keyA = normalizeForSearch(a.displayStr.replace(/\{.*?\}/g, ''));
            const keyB = normalizeForSearch(b.displayStr.replace(/\{.*?\}/g, ''));
            return keyA.localeCompare(keyB);
        });

        // Limit to top 10 results to keep UI clean
        const topMatches = matches.slice(0, 10);
        suggestionsList.innerHTML = '';

        // The rule, named, above the results it rescued. Not a clickable suggestion --
        // it is a small lesson, and it should not look like one of the answers.
        if (redirect) {
            const banner = document.createElement('div');
            banner.className = 'assimilation-notice';
            let html =
                '<span class="assim-shift"><span class="assim-from">' + redirect.typed +
                '-</span><span class="assim-arrow">→</span><span class="assim-to">' +
                redirect.shown + '-</span></span>' +
                '<span class="assim-note">' + redirect.rule.note + '</span>';
            if (redirect.dead) {
                html += '<span class="assim-note assim-dead">No headword here begins <em>' +
                        redirect.typed + '-</em>. Try <strong>' + redirect.shown +
                        '-</strong>, or delete a letter or two from the end.</span>';
            }
            banner.innerHTML = html;
            suggestionsList.appendChild(banner);
        }

        if (topMatches.length > 0) {
            topMatches.forEach(match => {
                const div = document.createElement('div');
                
                // Visually demotes inflected forms with CSS
                if (match.isForm) {
                    div.classList.add('is-form-match');
                }

                let innerHtml = "";
                // Protects comments from getting bolded by splitting the string
                const segments = match.text.split(/(\{.*?\})/g);
                
                segments.forEach(segment => {
                    if (segment.startsWith('{') && segment.endsWith('}')) {
                        const innerText = segment.substring(1, segment.length - 1);
                        innerHtml += '<span class="headword-comment">' + innerText + '</span>';
                    } else {
                        // Applies bolding to the matching parts of the Latin text
                        const parts = segment.split(' ');
                        const htmlParts = parts.map(part => {
                            const normPart = normalizeForSearch(part);
                            
                            if (normPart.length > 0) {
                                let matchedSearchWord = '';
                                for (let idx = 0; idx < searchWordsNorm.length; idx++) {
                                    const sw = searchWordsNorm.slice(idx, idx + 1).pop();
                                    if (sw.length > 0 && normPart.startsWith(sw)) {
                                        matchedSearchWord = sw;
                                        break;
                                    }
                                }

                                // Calculates exact index to stop bolding, jumping over punctuation
                                if (matchedSearchWord.length > 0) {
                                    let matchEndIndex = 0;
                                    let normCount = 0;
                                    for (let i = 0; i < part.length; i++) {
                                        const charNorm = normalizeForSearch(part.charAt(i));
                                        if (charNorm.length > 0) {
                                            normCount += charNorm.length;
                                        }
                                        if (normCount >= matchedSearchWord.length) {
                                            matchEndIndex = i + 1;
                                            break;
                                        }
                                    }

                                    if (matchEndIndex > 0) {
                                        return '<strong>' + part.substring(0, matchEndIndex) + '</strong>' + part.substring(matchEndIndex);
                                    }
                                }
                            }
                            return part;
                        });
                        innerHtml += htmlParts.join(' ');
                    }
                });
                
                // Appends the redirect label (e.g. "> rēs reī f.") for form matches
                if (match.isForm) {
                    innerHtml += ' <span class="search-form-lemma-label">&gt; ' + formatHeadwordHTML(match.word.latin) + '</span>';
                }

                div.innerHTML = innerHtml;
                div.addEventListener('mousedown', () => displayWordDetails(match.word, match.formObj));
                suggestionsList.appendChild(div);
            });
            suggestionsList.style.display = 'block';
        } else {
            // A dead-end notice is still worth showing on its own: it is the only thing
            // standing between the student and an unexplained empty box.
            suggestionsList.style.display = redirect ? 'block' : 'none';
        }
    }

    // Handles clicks on the left-hand alphabetical sidebar
    function onWordWheelClick(e) {
        if (e.target && e.target.nodeName === "LI" && e.target.dataset.key) {
            displayEnglishKey(e.target.dataset.key);
            if (window.innerWidth <= 768) closeMobileMenu();
            return;
        }
        if (e.target && e.target.nodeName === "LI" && e.target.dataset.latin) {
            const latinWord = e.target.dataset.latin;
            const wordObject = vocabulary.find(w => w.latin === latinWord);
            if (wordObject) {
                displayWordDetails(wordObject);
                // Auto-close sidebar on mobile after making a selection
                if (window.innerWidth <= 768) closeMobileMenu();
            }
        }
    }
    
    // --- Mobile Menu Controls ---
    function openMobileMenu() {
        wordWheelContainer.classList.add('mobile-visible');
        mobileMenuOverlay.style.display = 'block';
    }
    function closeMobileMenu() {
        wordWheelContainer.classList.remove('mobile-visible');
        mobileMenuOverlay.style.display = 'none';
    }

    // --- INITIALIZATION ---
    function initialize() {
        if (!localStorage.getItem(STORAGE_KEY_CONSENT)) {
            privacyNoticeModal.style.display = 'flex';
        }
        
        loadStudyList();

        // Fetch both dictionary CSVs in parallel for speed
        const fetchPromises = new Array();
        fetchPromises.push(
            fetch('vocabulary.csv')
            .then(response => {
                if (!response.ok) throw new Error("Vocab error");
                return response.text();
            })
        );
        fetchPromises.push(
            fetch('forms.csv')
            .then(response => {
                if (!response.ok) return ""; // Gracefully fails if forms.csv is missing
                return response.text();
            })
            .catch(() => "") 
        );

        Promise.all(fetchPromises)
        .then(results => {
            const vocabData = results.slice(0, 1).pop();
            const formsData = results.slice(1, 2).pop();

            vocabulary = parseCSV(vocabData);
            if (formsData && formsData.trim().length > 0) {
                formsList = parseFormsCSV(formsData);
            }

            // Connect sub-forms to their master headwords
            vocabulary.forEach(word => {
                word.forms = formsList.filter(f => f.lemma === word.latin);
            });

            // Precompute the search units once. They never change, and recomputing them
            // per keystroke meant an NFD normalize per dictionary entry -- roughly 2,000 of
            // them, and up to forty times that on a search which walks the whole
            // assimilation rule table before giving up.
            vocabulary.forEach(word => {
                word.searchUnits = searchUnits(word.latin.replace(/\{(.*?)\}/g, ' '));
            });
            formsList.forEach(f => { f.searchUnits = searchUnits(f.form); });

            // Sort Word Wheel alphabetically ignoring comments/punctuation
            vocabulary.sort((a, b) => {
                const keyA = normalizeForSearch(a.latin.replace(/\{.*?\}/g, ''));
                const keyB = normalizeForSearch(b.latin.replace(/\{.*?\}/g, ''));
                return keyA.localeCompare(keyB);
            });

            populateWordWheel();
            updateWordWheelStyles();
            loadEnglish();
        })
        .catch(error => {
            console.error('Error fetching dictionaries:', error);
            resultDisplay.innerHTML = `<div class="placeholder-text"><p style="color:var(--danger-color);">Error: Could not load vocabulary.csv. Please ensure the file is in the same folder as index.html.</p></div>`;
        });

        // Grammar links need no click handler: grammarLinkHTML builds real <a>
        // elements, so the browser routes them (and ctrl-click, middle-click and
        // the keyboard all behave the way a student expects).

        // Event Listener Bindings
        searchInput.addEventListener('input', onSearchInput);
        wordWheel.addEventListener('click', onWordWheelClick);
        
        // Timeout prevents dropdown from hiding before a click can register
        searchInput.addEventListener('blur', () => setTimeout(() => { suggestionsList.style.display = 'none'; }, 150));
        
        acknowledgePrivacyBtn.addEventListener('click', () => {
            privacyNoticeModal.style.display = 'none';
            localStorage.setItem(STORAGE_KEY_CONSENT, 'true');
        });

        viewStudyListBtn.addEventListener('click', showStudyListModal);
        closeStudyListModal.addEventListener('click', () => studyListModal.style.display = 'none');
        
        // Event delegation for deleting words from the study list
        studyListUl.addEventListener('click', (e) => {
            const removeBtn = e.target.closest('.remove-from-list-btn');
            if (removeBtn) {
                removeFromStudyList(removeBtn.dataset.word, true);
            }
        });

        downloadListBtn.addEventListener('click', downloadTSV);
        importListBtn.addEventListener('click', handleImport);
        importFileInput.addEventListener('change', processImportFile);
        copyListBtn.addEventListener('click', copyTSVToClipboard);

        toggleWordWheelBtn.addEventListener('click', openMobileMenu);
        closeWordWheelBtn.addEventListener('click', closeMobileMenu);
        mobileMenuOverlay.addEventListener('click', closeMobileMenu);

        // The credits point at the appendix through the SAME resolved base as the
        // grammar links, so a local test copy is exercised here too rather than
        // being the one link that quietly still goes to the live site.
        if (aboutPharrLink) aboutPharrLink.href = PHARR_BASE;

        aboutBtn.addEventListener('click', () => { aboutModal.style.display = 'flex'; });
        closeAboutModal.addEventListener('click', hideAboutModal);
        closeAboutBtn.addEventListener('click', hideAboutModal);
        // Clicking the dark backdrop closes it; clicking the card itself must not.
        aboutModal.addEventListener('click', (e) => { if (e.target === aboutModal) hideAboutModal(); });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && aboutModal.style.display === 'flex') hideAboutModal();
        });
    }

    function hideAboutModal() {
        aboutModal.style.display = 'none';
    }

    // The English side is OPTIONAL: fetched after the Latin side is up, and if english.json
    // is missing or broken the toggle simply never appears -- the dictionary a student already
    // relies on is never held hostage to the new half.
    function loadEnglish() {
        fetch('english.json')
            .then(r => { if (!r.ok) throw new Error('no english.json'); return r.json(); })
            .then(data => {
                if (!data || !data.keys) return;
                english = data;
                // Words A-Z, with the few numeral keys (`2`, `10`, `5th`) after them rather than
                // opening the list: they are there to be typed, not browsed.
                const numeric = k => /^[0-9]/.test(k) ? 1 : 0;
                englishKeys = Object.keys(data.keys).sort((a, b) =>
                    (numeric(a) - numeric(b)) || a.localeCompare(b));
                // `went`, `elected`, `men` are found by typing them, but listing every
                // inflection would bury the words under their own forms.
                wheelKeys = englishKeys.filter(k => !data.keys[k].every(o => o.x));
                directionToggle.hidden = false;
                directionToggle.querySelectorAll('button').forEach(b =>
                    b.addEventListener('click', () => { if (b.dataset.dir !== direction) setDirection(b.dataset.dir); }));
                // Remember whether she closed the forms strips. `toggle` does not bubble, so
                // it is caught on the way DOWN (capture) for every strip on every card.
                resultDisplay.addEventListener('toggle', (e) => {
                    if (e.target.classList && e.target.classList.contains('forms-strip')) {
                        setFormsClosed(!e.target.open);
                    }
                }, true);
            })
            .catch(err => console.info('[english] English side not available: ' + err.message));
    }

    document.addEventListener('DOMContentLoaded', initialize);
})();