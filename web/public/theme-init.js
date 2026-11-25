// Виконується до першого малювання (без інлайн-скриптів — сумісно з суворим CSP):
// застосовує збережену тему і вмикає анімації, якщо користувач не обрав «зменшити рух».
(function () {
  try {
    var root = document.documentElement;
    var th = localStorage.getItem('knb-theme');
    if (th === 'light' || th === 'dark') root.setAttribute('data-theme', th);
    var mq = window.matchMedia;
    var dark = th === 'dark' || ((!th || th === 'system') && mq && mq('(prefers-color-scheme: dark)').matches);
    root.setAttribute('data-mode', dark ? 'dark' : 'light');
    if (mq && !mq('(prefers-reduced-motion: reduce)').matches) {
      root.classList.add('anim');
      // Страховка: якщо середовище не програє CSS-анімації (деякі скриншотери, роботи),
      // через 3 с вміст першого екрана гарантовано стає видимим.
      setTimeout(function () {
        root.classList.add('motion-done');
      }, 3000);
    }
  } catch (e) {}
})();
