import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { CartProvider } from './context/CartContext.jsx';
import { FavoritesProvider } from './context/FavoritesContext.jsx';
import { LiveProvider } from './context/LiveContext.jsx';
import 'bootstrap/dist/css/bootstrap.min.css';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <LiveProvider>
          <CartProvider>
            <FavoritesProvider>
            <App />
            <Toaster
              position="top-right"
              toastOptions={{
                style: {
                  fontFamily: 'Inter, sans-serif',
                  fontSize: 13.5,
                  borderRadius: 8,
                },
                success: { iconTheme: { primary: '#1ba672', secondary: '#fff' } },
                error: { iconTheme: { primary: '#e02424', secondary: '#fff' } },
              }}
            />
            </FavoritesProvider>
          </CartProvider>
          </LiveProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
