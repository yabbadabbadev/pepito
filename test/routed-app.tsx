import {
  BrowserRouter,
  Route,
  Routes,
  useLocation,
  useSearchParams,
} from 'react-router'

// Fixture copied from spike/test/url-history.test.tsx: mounts with a real
// BrowserRouter to check that `mount()` leaves the full URI (path, query
// and hash) available through the router's hooks, not just on the global
// `location`.
function CatalogPage() {
  const [searchParams] = useSearchParams()
  const { hash } = useLocation()
  return (
    <>
      <p>Product catalog</p>
      <p>{`filter: ${searchParams.get('filter') ?? 'none'}`}</p>
      <p>{`hash: ${hash || 'none'}`}</p>
    </>
  )
}

export function RoutedApp() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<p>Home page</p>} />
        <Route path="/products" element={<CatalogPage />} />
      </Routes>
    </BrowserRouter>
  )
}
