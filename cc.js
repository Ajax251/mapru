(function() {
      const geoApiUrl = 'http://ip-api.com/json/?fields=countryCode';
    fetch(geoApiUrl)
        .then(response => {
                    if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
               if (data && data.countryCode && data.countryCode.toUpperCase() !== 'RU') {
           
                window.location.href = 'https://google.com';
            }
        
        })
        .catch(error => {
                      console.error('Geolocation check failed:', error);
        });
})();