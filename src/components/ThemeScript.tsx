export function ThemeScript() {
  const script = `
    (function() {
      const theme = localStorage.getItem('theme');
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
      }
    })();
  `;

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}