// The DOM half only runs where a DOM exists (component tests run under jsdom).
if (typeof window !== 'undefined') {
  await import('@testing-library/jest-dom/vitest')
}
