// Humo del andamiaje: navegador real y worker de MSW servible desde public/.
test('el entorno es un navegador de verdad', () => {
  expect(typeof window.history.pushState).toBe('function')
  expect(navigator.userAgent).toContain('Chrome')
})
