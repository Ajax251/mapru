(function() {
    const token = '68161af8281afe';
    const allowedRegionKeyword = 'Tatarstan';
    // const allowedPrefixes = ['1..']; 
    const storageKey = 'geo_access_permit';
    const cacheTime = 24 * 60 * 60 * 1000;

    try {
        const cachedData = localStorage.getItem(storageKey);
        if (cachedData) {
            const parsedData = JSON.parse(cachedData);
            if (parsedData.expiry > Date.now()) {
                return;
            }
        }
    } catch (e) {}

    fetch(`https://ipinfo.io/json?token=${token}`)
        .then(response => {
            if (!response.ok) throw new Error('IP Service Error');
            return response.json();
        })
        .then(data => {
            const userIp = data.ip || '';
            const userRegion = data.region || '';

         
            // const isIpAllowed = allowedPrefixes.some(prefix => userIp.startsWith(prefix));
            
            const isRegionAllowed = userRegion.includes(allowedRegionKeyword);

        
            if (/* isIpAllowed || */ isRegionAllowed) {
                localStorage.setItem(storageKey, JSON.stringify({
                    expiry: Date.now() + cacheTime
                }));
                return;
            }

            const checkElement = document.getElementById('roscadastresButton') || document.getElementById('schemaIcon');

            if (checkElement) {
                var style = document.createElement('style');
                style.innerHTML = `
                    #roscadastresButton,
                    #addressMapButton,
                    #egrpButton,
                    #schemaIcon {
                        display: none !important;
                    }
                `;
                document.head.appendChild(style);
            } else {
                window.location.href = 'https://vsemap.ru';
            }
        })
        .catch(error => {
            console.error(error);
        });
})();