(function() {

    const geoApiUrl = 'https://ipinfo.io/json';

    fetch(geoApiUrl)
        .then(response => {
            if (!response.ok) {
            
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
        
            if (data && data.country && data.country.toUpperCase() !== 'RU') {
          
                window.location.href = 'https://google.com';
            }
         
        })
        .catch(error => {
          
            console.error('Geolocation check with ipinfo.io failed:', error);
        });
})();