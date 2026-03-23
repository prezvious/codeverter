const LANGUAGES = [
  'Python',
  'JavaScript',
  'TypeScript',
  'Java',
  'C++',
  'C#',
  'C',
  'Go',
  'Rust',
  'Swift',
  'Kotlin',
  'PHP',
  'Ruby',
  'Scala',
  'R',
  'MATLAB',
  'Perl',
  'Haskell',
  'Lua',
  'Dart',
  'Elixir',
  'F#',
  'Clojure',
  'Objective-C',
  'Visual Basic'
];

const ALIASES = new Map([
  ['python', 'python'],
  ['py', 'python'],
  ['javascript', 'javascript'],
  ['js', 'javascript'],
  ['typescript', 'typescript'],
  ['ts', 'typescript'],
  ['java', 'java'],
  ['c++', 'cpp'],
  ['cpp', 'cpp'],
  ['c#', 'csharp'],
  ['csharp', 'csharp'],
  ['c', 'c'],
  ['go', 'go'],
  ['rust', 'rust'],
  ['swift', 'swift'],
  ['kotlin', 'kotlin'],
  ['php', 'php'],
  ['ruby', 'ruby'],
  ['scala', 'scala'],
  ['r', 'r'],
  ['matlab', 'matlab'],
  ['perl', 'perl'],
  ['haskell', 'haskell'],
  ['lua', 'lua'],
  ['dart', 'dart'],
  ['elixir', 'elixir'],
  ['f#', 'fsharp'],
  ['fsharp', 'fsharp'],
  ['clojure', 'clojure'],
  ['objective-c', 'objectivec'],
  ['objective c', 'objectivec'],
  ['objectivec', 'objectivec'],
  ['visual basic', 'visualbasic'],
  ['visualbasic', 'visualbasic']
]);

const BLOCK_TYPES = new Set(['function', 'if', 'elif', 'else', 'while', 'for_range', 'for_each']);

const SOURCE_STYLE = {
  python: 'indent',
  ruby: 'end',
  lua: 'end',
  elixir: 'end',
  matlab: 'end',
  visualbasic: 'end',
  clojure: 'lisp',
  fsharp: 'indent',
  haskell: 'indent'
};

function languageId(language) {
  const key = String(language || '').trim().toLowerCase();
  if (ALIASES.has(key)) {
    return ALIASES.get(key);
  }
  return ALIASES.get(key.replace(/[_\s]+/g, ' ')) || 'javascript';
}

function normalizeCode(code) {
  return String(code || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\t/g, '    ');
}

function splitParams(raw) {
  if (!raw.trim()) {
    return [];
  }
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value, index) => {
      const withoutDefault = value.replace(/=.*$/, '').replace(/:[^,)\]]+$/, '').trim();
      const tokens = withoutDefault.split(/\s+/).filter(Boolean);
      const candidate = tokens[tokens.length - 1] || `arg${index + 1}`;
      const match = candidate.match(/[A-Za-z_]\w*/);
      return match ? match[0] : `arg${index + 1}`;
    });
}

function stripSemi(value) {
  return value.replace(/;+$/, '').trim();
}

function unwrapCondition(value) {
  const text = value.trim();
  if (text.startsWith('(') && text.endsWith(')')) {
    return text.slice(1, -1).trim();
  }
  return text;
}

function parseForRangeFromCHeader(header) {
  const parts = header.split(';').map((part) => part.trim());
  if (parts.length !== 3) {
    return null;
  }
  const init = parts[0].match(
    /^(?:let|const|var|int|long|float|double|auto|size_t|mut|final)?\s*([A-Za-z_]\w*)\s*=\s*(.+)$/i
  );
  if (!init) {
    return null;
  }
  const iterator = init[1];
  const start = init[2].trim();
  const cond = parts[1].match(new RegExp(`^${iterator}\\s*([<>]=?|!=|==)\\s*(.+)$`, 'i'));
  if (!cond) {
    return null;
  }
  const comparator = cond[1];
  const end = cond[2].trim();

  let step = '1';
  if (new RegExp(`^${iterator}\\+\\+$`, 'i').test(parts[2])) {
    step = '1';
  } else if (new RegExp(`^${iterator}--$`, 'i').test(parts[2])) {
    step = '-1';
  } else {
    const plus = parts[2].match(new RegExp(`^${iterator}\\s*\\+=\\s*(.+)$`, 'i'));
    const minus = parts[2].match(new RegExp(`^${iterator}\\s*-=\\s*(.+)$`, 'i'));
    if (plus) {
      step = plus[1].trim();
    } else if (minus) {
      step = `-${minus[1].trim()}`;
    }
  }

  return { type: 'for_range', iterator, start, end, step, comparator };
}

