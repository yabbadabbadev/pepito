import {
  BrowserRouter,
  Route,
  Routes,
  useLocation,
  useSearchParams,
} from 'react-router'

// Fixture calcado de spike/test/url-history.test.tsx: monta con un
// BrowserRouter real para comprobar que `mount()` deja la URI completa
// (path, query y hash) disponible a través de los hooks del router, no solo
// en el `location` global.
function CatalogPage() {
  const [searchParams] = useSearchParams()
  const { hash } = useLocation()
  return (
    <>
      <p>Catálogo de productos</p>
      <p>{`filtro: ${searchParams.get('filtro') ?? 'ninguno'}`}</p>
      <p>{`hash: ${hash || 'ninguno'}`}</p>
    </>
  )
}

export function RoutedApp() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<p>Página de inicio</p>} />
        <Route path="/products" element={<CatalogPage />} />
      </Routes>
    </BrowserRouter>
  )
}
