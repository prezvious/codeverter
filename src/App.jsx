import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowRightLeft,
  ChevronDown,
  Code2,
  Copy,
  Loader2,
  Moon,
  Sun,
  Wrench
} from 'lucide-react';
import { LANGUAGES, convertCodeDeterministic, exampleCodeForLanguage } from './converterEngine.js';

const TRANSLATIONS = {
  'en-US': {
    appTitle: 'CodeVerter',
    appSubtitle: 'Deterministic Cross-Language Converter',
    sourceLanguagePlaceholder: 'Source Language',
    targetLanguagePlaceholder: 'Target Language',
    convertButton: 'Convert Code',
    converting: 'Converting...',
    sourceCodeTitle: 'Source Code',
    convertedCodeTitle: 'Converted Code',
    sourceCodePlaceholder: 'Enter your source code here...',
    convertedCodePlaceholder: 'Converted code will appear here...',
    convertingPlaceholder: 'Converting...',
    footerText1: 'No AI calls. Conversion runs fully in-browser through a deterministic intermediate representation.',
    footerText2: 'Supports all listed languages with best-effort structural mapping. Always validate with tests.',
    searchLanguagesPlaceholder: 'Search languages...',
    noLanguagesFound: 'No languages found',
    errorEmptyCode: 'Please enter some code to convert.',
    errorConversionFailed: 'Failed to convert code. Please try again.',
    copy: 'Copy',
    copied: 'Copied',
    copyError: 'Copy failed',
    sourceLanguageLabel: 'Source language',
    targetLanguageLabel: 'Target language',
    swapLanguages: 'Swap languages',
    loadSample: 'Load Sample',
    conversionNotes: 'Conversion Notes',
    parseStats: 'Parse Stats',
    themeLight: 'Light mode',
    themeDark: 'Dark mode',
    toggleTheme: 'Toggle color theme'
  },
  'es-ES': {
    appTitle: 'CodeVerter',
    appSubtitle: 'Convertidor Determinista Multilenguaje',
    sourceLanguagePlaceholder: 'Lenguaje de origen',
    targetLanguagePlaceholder: 'Lenguaje de destino',
    convertButton: 'Convertir codigo',
    converting: 'Convirtiendo...',
    sourceCodeTitle: 'Codigo de origen',
    convertedCodeTitle: 'Codigo convertido',
    sourceCodePlaceholder: 'Ingresa tu codigo fuente aqui...',
    convertedCodePlaceholder: 'El codigo convertido aparecera aqui...',
    convertingPlaceholder: 'Convirtiendo...',
    footerText1: 'Sin llamadas a IA. La conversion se hace en el navegador con una representacion intermedia determinista.',
    footerText2: 'Soporta todos los lenguajes listados con mapeo estructural. Siempre valida con pruebas.',
    searchLanguagesPlaceholder: 'Buscar lenguajes...',
    noLanguagesFound: 'No se encontraron lenguajes',
    errorEmptyCode: 'Por favor ingresa codigo para convertir.',
    errorConversionFailed: 'Error al convertir el codigo. Intentalo de nuevo.',
    copy: 'Copiar',
    copied: 'Copiado',
    copyError: 'Error al copiar',
    sourceLanguageLabel: 'Lenguaje de origen',
    targetLanguageLabel: 'Lenguaje de destino',
    swapLanguages: 'Intercambiar lenguajes',
    loadSample: 'Cargar ejemplo',
    conversionNotes: 'Notas de conversion',
    parseStats: 'Estadisticas de analisis',
    themeLight: 'Modo claro',
    themeDark: 'Modo oscuro',
    toggleTheme: 'Cambiar tema'
  }
};

const appLocale = import.meta.env.VITE_APP_LOCALE || '';
const browserLocale =
  typeof navigator !== 'undefined'
    ? navigator.languages?.[0] || navigator.language || 'en-US'
    : 'en-US';

function findMatchingLocale(locale) {
  if (TRANSLATIONS[locale]) {
    return locale;
  }
  const lang = locale.split('-')[0];
  const match = Object.keys(TRANSLATIONS).find((key) => key.startsWith(`${lang}-`));
  return match || 'en-US';
}