function classifyLine(rawLine) {
  const line = stripSemi(rawLine);
  if (!line) {
    return { type: 'blank' };
  }

  if (/^(#|\/\/|--|;)/.test(line)) {
    return { type: 'comment', text: line.replace(/^(#|\/\/|--|;)\s?/, '') };
  }

  const fnPatterns = [
    /^def\s+([A-Za-z_]\w*)\s*\(([^)]*)\)$/i,
    /^function\s+([A-Za-z_]\w*)\s*\(([^)]*)\)$/i,
    /^func\s+([A-Za-z_]\w*)\s*\(([^)]*)\)$/i,
    /^sub\s+([A-Za-z_]\w*)\s*\(([^)]*)\)$/i,
    /^fn\s+([A-Za-z_]\w*)\s*\(([^)]*)\)$/i,
    /^(?:public|private|protected|internal|static|async|final|\s)*(?:[A-Za-z_][\w<>\[\]?]*\s+)+([A-Za-z_]\w*)\s*\(([^)]*)\)$/i
  ];
  for (const pattern of fnPatterns) {
    const match = line.match(pattern);
    if (match) {
      const name = match[1].toLowerCase();
      if (!['if', 'for', 'while', 'switch', 'catch'].includes(name)) {
        return { type: 'function', name: match[1], params: splitParams(match[2] || '') };
      }
    }
  }

  const elseIf = line.match(/^(?:else\s+if|elseif|elif)\s*(.*)$/i);
  if (elseIf) {
    return { type: 'elif', condition: unwrapCondition(elseIf[1] || 'true') };
  }
  if (/^else$/i.test(line)) {
    return { type: 'else' };
  }

  const ifMatch = line.match(/^if\s*(.*)$/i);
  if (ifMatch) {
    return { type: 'if', condition: unwrapCondition(ifMatch[1] || 'true') };
  }

  const whileMatch = line.match(/^while\s*(.*)$/i);
  if (whileMatch) {
    return { type: 'while', condition: unwrapCondition(whileMatch[1] || 'true') };
  }

  const pyRange = line.match(/^for\s+([A-Za-z_]\w*)\s+in\s+range\s*\((.*)\)$/i);
  if (pyRange) {
    const args = pyRange[2].split(',').map((value) => value.trim()).filter(Boolean);
    if (args.length === 1) {
      return { type: 'for_range', iterator: pyRange[1], start: '0', end: args[0], step: '1', comparator: '<' };
    }
    if (args.length >= 2) {
      return {
        type: 'for_range',
        iterator: pyRange[1],
        start: args[0],
        end: args[1],
        step: args[2] || '1',
        comparator: (args[2] || '1').trim().startsWith('-') ? '>' : '<'
      };
    }
  }

  const cFor = line.match(/^for\s*\((.*)\)$/i);
  if (cFor) {
    const parsed = parseForRangeFromCHeader(cFor[1]);
    if (parsed) {
      return parsed;
    }
  }

  const forEach =
    line.match(/^foreach\s*\(\s*(?:[A-Za-z_][\w<>\[\]?]*\s+)?([A-Za-z_]\w*)\s+in\s+(.+)\)$/i) ||
    line.match(/^for\s+([A-Za-z_]\w*)\s+in\s+(.+)$/i);
  if (forEach) {
    return { type: 'for_each', iterator: forEach[1], iterable: forEach[2].trim() };
  }

  const ret = line.match(/^return\b\s*(.*)$/i);
  if (ret) {
    return { type: 'return', value: ret[1].trim() };
  }

  const printPatterns = [
    /^print\s*\((.*)\)$/i,
    /^console\.log\s*\((.*)\)$/i,
    /^system\.out\.println\s*\((.*)\)$/i,
    /^fmt\.println\s*\((.*)\)$/i,
    /^printf\s*\((.*)\)$/i,
    /^puts\s+(.+)$/i,
    /^echo\s+(.+)$/i,
    /^console\.writeline\s*\((.*)\)$/i,
    /^disp\s*\((.*)\)$/i
  ];
  for (const pattern of printPatterns) {
    const match = line.match(pattern);
    if (match) {
      return { type: 'print', value: match[1].trim() };
    }
  }

  const assign =
    line.match(/^(?:let|const|var|val|mut|final|my|dim)\s+([A-Za-z_]\w*)\s*(?::=|<-|=)\s*(.+)$/i) ||
    line.match(/^([A-Za-z_]\w*)\s*(?::=|<-|=)\s*(.+)$/);
  if (assign) {
    return { type: 'assign', name: assign[1], value: assign[2].trim() };
  }

  return { type: 'expression', code: line };
}

