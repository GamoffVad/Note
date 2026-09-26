// Страница возврата из письма входа (Supabase Auth). Supabase переводит сюда
// с кодом входа (?code=…) или ошибкой; страница передаёт их в приложение «Маяк».
// Сам код без ключа, который хранит приложение (PKCE), для входа бесполезен.
// На Android — ссылкой intent:, на компьютере — ссылкой со схемой приложения.
(() => {
  const SCHEME = "io.github.gamoffvad.mayak";
  const params = new URLSearchParams(location.search);
  for (const [k, v] of new URLSearchParams(location.hash.replace(/^#/, ""))) params.set(k, v);
  // Код остаётся только в ссылке кнопки: убираем его из адресной строки и истории.
  history.replaceState(null, "", location.pathname);

  const query = params.toString() ? `?${params}` : "";
  const android = /Android/i.test(navigator.userAgent);
  const link = android
    ? `intent://login-callback${query}#Intent;scheme=${SCHEME};package=${SCHEME};end`
    : `${SCHEME}://login-callback${query}`;
  const open = document.getElementById("open");
  open.href = link;

  if (!params.get("code")) {
    document.getElementById("title").textContent = "Ссылка не сработала";
    document.getElementById("lead").textContent = params.get("error_description")
      ? "Ссылка из письма устарела или уже использована. Запросите новое письмо в приложении."
      : "В ссылке нет кода входа. Запросите новое письмо в приложении.";
    open.textContent = "Открыть Маяк";
    return;
  }
  // Браузер может не открыть приложение без нажатия — тогда остаётся кнопка.
  location.replace(link);
})();
