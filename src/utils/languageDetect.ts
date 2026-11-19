export type SupportedLanguage =
  | 'python'
  | 'javascript'
  | 'typescript'
  | 'c'
  | 'cpp'
  | 'java'
  | 'go'
  | 'rust'
  | 'csharp'
  | 'php'
  | 'ruby'
  | 'bash'
  | 'sql'
  | 'generic';

export interface LanguageOption {
  id: SupportedLanguage;
  label: string;
  extensions: string[];
  executionMode: 'sandbox-runtime' | 'static-verifier';
  runtimeLabel: string;
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  {
    id: 'python',
    label: 'Python',
    extensions: ['.py'],
    executionMode: 'sandbox-runtime',
    runtimeLabel: 'Python 3 AST + Isolated Subprocess',
  },
  {
    id: 'javascript',
    label: 'JavaScript',
    extensions: ['.js', '.mjs', '.cjs', '.jsx'],
    executionMode: 'sandbox-runtime',
    runtimeLabel: 'esbuild + Isolated Node.js Sandbox',
  },
  {
    id: 'typescript',
    label: 'TypeScript',
    extensions: ['.ts', '.tsx', '.mts'],
    executionMode: 'sandbox-runtime',
    runtimeLabel: 'esbuild + Isolated Node.js Sandbox',
  },
  {
    id: 'c',
    label: 'C',
    extensions: ['.c', '.h'],
    executionMode: 'sandbox-runtime',
    runtimeLabel: 'GCC Compiler + Isolated Binary Sandbox',
  },
  {
    id: 'cpp',
    label: 'C++',
    extensions: ['.cpp', '.cc', '.cxx', '.hpp', '.hh'],
    executionMode: 'sandbox-runtime',
    runtimeLabel: 'G++ Compiler + Isolated Binary Sandbox',
  },
  {
    id: 'bash',
    label: 'Bash / Shell',
    extensions: ['.sh', '.bash'],
    executionMode: 'sandbox-runtime',
    runtimeLabel: 'Bash Syntax + Isolated Shell Sandbox',
  },
  {
    id: 'java',
    label: 'Java',
    extensions: ['.java'],
    executionMode: 'static-verifier',
    runtimeLabel: 'Universal Static AST / CFG / Taint Verifier',
  },
  {
    id: 'go',
    label: 'Go',
    extensions: ['.go'],
    executionMode: 'static-verifier',
    runtimeLabel: 'Universal Static AST / CFG / Taint Verifier',
  },
  {
    id: 'rust',
    label: 'Rust',
    extensions: ['.rs'],
    executionMode: 'static-verifier',
    runtimeLabel: 'Universal Static AST / CFG / Taint Verifier',
  },
  {
    id: 'csharp',
    label: 'C#',
    extensions: ['.cs'],
    executionMode: 'static-verifier',
    runtimeLabel: 'Universal Static AST / CFG / Taint Verifier',
  },
  {
    id: 'php',
    label: 'PHP',
    extensions: ['.php'],
    executionMode: 'static-verifier',
    runtimeLabel: 'Universal Static AST / CFG / Taint Verifier',
  },
  {
    id: 'ruby',
    label: 'Ruby',
    extensions: ['.rb'],
    executionMode: 'static-verifier',
    runtimeLabel: 'Universal Static AST / CFG / Taint Verifier',
  },
  {
    id: 'sql',
    label: 'SQL',
    extensions: ['.sql'],
    executionMode: 'static-verifier',
    runtimeLabel: 'Universal Static Query / Taint Verifier',
  },
  {
    id: 'generic',
    label: 'Other / Generic',
    extensions: ['.kt', '.swift', '.scala', '.dart', '.lua', '.r', '.pl', '.txt'],
    executionMode: 'static-verifier',
    runtimeLabel: 'Universal Multi-Language Static Verifier',
  },
];

export function detectLanguageFromFilename(filename: string): SupportedLanguage {
  const lower = (filename || '').trim().toLowerCase();
  const dotIdx = lower.lastIndexOf('.');
  if (dotIdx === -1) return 'generic';
  const ext = lower.slice(dotIdx);

  for (const lang of SUPPORTED_LANGUAGES) {
    if (lang.extensions.includes(ext)) {
      return lang.id;
    }
  }
  return 'generic';
}

export function getLanguageMeta(id: SupportedLanguage): LanguageOption {
  return (
    SUPPORTED_LANGUAGES.find((l) => l.id === id) ??
    SUPPORTED_LANGUAGES[SUPPORTED_LANGUAGES.length - 1]
  );
}
