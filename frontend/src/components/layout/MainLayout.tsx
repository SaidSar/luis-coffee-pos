import { useState } from 'react';
import Sidebar from './Sidebar';
import Header  from './Header';
import { useRealtime } from '../../hooks/useRealtime';

interface Props {
  children: React.ReactNode;
}

export default function MainLayout({ children }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Tiempo real (Socket.io): una sola vez para todas las páginas protegidas
  useRealtime();

  return (
    <div className="flex h-screen bg-cream font-sans overflow-hidden">

      {/* Sidebar */}
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Overlay oscuro en móvil cuando el sidebar está abierto */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-espresso/40 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Área principal: header + contenido */}
      <div className="flex-1 flex flex-col overflow-hidden lg:ml-0">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>

    </div>
  );
}