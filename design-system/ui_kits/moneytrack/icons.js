// Lucide icon → React component helper (shared across the kit)
// Usage: const Wallet = Icon('Wallet'); <Wallet size={18} />
(function () {
  function Icon(name) {
    return function IconCmp({ size = 18, color = 'currentColor', strokeWidth = 2, style = {} }) {
      const ref = React.useRef(null);
      React.useEffect(() => {
        const node = ref.current;
        if (!node || !window.lucide) return;
        node.innerHTML = '';
        const data = window.lucide.icons[name];
        if (!data) return;
        const svg = window.lucide.createElement(data);
        svg.setAttribute('width', size);
        svg.setAttribute('height', size);
        svg.setAttribute('stroke', color);
        svg.setAttribute('stroke-width', strokeWidth);
        node.appendChild(svg);
      }, [size, color, strokeWidth]);
      return React.createElement('span', {
        ref,
        style: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', ...style },
        'aria-hidden': 'true',
      });
    };
  }
  window.Icon = Icon;

  // Viewport hook → responsive breakpoints (product uses sm:640, lg:1024).
  // window.__forceWidth lets screenshots simulate a narrow viewport.
  function useViewport() {
    const get = () => (typeof window !== 'undefined' ? (window.__forceWidth || window.innerWidth || 1024) : 1024);
    const [w, setW] = React.useState(get());
    React.useEffect(() => {
      const on = () => setW(get());
      window.addEventListener('resize', on);
      return () => window.removeEventListener('resize', on);
    }, []);
    return { width: w, isMobile: w < 640, isTablet: w >= 640 && w < 1024, isDesktop: w >= 1024 };
  }
  window.useViewport = useViewport;
})();