const locale = appLocale ? findMatchingLocale(appLocale) : findMatchingLocale(browserLocale);
const t = (key) => TRANSLATIONS[locale]?.[key] || TRANSLATIONS['en-US'][key] || key;

function getInitialTheme() {
  if (typeof window === 'undefined') {
    return 'dark';
  }

  const storedTheme = window.localStorage.getItem('codeverter-theme');
  if (storedTheme === 'light' || storedTheme === 'dark') {
    return storedTheme;
  }

  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function LanguageDropdown({
  id,
  value,
  onChange,
  languages,
  label,
  placeholder,
  searchPlaceholder,
  noResults
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);

  const filteredLanguages = useMemo(
    () =>
      languages.filter((language) =>
        language.toLowerCase().includes(searchTerm.trim().toLowerCase())
      ),
    [languages, searchTerm]
  );

  useEffect(() => {
    const onPointerDown = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, []);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
    if (!isOpen) {
      setSearchTerm('');
    }
  }, [isOpen]);

  return (
    <div className="dropdown" ref={wrapperRef}>
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <button
        id={id}
        type="button"
        className="dropdown-trigger"
        onClick={() => setIsOpen((open) => !open)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span>{value || placeholder}</span>
        <ChevronDown className={`icon-chevron ${isOpen ? 'open' : ''}`} />
      </button>

      {isOpen && (
        <div className="dropdown-menu">
          <input
            ref={inputRef}
            type="text"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="dropdown-search"
            placeholder={searchPlaceholder}
          />
          <div className="dropdown-list" role="listbox" aria-label={label}>
            {filteredLanguages.length > 0 ? (
              filteredLanguages.map((language) => (
                <button
                  type="button"
                  key={language}
                  className={`dropdown-item ${value === language ? 'active' : ''}`}
                  onClick={() => {
                    onChange(language);
                    setIsOpen(false);
                  }}
                >
                  {language}
                </button>
              ))
            ) : (
              <div className="dropdown-empty">{noResults}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [sourceLanguage, setSourceLanguage] = useState('Python');
  const [targetLanguage, setTargetLanguage] = useState('JavaScript');
  const [sourceCode, setSourceCode] = useState(exampleCodeForLanguage('Python'));
  const [targetCode, setTargetCode] = useState('');
  const [isConverting, setIsConverting] = useState(false);
  const [error, setError] = useState('');
  const [copyState, setCopyState] = useState('idle');
  const [notices, setNotices] = useState([]);
  const [stats, setStats] = useState(null);
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    window.localStorage.setItem('codeverter-theme', theme);
  }, [theme]);

  const convertCode = async () => {
    if (!sourceCode.trim()) {
      setError(t('errorEmptyCode'));
      return;
    }

    setError('');
    setIsConverting(true);
    setTargetCode('');

    try {
      const result = convertCodeDeterministic({
        sourceCode,
        sourceLanguage,
        targetLanguage
      });
      setTargetCode(result.code);
      setNotices(result.notices);
      setStats(result.stats);
    } catch (conversionError) {
      setError(t('errorConversionFailed'));
      console.error(conversionError);
    } finally {
      setIsConverting(false);
    }
  };

  const copyToClipboard = async () => {
    if (!targetCode) {
      return;
    }

    try {
      await navigator.clipboard.writeText(targetCode);
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 1000);
    } catch (clipboardError) {
      console.error(clipboardError);
      setCopyState('error');
      setTimeout(() => setCopyState('idle'), 2000);
    }
  };

  const swapLanguages = () => {
    const nextSource = targetLanguage;
    const nextTarget = sourceLanguage;
    const nextSourceCode = targetCode || sourceCode;
    setSourceLanguage(nextSource);
    setTargetLanguage(nextTarget);
    setSourceCode(nextSourceCode);
    setTargetCode('');
    setError('');
    setNotices([]);
    setStats(null);
  };

  const loadSample = () => {
    setSourceCode(exampleCodeForLanguage(sourceLanguage));
    setTargetCode('');
    setError('');
    setNotices([]);
    setStats(null);
  };

  return (
    <div className="page-shell">
      <div className="ambient-glow" aria-hidden="true" />
      <main className="app-frame">
        <header className="topbar">
          <div className="brand">
            <span className="brand-mark">
              <Code2 size={18} />
            </span>
            <div>
              <h1>{t('appTitle')}</h1>
              <p>{t('appSubtitle')}</p>
            </div>
          </div>
          <div className="topbar-actions">
            <button
              type="button"
              className="theme-toggle"
              aria-label={t('toggleTheme')}
              onClick={() => setTheme((current) => (current === 'light' ? 'dark' : 'light'))}
            >
              {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
              <span>{theme === 'light' ? t('themeDark') : t('themeLight')}</span>
            </button>

            <div className="powered-by">
              <Wrench size={15} />
              <span>Deterministic IR Engine</span>
            </div>
          </div>
        </header>

        <section className="controls">
          <div className="language-row">
            <LanguageDropdown
              id="source-language"
              value={sourceLanguage}
              onChange={setSourceLanguage}
              languages={LANGUAGES}
              label={t('sourceLanguageLabel')}
              placeholder={t('sourceLanguagePlaceholder')}
              searchPlaceholder={t('searchLanguagesPlaceholder')}
              noResults={t('noLanguagesFound')}
            />

            <button
              type="button"
              className="swap-button"
              onClick={swapLanguages}
              aria-label={t('swapLanguages')}
            >
              <ArrowRightLeft size={17} />
            </button>

            <LanguageDropdown
              id="target-language"
              value={targetLanguage}
              onChange={setTargetLanguage}
              languages={LANGUAGES}
              label={t('targetLanguageLabel')}
              placeholder={t('targetLanguagePlaceholder')}
              searchPlaceholder={t('searchLanguagesPlaceholder')}
              noResults={t('noLanguagesFound')}
            />
          </div>

          <div className="control-actions">
            <button
              type="button"
              className="convert-button"
              onClick={convertCode}
              disabled={isConverting}
            >
              {isConverting ? (
                <>
                  <Loader2 size={17} className="spin" />
                  {t('converting')}
                </>
              ) : (
                <>
                  <span>{t('convertButton')}</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>

            <button type="button" className="sample-button" onClick={loadSample}>
              {t('loadSample')}
            </button>
          </div>
        </section>

        {error && <div className="error-banner">{error}</div>}

        {notices.length > 0 && (
          <section className="notice-panel">
            <h3>{t('conversionNotes')}</h3>
            <ul>
              {notices.map((notice, index) => (
                <li key={index}>{notice}</li>
              ))}
            </ul>
          </section>
        )}

        {stats && (
          <section className="stats-row" aria-label={t('parseStats')}>
            <span className="stat-chip">nodes: {stats.totalNodes}</span>
            <span className="stat-chip">blocks: {stats.blockNodes}</span>
            <span className="stat-chip">expressions: {stats.expressionNodes}</span>
            <span className="stat-chip">assignments: {stats.assignmentNodes}</span>
          </section>
        )}

        <section className="panel-grid">
          <article className="panel">
            <header className="panel-head">
              <h2>
                {t('sourceCodeTitle')} <span>{sourceLanguage}</span>
              </h2>
            </header>
            <textarea
              className="code-area"
              value={sourceCode}
              onChange={(event) => setSourceCode(event.target.value)}
              placeholder={t('sourceCodePlaceholder')}
              spellCheck="false"
            />
          </article>

          <article className="panel">
            <header className="panel-head">
              <h2>
                {t('convertedCodeTitle')} <span>{targetLanguage}</span>
              </h2>
              <button
                type="button"
                className="copy-button"
                onClick={copyToClipboard}
                disabled={!targetCode}
              >
                <Copy size={15} />
                {copyState === 'copied' ? t('copied') : copyState === 'error' ? t('copyError') : t('copy')}
              </button>
            </header>
            <div className="target-wrapper">
              <textarea
                className="code-area"
                value={targetCode}
                readOnly
                placeholder={
                  isConverting ? t('convertingPlaceholder') : t('convertedCodePlaceholder')
                }
                spellCheck="false"
              />
              {isConverting && (
                <div className="loading-overlay" aria-hidden="true">
                  <Loader2 size={30} className="spin" />
                </div>
              )}
            </div>
          </article>
        </section>

        <footer className="footnote">
          <p>{t('footerText1')}</p>
          <p>{t('footerText2')}</p>
        </footer>
      </main>
    </div>
  );
}