function parseSourceToNodes(code, sourceLanguage) {
  const lines = normalizeCode(code).split('\n');
  const style = SOURCE_STYLE[sourceLanguage] || 'brace';
  const nodes = [];

  if (style === 'indent') {
    for (const raw of lines) {
      const trimmed = raw.trim();
      const indent = Math.floor((raw.match(/^\s*/) || [''])[0].length / 4);
      if (!trimmed) {
        nodes.push({ type: 'blank', indent });
        continue;
      }
      const normalized = stripSemi(trimmed.replace(/:\s*$/, ''));
      const node = classifyLine(normalized);
      node.indent = indent;
      node.opensBlock = BLOCK_TYPES.has(node.type) && /:\s*$/.test(trimmed);
      nodes.push(node);
    }
    return nodes;
  }

  if (style === 'end') {
    let depth = 0;
    for (const raw of lines) {
      let trimmed = raw.trim();
      if (!trimmed) {
        nodes.push({ type: 'blank', indent: depth });
        continue;
      }
      const lower = trimmed.toLowerCase();
      if (/^(end|endif|next|loop|wend|end if|end function|end sub)\s*;?$/.test(lower)) {
        depth = Math.max(0, depth - 1);
        continue;
      }
      if (/^(else|elseif|elif)\b/i.test(trimmed)) {
        depth = Math.max(0, depth - 1);
      }
      const opensHint =
        /(?:\bthen|\bdo)\s*$/i.test(trimmed) ||
        /^(def|function|sub|func|if|for|while|unless|class)\b/i.test(trimmed) ||
        /:\s*$/.test(trimmed) ||
        /^else$/i.test(trimmed);
      trimmed = trimmed.replace(/\bthen\s*$/i, '').replace(/\bdo\s*$/i, '').replace(/:\s*$/, '').trim();
      const node = classifyLine(trimmed);
      node.indent = depth;
      node.opensBlock = BLOCK_TYPES.has(node.type) && opensHint;
      nodes.push(node);
      if (node.opensBlock) {
        depth += 1;
      }
    }
    return nodes;
  }

  if (style === 'lisp') {
    let depth = 0;
    for (const raw of lines) {
      let trimmed = raw.trim();
      if (!trimmed) {
        nodes.push({ type: 'blank', indent: depth });
        continue;
      }
      while (trimmed.startsWith(')')) {
        depth = Math.max(0, depth - 1);
        trimmed = trimmed.slice(1).trimStart();
      }
      if (!trimmed) {
        continue;
      }
      const openCount = (trimmed.match(/\(/g) || []).length;
      const closeCount = (trimmed.match(/\)/g) || []).length;
      const cleaned = stripSemi(trimmed.replace(/[()]/g, ' '));
      const node = classifyLine(cleaned);
      node.indent = depth;
      node.opensBlock = BLOCK_TYPES.has(node.type) && openCount > 0;
      nodes.push(node);
      depth = Math.max(0, depth + openCount - closeCount);
    }
    return nodes;
  }

  // Brace style.
  let depth = 0;
  for (const raw of lines) {
    let trimmed = raw.trim();
    if (!trimmed) {
      nodes.push({ type: 'blank', indent: depth });
      continue;
    }
    while (trimmed.startsWith('}')) {
      depth = Math.max(0, depth - 1);
      trimmed = trimmed.slice(1).trimStart();
    }
    if (!trimmed) {
      continue;
    }
    const openCount = (trimmed.match(/{/g) || []).length;
    const closeCount = (trimmed.match(/}/g) || []).length;
    const cleaned = stripSemi(trimmed.replace(/[{}]/g, ' '));
    const node = classifyLine(cleaned);
    node.indent = depth;
    node.opensBlock = BLOCK_TYPES.has(node.type) && openCount > 0;
    nodes.push(node);
    depth = Math.max(0, depth + openCount - closeCount);
  }
  return nodes;
}

