// Застосовує збережену тему до першого малювання (без інлайн-скриптів — сумісно з суворим CSP).
(function () {
  try {
    var th = localStorage.getItem('knb-theme');
    var root = document.documentElement;
    if (th === 'light' || th === 'dark') root.setAttribute('data-theme', th);
    var dark = th === 'dark' || ((!th || th === 'system') && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    root.setAttribute('data-mode', dark ? 'dark' : 'light');
  } catch (e) {}
})();
