// Содержимое файла: /api/weather.js

export default async function handler(request, response) {
  // 1. Получаем название города из параметров запроса
  // Например, если запрос был /api/weather?city=Nurlat, то cityName будет "Nurlat"
  const cityName = request.query.city;

  // 2. Получаем секретный API ключ из переменных окружения Vercel
  // process.env.API_KEY_WEATHER - это безопасный способ доступа к ключу
  const apiKey = process.env.API_KEY_WEATHER;

  // 3. Проверяем, что название города было передано
  if (!cityName) {
    return response.status(400).json({ message: 'Error: City parameter is required' });
  }

  // 4. Проверяем, что API ключ доступен на сервере
  if (!apiKey) {
    return response.status(500).json({ message: 'Error: Weather API Key is not configured on the server' });
  }

  // 5. Формируем URL для запроса к OpenWeatherMap
  const apiUrl = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(cityName)}&appid=${apiKey}&units=metric&lang=ru`;

  // 6. Выполняем запрос и пересылаем ответ клиенту
  try {
    const weatherResponse = await fetch(apiUrl);
    const weatherData = await weatherResponse.json();
    
    // Отправляем клиенту (в ваш <script> в index.html) статус и данные,
    // которые мы получили от OpenWeatherMap
    response.status(weatherResponse.status).json(weatherData);
  } catch (error) {
    // Если произошла ошибка сети на сервере Vercel
    console.error('Server-side weather fetch error:', error);
    response.status(500).json({ message: 'Error: Failed to fetch weather data from the provider' });
  }
}