// Scaffolding smoke test: a real browser and an MSW worker servable from public/.
test('the environment is a real browser', () => {
  expect(typeof window.history.pushState).toBe('function')
  expect(navigator.userAgent).toContain('Chrome')
})
