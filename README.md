# CodeVerter

**Deterministic Cross-Language Code Converter**

CodeVerter converts source code between 25 programming languages entirely in the browser — no AI calls, no server round-trips. It works by parsing source code into a language-agnostic intermediate representation (IR) and re-emitting it in the target language.

## Features

- **25 supported languages** — Python, JavaScript, TypeScript, Java, C++, C#, C, Go, Rust, Swift, Kotlin, PHP, Ruby, Scala, R, MATLAB, Perl, Haskell, Lua, Dart, Elixir, F#, Clojure, Objective-C, Visual Basic
- **Fully in-browser** — deterministic IR engine, zero network requests
- **Dark / light theme** — persisted to `localStorage`, respects `prefers-color-scheme`
- **i18n ready** — English and Spanish locales, auto-detected from browser language
- **Searchable language dropdowns** with keyboard-friendly navigation
- **Load sample** — generates a working Fibonacci example in any selected language
- **Parse stats** — shows node counts (total, blocks, expressions, assignments) after each conversion
- **Conversion notes** — surfaces caveats such as unsupported syntax preserved as raw expressions

## Tech Stack

| Tool | Version |
|------|---------|
| React | 19 |
| Vite | 7 |
| Lucide React | 0.552 |

## Getting Started

```bash
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

## Build

```bash
npm run build
npm run preview
```

## How It Works

1. **Parse** — the source code is tokenized line-by-line into typed IR nodes (`function`, `if`, `elif`, `else`, `while`, `for_range`, `for_each`, `assign`, `print`, `return`, `expression`, `comment`, `blank`). Four parsing strategies handle brace-delimited, indent-delimited, `end`-delimited, and Lisp-style syntaxes.

2. **Emit** — IR nodes are walked and rendered through a per-language *profile* that knows the correct keywords, delimiters, and idioms for the target language.

3. **Structural fidelity** — control flow, function signatures, assignments, and print statements all map to idiomatic target-language equivalents. Lines that don't match a known pattern are preserved verbatim as expression nodes.

## Limitations

- Conversion is structural, not semantic. Complex expressions, OOP constructs, closures, and library calls are carried through as-is and may require manual adjustment.
- Always validate converted code with tests before use in production.

## License

MIT
