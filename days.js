/**
 * favicon-generator.js
 * 
 * Этот файл содержит данные и функции для динамической генерации SVG-иконок календаря
 * для дней месяца с 1 по 31.
 */

// --- Вспомогательная функция для создания SVG-кода ---
// Она принимает число (день) и возвращает полную SVG-строку.
// Также она автоматически уменьшает размер шрифта для двузначных чисел, чтобы они помещались.
function generateCalendarSvg(day) {
    // Если число двузначное (больше 9), используем шрифт поменьше.
    const fontSize = day > 9 ? 55 : 65;
    // Для двузначных чисел можно немного скорректировать вертикальное положение, чтобы выглядело лучше.
    const yPosition = day > 9 ? 73 : 72;

    // Используем шаблонные строки (с обратными кавычками ``) для удобной вставки переменных
    return `
<svg width="512" height="512" viewBox="0 0 108 108" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad_num" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#d49eff;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#a569e0;stop-opacity:1" />
    </linearGradient>
    <linearGradient id="grad_bind" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#89c2ff;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#5c9dff;stop-opacity:1" />
    </linearGradient>
    <linearGradient id="grad_page" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#f0f5ff;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#ffffff;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect x="4" y="9" width="100" height="95" rx="12" ry="12" fill="#d97a54"/>
  <rect x="9" y="19" width="90" height="85" rx="8" ry="8" fill="url(#grad_page)"/>
  <path d="M 9,29 V 19 C 9,14 13,10 18,10 H 90 C 95,10 99,14 99,19 V 29 H 9 Z" fill="url(#grad_bind)"/>
  <text x="54" y="${yPosition}"
        font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
        font-size="${fontSize}"
        font-weight="bold"
        fill="url(#grad_num)"
        text-anchor="middle"
        dominant-baseline="middle">${day}</text>
</svg>
`.trim(); // .trim() удаляет лишние пробелы в начале и конце строки
}

// --- Основной массив с SVG-иконками ---
// Создаем массив, где индекс будет соответствовать дню месяца.
// Индекс 0 оставляем пустым для удобства (чтобы день 1 был в calendarIconSvgs[1]).
const calendarIconSvgs = [null]; // calendarIconSvgs[0] будет null

for (let day = 1; day <= 31; day++) {
    calendarIconSvgs.push(generateCalendarSvg(day));
}

// --- Функция для установки Favicon ---
// Вы можете вызывать эту функцию из вашего основного скрипта.
function setFavicon(day) {
    const favicon = document.querySelector("link[rel='shortcut icon']");
    if (!favicon) {
        console.error("Тег <link rel='shortcut icon'> не найден!");
        return;
    }

    if (day < 1 || day > 31 || !calendarIconSvgs[day]) {
        console.error(`Неверный день: ${day}. Допустимы значения от 1 до 31.`);
        return;
    }

    // Получаем SVG-код из нашего массива
    const svgString = calendarIconSvgs[day];

    // Преобразуем SVG-строку в формат Data URI, который можно использовать в href
    // encodeURIComponent необходим для корректной обработки символов в строке SVG
    const dataUri = 'data:image/svg+xml,' + encodeURIComponent(svgString);
    
    // Устанавливаем новый favicon
    favicon.href = dataUri;
}