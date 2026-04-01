import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { createTheme, ThemeProvider } from '@mui/material/styles';

const ThemeContext = createContext();

export const ThemeModeProvider = ({ children }) => {
  const [mode, setMode] = useState(() => localStorage.getItem('ae_theme_mode') || 'dark');

  useEffect(() => {
    localStorage.setItem('ae_theme_mode', mode);
    document.documentElement.setAttribute('data-theme', mode);
  }, [mode]);

  const toggleTheme = () => {
    setMode((prevMode) => (prevMode === 'light' ? 'dark' : 'light'));
  };

  const theme = useMemo(() => createTheme({
    palette: {
      mode,
      primary: { main: '#F26522' },
      ...(mode === 'light' 
        ? {
            background: { default: '#f8fafc', paper: '#ffffff' },
            text: { primary: '#0a1628', secondary: '#475569' },
            divider: 'rgba(0, 0, 0, 0.08)',
          }
        : {
            background: { default: '#0a1628', paper: '#112240' },
            text: { primary: '#e8edf5', secondary: '#8fa3c0' },
            divider: 'rgba(255, 255, 255, 0.07)',
          }
      ),
    },
    typography: {
      fontFamily: "'DM Sans', sans-serif",
      h1: { fontFamily: "'Syne', sans-serif" },
      h2: { fontFamily: "'Syne', sans-serif" },
      h3: { fontFamily: "'Syne', sans-serif" },
      h4: { fontFamily: "'Syne', sans-serif" },
      h5: { fontFamily: "'Syne', sans-serif" },
      h6: { fontFamily: "'Syne', sans-serif" },
    },
    shape: { borderRadius: 10 },
    components: {
      MuiButton: {
        styleOverrides: {
          root: { textTransform: 'none', fontFamily: "'DM Sans', sans-serif" },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
          },
        },
      },
       MuiDrawer: {
        styleOverrides: {
          paper: {
            position: "fixed",
          },
        },
      },
      MuiCssBaseline: {
        styleOverrides: {
          '*': { boxSizing: 'border-box', margin: 0, padding: 0 },
          html: { height: '100%' },
          body: { 
            height: '100%', 
            overflow: 'hidden',
            backgroundColor: mode === 'light' ? '#f8fafc' : '#0a1628',
            color: mode === 'light' ? '#0a1628' : '#e8edf5',
          },
          '#root': { height: '100%' },
          '::-webkit-scrollbar': { width: '16px', height: '16px' },
          '::-webkit-scrollbar-track': { background: mode === 'light' ? 'rgba(0, 0, 0, 0.05)' : 'rgba(0, 0, 0, 0.4)' },
          '::-webkit-scrollbar-thumb': {
            background: '#F26522',
            borderRadius: '20px',
            border: mode === 'light' ? '4px solid #f8fafc' : '4px solid #0a1628',
            backgroundClip: 'padding-box',
          },
          '::-webkit-scrollbar-thumb:hover': { 
            background: '#ff7d35', 
            border: mode === 'light' ? '3px solid #f8fafc' : '3px solid #0a1628' 
          },
          '*': { 
            scrollbarWidth: 'auto', 
            scrollbarColor: `#F26522 ${mode === 'light' ? 'rgba(0, 0, 0, 0.05)' : 'rgba(0, 0, 0, 0.4)'}` 
          },
        },
      },
    },
  }), [mode]);

  return (
    <ThemeContext.Provider value={{ mode, toggleTheme }}>
      <ThemeProvider theme={theme}>
        {children}
      </ThemeProvider>
    </ThemeContext.Provider>
  );
};

export const useThemeMode = () => useContext(ThemeContext);
