import { Outlet } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import ScrollToTop from '../components/ScrollToTop';
import './MainLayout.css';

/** Shell used by the landing page and every signed-in application page. */
export default function MainLayout() {
  return (
    <div className="app-shell">
      <ScrollToTop />
      <Navbar />
      <main className="app-shell__main">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
