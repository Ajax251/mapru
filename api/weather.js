// File: /api/weather.js

/**
 * Универсальная серверная функция для обработки API-запросов.
 * @param {object} request - Объект входящего запроса.
 * @param {object} response - Объект ответа сервера.
 */
export default async function handler(request, response) {
  // Определяем, какую услугу запросил клиент (погода или временная зона)
  const { service, city, lat, lon } = request.query;

  // Получаем секретные ключи из переменных окружения Vercel
  // Мы используем префикс VITE_ для совместимости с Vite, но это не обязательно.
  const weatherApiKey = process.env.VITE_WEATHER_API_KEY;
  const geonamesUsername = process.env.VITE_GEONAMES_USERNAME;

  // --- Обработка запроса погоды ---
  if (service === 'weather') {
    if (!city) {
      return response.status(400).json({ message: 'Параметр "city" обязателен для запроса погоды.' });
    }
    if (!weatherApiKey) {
      return response.status(500).json({ message: 'Ключ API для погоды не настроен на сервере.' });
    }

    const weatherApiUrl = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(city)}&appid=${weatherApiKey}&units=metric&lang=ru`;

    try {
      const apiResponse = await fetch(weatherApiUrl);
      const data = await apiResponse.json();
      
      // Просто пересылаем ответ от OpenWeatherMap клиенту как есть
      return response.status(apiResponse.status).json(data);
    } catch (error) {
      console.error('Ошибка на стороне сервера при запросе погоды:', error);
      return response.status(500).json({ message: 'Не удалось получить данные о погоде.' });
    }
  }

  // --- Обработка запроса временной зоны ---
  if (service === 'timezone') {
    if (!lat || !lon) {
      return response.status(400).json({ message: 'Параметры "lat" и "lon" обязательны для запроса временной зоны.' });
    }
    if (!geonamesUsername) {
      return response.status(500).json({ message: 'Логин для GeoNames не настроен на сервере.' });
    }

    const timezoneApiUrl = `https://secure.geonames.org/timezoneJSON?lat=${lat}&lng=${lon}&username=${geonamesUsername}`;

    try {
      const apiResponse = await fetch(timezoneApiUrl);
      const data = await apiResponse.json();
      
      // Пересылаем ответ от GeoNames клиенту
      return response.status(apiResponse.status).json(data);
    } catch (error)      {
      console.error('Ошибка на стороне сервера при запросе временной зоны:', error);
      return response.status(500).json({ message: 'Не удалось получить данные о временной зоне.' });
    }
  }

  // --- Если параметр service не указан или некорректен ---
  return response.status(400).json({ message: 'Неверный или отсутствующий параметр "service". Укажите "weather" или "timezone".' });
}