function createProfile(id) {
  if (id === 'python') {
    return {
      family: 'indent',
      commentPrefix: '#',
      close: '',
      functionLine: (name, params) => `def ${name}(${params.join(', ')}):`,
      ifLine: (cond) => `if ${cond}:`,
      elifLine: (cond) => `elif ${cond}:`,
      elseLine: () => 'else:',
      whileLine: (cond) => `while ${cond}:`,
      forRangeLine: (it, start, end, step) => (start === '0' && step === '1' ? `for ${it} in range(${end}):` : `for ${it} in range(${start}, ${end}, ${step}):`),
      forEachLine: (it, iterable) => `for ${it} in ${iterable}:`,
      assignLine: (name, value) => `${name} = ${value}`,
      printLine: (value) => `print(${value})`,
      returnLine: (value) => (value ? `return ${value}` : 'return'),
      exprLine: (value) => value
    };
  }
  if (id === 'ruby' || id === 'lua' || id === 'elixir' || id === 'matlab' || id === 'visualbasic') {
    return {
      family: 'end',
      commentPrefix: id === 'lua' ? '--' : id === 'matlab' ? '%' : id === 'visualbasic' ? '\'' : '#',
      close: id === 'visualbasic' ? 'End' : 'end',
      functionLine: (name, params) =>
        id === 'lua'
          ? `function ${name}(${params.join(', ')})`
          : id === 'matlab'
            ? `function result = ${name}(${params.join(', ')})`
            : id === 'visualbasic'
              ? `Function ${name}(${params.join(', ')})`
              : id === 'elixir'
                ? `def ${name}(${params.join(', ')}) do`
                : `def ${name}(${params.join(', ')})`,
      ifLine: (cond) => (id === 'visualbasic' ? `If ${cond} Then` : id === 'lua' ? `if ${cond} then` : id === 'elixir' ? `if ${cond} do` : `if ${cond}`),
      elifLine: (cond) => (id === 'visualbasic' ? `ElseIf ${cond} Then` : id === 'lua' ? `elseif ${cond} then` : id === 'matlab' ? `elseif ${cond}` : id === 'elixir' ? `else if ${cond} do` : `elsif ${cond}`),
      elseLine: () => 'else',
      whileLine: (cond) => (id === 'visualbasic' ? `While ${cond}` : id === 'lua' ? `while ${cond} do` : id === 'elixir' ? `while ${cond} do` : `while ${cond}`),
      forRangeLine: (it, start, end, step) =>
        id === 'lua'
          ? `for ${it} = ${start}, ${end} - 1, ${step} do`
          : id === 'visualbasic'
            ? `For ${it} = ${start} To ${end} - 1 Step ${step}`
            : id === 'matlab'
              ? `for ${it} = ${start}:${step}:(${end} - 1)`
              : `for ${it} in (${start}...${end}).step(${step})`,
      forEachLine: (it, iterable) =>
        id === 'lua'
          ? `for _, ${it} in ipairs(${iterable}) do`
          : id === 'visualbasic'
            ? `For Each ${it} In ${iterable}`
            : id === 'elixir'
              ? `for ${it} <- ${iterable} do`
              : `${iterable}.each do |${it}|`,
      assignLine: (name, value) => (id === 'visualbasic' ? `Dim ${name} = ${value}` : id === 'matlab' ? `${name} = ${value};` : `${name} = ${value}`),
      printLine: (value) => (id === 'visualbasic' ? `Console.WriteLine(${value})` : id === 'matlab' ? `disp(${value});` : id === 'elixir' ? `IO.puts(${value})` : `print(${value})`),
      returnLine: (value) => (id === 'visualbasic' ? `Return ${value || ''}`.trim() : value ? `return ${value}` : 'return'),
      exprLine: (value) => value
    };
  }
  if (id === 'clojure') {
    return {
      family: 'lisp',
      commentPrefix: ';',
      close: ')',
      functionLine: (name, params) => `(defn ${name} [${params.join(' ')}]`,
      ifLine: (cond) => `(if ${cond}`,
      elifLine: (cond) => `(if ${cond}`,
      elseLine: () => '(do',
      whileLine: (cond) => `(while ${cond}`,
      forRangeLine: (it, start, end, step) => `(doseq [${it} (range ${start} ${end} ${step})]`,
      forEachLine: (it, iterable) => `(doseq [${it} ${iterable}]`,
      assignLine: (name, value) => `(def ${name} ${value})`,
      printLine: (value) => `(println ${value})`,
      returnLine: (value) => value || 'nil',
      exprLine: (value) => value
    };
  }
  return {
    family: 'brace',
    commentPrefix: id === 'perl' ? '#' : '//',
    close: '}',
    functionLine: (name, params) => {
      if (id === 'go') {
        return `func ${name}(${params.map((param) => `${param} any`).join(', ')}) any {`;
      }
      if (id === 'rust') {
        return `fn ${name}(${params.map((param) => `${param}: i64`).join(', ')}) -> i64 {`;
      }
      if (id === 'swift') {
        return `func ${name}(${params.map((param) => `${param}: Any`).join(', ')}) -> Any {`;
      }
      if (id === 'kotlin') {
        return `fun ${name}(${params.map((param) => `${param}: Any`).join(', ')}): Any {`;
      }
      if (id === 'php') {
        return `function ${name}(${params.map((param) => `$${param}`).join(', ')}) {`;
      }
      if (id === 'r') {
        return `${name} <- function(${params.join(', ')}) {`;
      }
      if (id === 'typescript') {
        return `function ${name}(${params.map((param) => `${param}: any`).join(', ')}): any {`;
      }
      return `function ${name}(${params.join(', ')}) {`;
    },
    ifLine: (cond) => (id === 'go' || id === 'rust' || id === 'swift' ? `if ${cond} {` : `if (${cond}) {`),
    elifLine: (cond) => (id === 'go' || id === 'rust' || id === 'swift' ? `else if ${cond} {` : `else if (${cond}) {`),
    elseLine: () => 'else {',
    whileLine: (cond) => (id === 'go' ? `for ${cond} {` : id === 'swift' || id === 'rust' ? `while ${cond} {` : `while (${cond}) {`),
    forRangeLine: (it, start, end, step, comparator = '<') => {
      const op = comparator.startsWith('>') ? '>' : '<';
      if (id === 'go') {
        return `for ${it} := ${start}; ${it} ${op} ${end}; ${it} += ${step} {`;
      }
      if (id === 'rust') {
        return step === '1' ? `for ${it} in ${start}..${end} {` : `for ${it} in (${start}..${end}).step_by(${step.replace('-', '')}) {`;
      }
      return `for (let ${it} = ${start}; ${it} ${op} ${end}; ${it} += ${step}) {`;
    },
    forEachLine: (it, iterable) => {
      if (id === 'go') {
        return `for _, ${it} := range ${iterable} {`;
      }
      if (id === 'php') {
        return `foreach (${iterable} as $${it}) {`;
      }
      if (id === 'r') {
        return `for (${it} in ${iterable}) {`;
      }
      return `for (const ${it} of ${iterable}) {`;
    },
    assignLine: (name, value) => {
      if (id === 'go') {
        return `${name} := ${value}`;
      }
      if (id === 'php') {
        return `$${name} = ${value};`;
      }
      if (id === 'r') {
        return `${name} <- ${value}`;
      }
      if (id === 'perl') {
        return `my $${name} = ${value};`;
      }
      if (id === 'typescript') {
        return `let ${name}: any = ${value};`;
      }
      return `let ${name} = ${value};`;
    },
    printLine: (value) => {
      if (id === 'go') return `fmt.Println(${value})`;
      if (id === 'php') return `echo ${value} . PHP_EOL;`;
      if (id === 'r') return `print(${value})`;
      if (id === 'perl') return `print ${value}, \"\\n\";`;
      if (id === 'rust') return `println!(\"{:?}\", ${value});`;
      return `console.log(${value});`;
    },
    returnLine: (value) => (value ? `return ${value};` : 'return;'),
    exprLine: (value) => (/([;{}])$/.test(value.trim()) || id === 'go' ? value : `${value};`)
  };
}

function renderNode(profile, node) {
  switch (node.type) {
    case 'blank':
      return '';
    case 'comment':
      return `${profile.commentPrefix} ${node.text || ''}`.trimEnd();
    case 'function':
      return profile.functionLine(node.name || 'fn', node.params || []);
    case 'if':
      return profile.ifLine(node.condition || 'true');
    case 'elif':
      return profile.elifLine(node.condition || 'true');
    case 'else':
      return profile.elseLine();
    case 'while':
      return profile.whileLine(node.condition || 'true');
    case 'for_range':
      return profile.forRangeLine(node.iterator || 'i', node.start || '0', node.end || '0', node.step || '1', node.comparator || '<');
    case 'for_each':
      return profile.forEachLine(node.iterator || 'item', node.iterable || 'items');
    case 'assign':
      return profile.assignLine(node.name || 'value', node.value || 'null');
    case 'print':
      return profile.printLine(node.value || '""');
    case 'return':
      return profile.returnLine(node.value || '');
    case 'expression':
      return profile.exprLine(node.code || '');
    default:
      return profile.exprLine(node.code || '');
  }
}

function emitNodes(nodes, targetLanguage) {
  const profile = createProfile(targetLanguage);
  const stack = [];
  const lines = [];
  const indentUnit = '    ';

  const closeBlock = () => {
    stack.pop();
    if (profile.family !== 'indent' && profile.close) {
      lines.push(`${indentUnit.repeat(stack.length)}${profile.close}`);
    }
  };

  for (const node of nodes) {
    const indent = Math.max(0, node.indent || 0);
    while (stack.length > indent) {
      closeBlock();
    }

    const line = renderNode(profile, node);
    if (node.type === 'blank') {
      lines.push('');
    } else if (line) {
      lines.push(`${indentUnit.repeat(indent)}${line}`.trimEnd());
    }

    if (node.opensBlock) {
      stack.push(node.type);
    }
  }

  while (stack.length > 0) {
    closeBlock();
  }

  return lines.join('\n');
}

const SAMPLE_NODES = [
  { type: 'comment', text: 'Deterministic sample', indent: 0 },
  { type: 'function', name: 'fibonacci', params: ['n'], indent: 0, opensBlock: true },
  { type: 'if', condition: 'n <= 1', indent: 1, opensBlock: true },
  { type: 'return', value: 'n', indent: 2 },
  { type: 'else', indent: 1, opensBlock: true },
  { type: 'return', value: 'fibonacci(n - 1) + fibonacci(n - 2)', indent: 2 },
  { type: 'blank', indent: 0 },
  { type: 'assign', name: 'result', value: 'fibonacci(10)', indent: 0 },
  { type: 'print', value: 'result', indent: 0 }
];

function buildStats(nodes) {
  return {
    totalNodes: nodes.length,
    blockNodes: nodes.filter((node) => BLOCK_TYPES.has(node.type)).length,
    expressionNodes: nodes.filter((node) => node.type === 'expression').length,
    assignmentNodes: nodes.filter((node) => node.type === 'assign').length
  };
}

function convertCodeDeterministic({ sourceCode, sourceLanguage, targetLanguage }) {
  if (!sourceCode || !sourceCode.trim()) {
    return { code: '', notices: [], stats: buildStats([]) };
  }
  const sourceId = languageId(sourceLanguage);
  const targetId = languageId(targetLanguage);
  const nodes = parseSourceToNodes(sourceCode, sourceId);
  const stats = buildStats(nodes);
  const notices = [];

  if (sourceId === targetId) {
    notices.push('Source and target languages are the same, so output is normalized only.');
  }
  if (stats.expressionNodes > 0) {
    notices.push(`${stats.expressionNodes} line(s) were preserved as raw expressions due to unsupported syntax patterns.`);
  }
  notices.push('Local deterministic conversion only. Run tests after translation to verify behavior.');

  return {
    code: emitNodes(nodes, targetId),
    notices,
    stats
  };
}

function exampleCodeForLanguage(language) {
  return emitNodes(SAMPLE_NODES, languageId(language));
}

export { LANGUAGES, convertCodeDeterministic, exampleCodeForLanguage };
